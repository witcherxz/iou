import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { requireOptionalNativeModule } from 'expo';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytesAsync } from 'expo-crypto';
import { Platform } from 'react-native';

import { embeddedBackup, embeddedJson, MAX_PORTABLE_BYTES, parseReadableBackup, readableFiles } from './readable';
import { InvalidBackupError } from './types';
import { deriveBackupKey, NativeBackupKeyDeriver, PASSWORD_ITERATIONS } from './passwordKey';

export { PASSWORD_ITERATIONS } from './passwordKey';

export const ENCRYPTED_DATA_ID = 'iou-encrypted-data';
const AAD = 'IoU portable backup v1';
const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/** Bounded chunks avoid argument/string limits for older native byte-object exports. */
function bytesToBase64(bytes: Uint8Array): string {
  const chunks: string[] = [];
  for (let start = 0; start < bytes.length; start += 12_288) {
    let chunk = '';
    for (let i = start; i < Math.min(start + 12_288, bytes.length); i += 3) {
      const a = bytes[i], b = bytes[i + 1] ?? 0, c = bytes[i + 2] ?? 0;
      chunk += BASE64[a >> 2] + BASE64[((a & 3) << 4) | (b >> 4)] +
        (i + 1 < bytes.length ? BASE64[((b & 15) << 2) | (c >> 6)] : '=') +
        (i + 2 < bytes.length ? BASE64[c & 63] : '=');
    }
    chunks.push(chunk);
  }
  return chunks.join('');
}

function portableCiphertext(value: unknown): string {
  if (typeof value === 'string') return value;
  // Older Android Expo builds serialized Uint8Array as a contiguous numeric-key object.
  // Recover only that exact shape; AES-GCM still authenticates every recovered byte.
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new InvalidBackupError();
  const keys = Object.keys(value);
  if (keys.length < 16 || keys.length > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  const bytes = new Uint8Array(keys.length);
  for (let i = 0; i < keys.length; i++) {
    const byte = (value as Record<string, unknown>)[keys[i]];
    if (keys[i] !== String(i) || typeof byte !== 'number' || !Number.isInteger(byte) || byte < 0 || byte > 255) throw new InvalidBackupError();
    bytes[i] = byte;
  }
  return bytesToBase64(bytes);
}
const nativeCrypto = Platform.OS === 'web' ? null : requireOptionalNativeModule<{
  supported: boolean;
  deriveBackupKey?: NativeBackupKeyDeriver;
}>('IouPrivacyCrypto');
export interface EncryptedBackup {
  format: 'iou-encrypted-backup';
  version: 1;
  cipher: 'AES-256-GCM';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  salt: string;
  nonce: string;
  /** Standard base64 ciphertext, followed by the 16-byte authentication tag. */
  ciphertext: string;
}
export class BackupPasswordError extends Error {
  constructor() { super('كلمة المرور غير صحيحة أو الملف تالف'); this.name = 'BackupPasswordError'; }
}

export function encryptedEnvelope(text: string): EncryptedBackup | null {
  if (text.length > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  if (text.trimStart().startsWith('<') && !text.includes(`id="${ENCRYPTED_DATA_ID}"`)) return null;
  let value: unknown;
  try { value = JSON.parse(embeddedBackup(text, ENCRYPTED_DATA_ID).trimStart()); } catch { throw new InvalidBackupError(); }
  if (!value || typeof value !== 'object' || !('format' in value) || value.format !== 'iou-encrypted-backup') return null;
  const e = value as EncryptedBackup;
  if (e.version !== 1 || e.cipher !== 'AES-256-GCM' || e.kdf !== 'PBKDF2-SHA256' || e.iterations !== PASSWORD_ITERATIONS ||
    typeof e.salt !== 'string' || !/^[0-9a-f]{32}$/.test(e.salt) || typeof e.nonce !== 'string' || !/^[0-9a-f]{24}$/.test(e.nonce)) throw new InvalidBackupError();
  const ciphertext = portableCiphertext(e.ciphertext);
  if (ciphertext.length < 24 || ciphertext.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(ciphertext)) throw new InvalidBackupError();
  return { ...e, ciphertext };
}

async function keyFor(password: string, salt: string): Promise<AESEncryptionKey> {
  if (!password || password.length > 1024) throw new BackupPasswordError();
  const bytes = await deriveBackupKey(password, salt, nativeCrypto?.supported && typeof nativeCrypto.deriveBackupKey === 'function'
    ? (passwordHex, saltHex, iterations) => nativeCrypto.deriveBackupKey!(passwordHex, saltHex, iterations) : undefined);
  try { return await AESEncryptionKey.import(bytes); } finally { bytes.fill(0); }
}

export async function decryptBackup(text: string, password: string): Promise<string> {
  const envelope = encryptedEnvelope(text);
  if (!envelope) throw new InvalidBackupError();
  // A failed native worker is an operation failure, not a wrong password retry.
  const key = await keyFor(password, envelope.salt);
  try {
    const sealed = AESSealedData.fromParts(hexToBytes(envelope.nonce), envelope.ciphertext, 16);
    const plaintext = new TextDecoder().decode(await aesDecryptAsync(sealed, key, { additionalData: new TextEncoder().encode(AAD) }));
    return JSON.stringify(parseReadableBackup(plaintext));
  } catch { throw new BackupPasswordError(); }
}

/** Browser-readable encrypted report; the password/key never enters device storage. */
export async function encryptBackup(text: string, password: string): Promise<string> {
  if (password.length < 10 || password.length > 1024) throw new Error('استخدم كلمة مرور من 10 أحرف على الأقل');
  const report = readableFiles(text)[0].text;
  const salt = bytesToHex(await getRandomBytesAsync(16));
  const nonce = await getRandomBytesAsync(12);
  const key = await keyFor(password, salt);
  const plaintext = new TextEncoder().encode(report);
  const sealed = await aesEncryptAsync(plaintext, key, {
    nonce: { bytes: nonce }, tagLength: 16, additionalData: new TextEncoder().encode(AAD),
  });
  // SDK 57 Android ignores ciphertext({ encoding }) and returns bytes. combined's
  // positional encoding works on every platform. A 12-byte IV is exactly 16 base64
  // characters, so removing this verified prefix retains ciphertext + tag unchanged.
  const combined = await sealed.combined('base64');
  if (sealed.ivSize !== 12 || sealed.tagSize !== 16 || typeof combined !== 'string' ||
    combined.length !== 4 * Math.ceil((12 + plaintext.length + 16) / 3) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(combined) || !combined.startsWith(bytesToBase64(nonce))) throw new InvalidBackupError();
  const envelope: EncryptedBackup = {
    format: 'iou-encrypted-backup', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: PASSWORD_ITERATIONS,
    salt, nonce: bytesToHex(nonce), ciphertext: combined.slice(16),
  };
  const result = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>نسخة دفتر محمية</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:10vh auto;padding:24px;line-height:1.7;color:#1d1b20;background:#faf8fc}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:14px;margin-top:12px;border:1px solid #777680;border-radius:8px}button{background:#385784;color:white;border-radius:24px;cursor:pointer}button:disabled{opacity:.6}#error{color:#ba1a1a}h1{font-size:28px;font-weight:500}</style></head><body><h1>نسخة دفتر محمية</h1><p>أدخل كلمة المرور لفتح التقرير والجداول دون التطبيق. تبقى كلمة المرور والبيانات على هذا الجهاز ولا يتم إرسالها إلى الإنترنت.</p><form id="unlock"><label for="password">كلمة مرور النسخة</label><input id="password" type="password" autocomplete="current-password" required maxlength="1024"><button id="submit" type="submit">فتح النسخة</button><p id="error" role="alert"></p></form><p>يمكن أيضاً استعادة هذا الملف داخل IoU. إذا لم يدعم المتصفح فتحه محلياً، استخدم متصفحاً حديثاً على الكمبيوتر أو استعده داخل التطبيق.</p><script id="${ENCRYPTED_DATA_ID}" type="application/json">${embeddedJson(envelope)}</script><script>
document.getElementById('unlock').addEventListener('submit',async function(event){event.preventDefault();const button=document.getElementById('submit');const field=document.getElementById('password');const error=document.getElementById('error');button.disabled=true;error.textContent='جارٍ فتح النسخة…';try{if(!globalThis.crypto||!crypto.subtle)throw new Error('unsupported');const e=JSON.parse(document.getElementById('${ENCRYPTED_DATA_ID}').textContent);const hex=s=>Uint8Array.from(s.match(/../g),h=>parseInt(h,16));const bytes=Uint8Array.from(atob(e.ciphertext),c=>c.charCodeAt(0));const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(field.value),'PBKDF2',false,['deriveKey']);field.value='';const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:hex(e.salt),iterations:e.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:hex(e.nonce),tagLength:128,additionalData:new TextEncoder().encode('${AAD}')},key,bytes);document.open();document.write(new TextDecoder().decode(clear));document.close();}catch(e){error.textContent=e.message==='unsupported'?'استخدم متصفحاً حديثاً أو استعد الملف داخل التطبيق.':'كلمة المرور غير صحيحة أو الملف تالف';button.disabled=false;field.focus();}});
</script></body></html>`;
  if (new TextEncoder().encode(result).byteLength > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  return result;
}
