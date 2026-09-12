import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export const PASSWORD_ITERATIONS = 600_000;
export type NativeBackupKeyDeriver = (passwordHex: string, saltHex: string, iterations: number) => Promise<string>;

/** Exact UTF-8 bytes keep native, WebCrypto and existing portable backups compatible. */
export async function deriveBackupKey(password: string, saltHex: string, nativeDerive?: NativeBackupKeyDeriver): Promise<Uint8Array> {
  if (!password || password.length > 1024 || !/^[0-9a-f]{32}$/.test(saltHex)) throw new Error('Invalid backup key parameters');
  const input = new TextEncoder().encode(password);
  const salt = hexToBytes(saltHex);
  try {
    if (nativeDerive) {
      // TextEncoder also replaces lone surrogates exactly as previous exports did.
      const key = await nativeDerive(bytesToHex(input), saltHex, PASSWORD_ITERATIONS);
      if (!/^[0-9a-f]{64}$/.test(key)) throw new Error('Invalid native backup key');
      return hexToBytes(key);
    }
    if (globalThis.crypto?.subtle) {
      const material = await globalThis.crypto.subtle.importKey('raw', input, 'PBKDF2', false, ['deriveBits']);
      return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', salt: new Uint8Array(salt),
        iterations: PASSWORD_ITERATIONS, hash: 'SHA-256' }, material, 256));
    }
    // Compatibility for Expo Go / Android 7; a supported native error is never retried here.
    return await pbkdf2Async(sha256, input, salt, { c: PASSWORD_ITERATIONS, dkLen: 32, asyncTick: 10 });
  } finally { input.fill(0); salt.fill(0); }
}
