/** Expo crypto adapter for portable-format tests; native behavior is device-tested separately. */
const { randomBytes, webcrypto } = require('node:crypto') as { randomBytes: (size: number) => Uint8Array; webcrypto: Crypto };
const { Buffer } = require('node:buffer');
const bytes = (value: Uint8Array | string) => typeof value === 'string' ? new Uint8Array(Buffer.from(value, 'base64')) : value;
export const aesNativeState = { malformedCombined: '' as '' | 'bytes' | 'nonce' | 'truncated' | 'encoding', invalidSizes: false };
export const getRandomBytesAsync = async (length: number) => new Uint8Array(randomBytes(length));
export class AESEncryptionKey {
  constructor(public key: CryptoKey) {}
  static async import(raw: Uint8Array) {
    return new AESEncryptionKey(await webcrypto.subtle.importKey('raw', new Uint8Array(raw), 'AES-GCM', false, ['encrypt', 'decrypt']));
  }
}
export class AESSealedData {
  constructor(public nonce: Uint8Array, public data: Uint8Array) {}
  get ivSize() { return aesNativeState.invalidSizes ? 16 : this.nonce.length; }
  get tagSize() { return 16; }
  static fromParts(nonce: Uint8Array, encrypted: string, tagLength: number) {
    if (tagLength !== 16) throw new Error('Unexpected tag');
    return new AESSealedData(nonce, bytes(encrypted));
  }
  async ciphertext(options: { includeTag?: boolean; encoding?: string; outputFormat?: string }) {
    // Exact SDK 57 Android contract: outputFormat, not the TS/web encoding property.
    const data = options.includeTag ? this.data : this.data.subarray(0, -16);
    return options.outputFormat === 'base64' ? Buffer.from(data).toString('base64') : new Uint8Array(data);
  }
  async combined(encoding: string) {
    if (encoding !== 'base64') throw new Error('Unexpected encoding');
    const all = Buffer.concat([this.nonce, this.data]);
    if (aesNativeState.malformedCombined === 'bytes') return new Uint8Array(all);
    if (aesNativeState.malformedCombined === 'nonce') all[0] ^= 1;
    if (aesNativeState.malformedCombined === 'truncated') return all.subarray(0, -3).toString('base64');
    if (aesNativeState.malformedCombined === 'encoding') return '!'.repeat(all.toString('base64').length);
    return all.toString('base64');
  }
}
export async function aesEncryptAsync(plaintext: Uint8Array, key: AESEncryptionKey, options: { nonce: { bytes: Uint8Array }; tagLength: number; additionalData: Uint8Array }) {
  return new AESSealedData(options.nonce.bytes, new Uint8Array(await webcrypto.subtle.encrypt({ name: 'AES-GCM', iv: new Uint8Array(options.nonce.bytes), tagLength: options.tagLength * 8, additionalData: new Uint8Array(options.additionalData) }, key.key, new Uint8Array(plaintext))));
}
export async function aesDecryptAsync(sealed: AESSealedData, key: AESEncryptionKey, options: { additionalData: Uint8Array }) {
  return new Uint8Array(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(sealed.nonce), tagLength: 128, additionalData: new Uint8Array(options.additionalData) }, key.key, new Uint8Array(sealed.data)));
}
