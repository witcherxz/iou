import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';
import { AESEncryptionKey, AESSealedData, aesDecryptAsync, aesEncryptAsync, getRandomBytesAsync } from 'expo-crypto';

import { embeddedBackup, embeddedJson, MAX_PORTABLE_BYTES, parseReadableBackup, readableFiles } from './readable';
import { InvalidBackupError } from './types';

export const ENCRYPTED_DATA_ID = 'iou-encrypted-data';
export const PASSWORD_ITERATIONS = 600_000;
const AAD = 'IoU portable backup v1';
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
    typeof e.salt !== 'string' || !/^[0-9a-f]{32}$/.test(e.salt) || typeof e.nonce !== 'string' || !/^[0-9a-f]{24}$/.test(e.nonce) ||
    typeof e.ciphertext !== 'string' || e.ciphertext.length < 24 || e.ciphertext.length % 4 !== 0 || !/^[A-Za-z0-9+/]*={0,2}$/.test(e.ciphertext)) throw new InvalidBackupError();
  return e;
}

async function keyFor(password: string, salt: string): Promise<AESEncryptionKey> {
  if (!password || password.length > 1024) throw new BackupPasswordError();
  const input = new TextEncoder().encode(password);
  const saltBytes = hexToBytes(salt);
  let bytes: Uint8Array;
  if (globalThis.crypto?.subtle) {
    const material = await globalThis.crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
    bytes = new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(saltBytes), iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, material, 256));
  } else {
    bytes = await pbkdf2Async(sha256, input, saltBytes, { c: PASSWORD_ITERATIONS, dkLen: 32, asyncTick: 10 });
  }
  try { return await AESEncryptionKey.import(bytes); } finally { bytes.fill(0); }
}

export async function decryptBackup(text: string, password: string): Promise<string> {
  const envelope = encryptedEnvelope(text);
  if (!envelope) throw new InvalidBackupError();
  try {
    const key = await keyFor(password, envelope.salt);
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
  const sealed = await aesEncryptAsync(new TextEncoder().encode(report), key, {
    nonce: { bytes: nonce }, tagLength: 16, additionalData: new TextEncoder().encode(AAD),
  });
  const envelope: EncryptedBackup = {
    format: 'iou-encrypted-backup', version: 1, cipher: 'AES-256-GCM', kdf: 'PBKDF2-SHA256', iterations: PASSWORD_ITERATIONS,
    salt, nonce: bytesToHex(nonce), ciphertext: await sealed.ciphertext({ includeTag: true, encoding: 'base64' }),
  };
  const result = `<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>نسخة دفتر محمية</title><style>body{font-family:system-ui,sans-serif;max-width:520px;margin:10vh auto;padding:24px;line-height:1.7;color:#1d1b20;background:#faf8fc}label,input,button{display:block;width:100%;box-sizing:border-box}input,button{font:inherit;padding:14px;margin-top:12px;border:1px solid #777680;border-radius:8px}button{background:#385784;color:white;border-radius:24px;cursor:pointer}button:disabled{opacity:.6}#error{color:#ba1a1a}h1{font-size:28px;font-weight:500}</style></head><body><h1>نسخة دفتر محمية</h1><p>أدخل كلمة المرور لفتح التقرير والجداول دون التطبيق. تبقى كلمة المرور والبيانات على هذا الجهاز ولا يتم إرسالها إلى الإنترنت.</p><form id="unlock"><label for="password">كلمة مرور النسخة</label><input id="password" type="password" autocomplete="current-password" required maxlength="1024"><button id="submit" type="submit">فتح النسخة</button><p id="error" role="alert"></p></form><p>يمكن أيضاً استعادة هذا الملف داخل IoU. إذا لم يدعم المتصفح فتحه محلياً، استخدم متصفحاً حديثاً على الكمبيوتر أو استعده داخل التطبيق.</p><script id="${ENCRYPTED_DATA_ID}" type="application/json">${embeddedJson(envelope)}</script><script>
document.getElementById('unlock').addEventListener('submit',async function(event){event.preventDefault();const button=document.getElementById('submit');const field=document.getElementById('password');const error=document.getElementById('error');button.disabled=true;error.textContent='جارٍ فتح النسخة…';try{if(!globalThis.crypto||!crypto.subtle)throw new Error('unsupported');const e=JSON.parse(document.getElementById('${ENCRYPTED_DATA_ID}').textContent);const hex=s=>Uint8Array.from(s.match(/../g),h=>parseInt(h,16));const bytes=Uint8Array.from(atob(e.ciphertext),c=>c.charCodeAt(0));const material=await crypto.subtle.importKey('raw',new TextEncoder().encode(field.value),'PBKDF2',false,['deriveKey']);field.value='';const key=await crypto.subtle.deriveKey({name:'PBKDF2',salt:hex(e.salt),iterations:e.iterations,hash:'SHA-256'},material,{name:'AES-GCM',length:256},false,['decrypt']);const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:hex(e.nonce),tagLength:128,additionalData:new TextEncoder().encode('${AAD}')},key,bytes);document.open();document.write(new TextDecoder().decode(clear));document.close();}catch(e){error.textContent=e.message==='unsupported'?'استخدم متصفحاً حديثاً أو استعد الملف داخل التطبيق.':'كلمة المرور غير صحيحة أو الملف تالف';button.disabled=false;field.focus();}});
</script></body></html>`;
  if (new TextEncoder().encode(result).byteLength > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  return result;
}
