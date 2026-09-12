import type { NativeBackupKeyDeriver } from '../src/backup/passwordKey';

const { pbkdf2 } = require('node:crypto');
const { Buffer } = require('node:buffer');
export const backupKeyNativeState = { calls: 0, fail: false, invalid: false };
const derive: NativeBackupKeyDeriver = async (passwordHex, saltHex, iterations) => {
  backupKeyNativeState.calls++;
  if (backupKeyNativeState.fail) throw new Error('Native derivation test failure');
  if (backupKeyNativeState.invalid) return 'invalid';
  return new Promise<string>((resolve, reject) => {
    pbkdf2(Buffer.from(passwordHex, 'hex'), Buffer.from(saltHex, 'hex'), iterations, 32, 'sha256', (error: Error | null, key: { toString: (encoding: string) => string }) => {
      if (error) reject(error); else resolve(key.toString('hex'));
    });
  });
};
export const nativeBackupCrypto: { supported: boolean; deriveBackupKey?: NativeBackupKeyDeriver } = { supported: false, deriveBackupKey: derive };
export function requireOptionalNativeModule(name: string) {
  if (name !== 'IouPrivacyCrypto') throw new Error('Unexpected native module request');
  return nativeBackupCrypto;
}
