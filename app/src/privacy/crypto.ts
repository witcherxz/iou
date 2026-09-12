import { pbkdf2Async } from '@noble/hashes/pbkdf2.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes } from '@noble/hashes/utils.js';

export type NativePinDeriver = (pin: string, saltHex: string, iterations: number) => Promise<string>;

/** Native worker/WebCrypto first; the JS path is for older Android and Expo Go. */
export async function derivePin(pin: string, saltHex: string, iterations: number, nativeDerive?: NativePinDeriver): Promise<string> {
  if (nativeDerive) {
    const verifier = await nativeDerive(pin, saltHex, iterations);
    if (!/^[0-9a-f]{64}$/.test(verifier)) throw new Error('Invalid native PIN verifier');
    return verifier;
  }
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
