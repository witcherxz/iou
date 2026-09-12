import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

/** WebCrypto where available, audited-library PBKDF2 on Hermes. Never a fast PIN hash. */
export async function derivePin(pin: string, saltHex: string, iterations: number): Promise<string> {
  const password = Uint8Array.from(pin, digit => digit.charCodeAt(0));
  const salt = hexToBytes(saltHex);
  try {
    if (globalThis.crypto?.subtle) {
      const key = await globalThis.crypto.subtle.importKey('raw', password, 'PBKDF2', false, ['deriveBits']);
      const bits = await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: new Uint8Array(salt).buffer, iterations }, key, 256);
      return bytesToHex(new Uint8Array(bits));
    }
    const result = await pbkdf2Async(sha256, password, salt, { c: iterations, dkLen: 32, asyncTick: 10 });
    const hex = bytesToHex(result);
    result.fill(0);
    return hex;
  } finally { password.fill(0); salt.fill(0); }
}
