const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, pbkdf2Sync } = require('node:crypto');
const { Buffer } = require('node:buffer');
import { BackupPasswordError, decryptBackup, encryptBackup, encryptedEnvelope, PASSWORD_ITERATIONS } from '../src/backup/encrypted';
import { parseReadableBackup, readableFiles } from '../src/backup/readable';
import { InvalidBackupError, parseBackup, serialize } from '../src/backup/types';
import { seedState } from './fixtures/ledger';
import { deriveBackupKey } from '../src/backup/passwordKey';
import { bytesToHex } from '@noble/hashes/utils.js';
import { backupKeyNativeState, nativeBackupCrypto } from './backup-password-native-stub';

let count = 0;
const check = (name: string, run: () => void) => { run(); count++; console.log(`PASS ${name}`); };
async function main() {
  const state = { ...seedState(), profileName: 'أسرار الدفتر', backupFolderUri: 'private/path' };
  const original = serialize(state);
  const password = 'عبارة خاصة 123';
  const protectedHtml = await encryptBackup(original, password);
  const envelope = encryptedEnvelope(protectedHtml)!;
  check('protected HTML reveals neither ledger nor password', () => {
    for (const secret of [state.profileName, state.people[0].name, password, state.backupFolderUri]) assert.ok(!protectedHtml.includes(secret));
    assert.equal(envelope.iterations, PASSWORD_ITERATIONS);
  });
  const decrypted = await decryptBackup(protectedHtml, password);
  check('encrypted HTML restores the complete portable ledger', () => assert.deepEqual(parseBackup(decrypted), parseBackup(original)));
  const key = pbkdf2Sync(password, Buffer.from(envelope.salt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256');
  const combined = Buffer.from(envelope.ciphertext, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.nonce, 'hex'));
  decipher.setAAD(Buffer.from('IoU portable backup v1'));
  decipher.setAuthTag(combined.subarray(-16));
  const independentClear = Buffer.concat([decipher.update(combined.subarray(0, -16)), decipher.final()]).toString('utf8');
  check('independent Node AES-GCM and PBKDF2 opens the export', () => assert.deepEqual(parseReadableBackup(independentClear), parseBackup(original)));
  const second = encryptedEnvelope(await encryptBackup(original, password))!;
  check('every encrypted export has fresh random salt and nonce', () => {
    assert.notEqual(second.salt, envelope.salt); assert.notEqual(second.nonce, envelope.nonce); assert.notEqual(second.ciphertext, envelope.ciphertext);
  });
  await assert.rejects(decryptBackup(protectedHtml, 'incorrect password'), BackupPasswordError);
  check('wrong password rejects without returning partial data', () => assert.ok(true));
  const damagedBytes = Buffer.from(envelope.ciphertext, 'base64'); damagedBytes[10] ^= 1;
  await assert.rejects(decryptBackup(JSON.stringify({ ...envelope, ciphertext: damagedBytes.toString('base64') }), password), BackupPasswordError);
  check('modified ciphertext fails authentication', () => assert.ok(true));
  const damagedTag = Buffer.from(envelope.ciphertext, 'base64'); damagedTag[damagedTag.length - 1] ^= 1;
  await assert.rejects(decryptBackup(JSON.stringify({ ...envelope, ciphertext: damagedTag.toString('base64') }), password), BackupPasswordError);
  check('modified authentication tag fails authentication', () => assert.ok(true));
  check('unsupported algorithm and expensive iteration injection rejected before KDF', () => {
    for (const patch of [{ version: 2 }, { cipher: 'AES-CBC' }, { iterations: 6_000_000 }, { iterations: 1 }, { salt: 'abc' }, { nonce: '' }, { ciphertext: 'invalid??==' }]) {
      assert.throws(() => encryptedEnvelope(JSON.stringify({ ...envelope, ...patch })), InvalidBackupError);
    }
  });
  await assert.rejects(encryptBackup(original, 'short'));
  check('short export passwords rejected', () => assert.ok(true));
  const independentIv = Buffer.alloc(12, 24);
  const cipher = createCipheriv('aes-256-gcm', key, independentIv);
  cipher.setAAD(Buffer.from('IoU portable backup v1'));
  const encrypted = Buffer.concat([cipher.update(readableFiles(original)[0].text, 'utf8'), cipher.final(), cipher.getAuthTag()]);
  const independentEnvelope = JSON.stringify({ ...envelope, nonce: independentIv.toString('hex'), ciphertext: encrypted.toString('base64') });
  const imported = await decryptBackup(independentEnvelope, password);
  check('app imports a backup produced with independent encryption', () => assert.deepEqual(parseBackup(imported), parseBackup(original)));
  check('ordinary JSON and readable HTML remain unprotected formats', () => {
    assert.equal(encryptedEnvelope(original), null); assert.equal(encryptedEnvelope(readableFiles(original)[0].text), null);
  });
  nativeBackupCrypto.supported = true;
  const beforeNative = backupKeyNativeState.calls;
  const nativeClear = await decryptBackup(independentEnvelope, password);
  check('supported native backup method imports existing independently produced ciphertext', () => {
    assert.equal(backupKeyNativeState.calls, beforeNative + 1);
    assert.deepEqual(parseBackup(nativeClear), parseBackup(original));
  });
  const nativeEnvelope = encryptedEnvelope(await encryptBackup(original, password))!;
  const nativeBytes = Buffer.from(nativeEnvelope.ciphertext, 'base64');
  const nativeDecipher = createDecipheriv('aes-256-gcm', pbkdf2Sync(password, Buffer.from(nativeEnvelope.salt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256'), Buffer.from(nativeEnvelope.nonce, 'hex'));
  nativeDecipher.setAAD(Buffer.from('IoU portable backup v1'));
  nativeDecipher.setAuthTag(nativeBytes.subarray(-16));
  const nativeExportClear = Buffer.concat([nativeDecipher.update(nativeBytes.subarray(0, -16)), nativeDecipher.final()]).toString('utf8');
  check('native export keeps the existing portable format readable by independent crypto', () => assert.deepEqual(parseReadableBackup(nativeExportClear), parseBackup(original)));
  backupKeyNativeState.fail = true;
  await assert.rejects(decryptBackup(independentEnvelope, password), /Native derivation test failure/);
  await assert.rejects(encryptBackup(original, password), /Native derivation test failure/);
  check('actual native failure propagates without silently deriving through WebCrypto', () => assert.ok(true));
  backupKeyNativeState.fail = false;
  backupKeyNativeState.invalid = true;
  await assert.rejects(encryptBackup(original, password), /Invalid native backup key/);
  check('malformed native key fails before AES encryption', () => assert.ok(true));
  backupKeyNativeState.invalid = false;
  const nativeDerive = nativeBackupCrypto.deriveBackupKey!;
  delete nativeBackupCrypto.deriveBackupKey;
  const callsBeforeFallback = backupKeyNativeState.calls;
  const compatibilityClear = await decryptBackup(independentEnvelope, password);
  check('older native module without backup method retains compatibility fallback', () => {
    assert.deepEqual(parseBackup(compatibilityClear), parseBackup(original));
    assert.equal(backupKeyNativeState.calls, callsBeforeFallback);
  });
  nativeBackupCrypto.deriveBackupKey = nativeDerive;
  const unicodeVectors = [
    ['Arabic', 'عبارة اختبار عامة 123'], ['emoji', '🔐 public 😀 password'], ['combining', 'cafe\u0301 معرّف'],
    ['whitespace', '  public\tpassword\n '], ['embedded NUL', 'public\u0000test password'],
    ['lone high surrogate', 'public \ud800 password'], ['lone low surrogate', 'public \udc00 password'],
    ['long HMAC input', 'عبارة اختبار '.repeat(20)], ['UTF16 limit', '😀'.repeat(512)],
    ['multibyte limit', '字'.repeat(1024)],
  ];
  const vectorSalt = '0123456789abcdef0123456789abcdef';
  for (const [label, value] of unicodeVectors) {
    const expected = pbkdf2Sync(new TextEncoder().encode(value), Buffer.from(vectorSalt, 'hex'), PASSWORD_ITERATIONS, 32, 'sha256').toString('hex');
    const nativeKey = await deriveBackupKey(value, vectorSalt, nativeDerive);
    const webKey = await deriveBackupKey(value, vectorSalt);
    check(`${label}: native UTF-8 bridge and WebCrypto match independent existing-format bytes`, () => {
      assert.equal(bytesToHex(nativeKey), expected); assert.equal(bytesToHex(webKey), expected);
    });
    nativeKey.fill(0); webKey.fill(0);
  }
  const callsBeforeInvalid = backupKeyNativeState.calls;
  await assert.rejects(deriveBackupKey('x'.repeat(1025), vectorSalt, nativeDerive));
  await assert.rejects(deriveBackupKey('', vectorSalt, nativeDerive));
  await assert.rejects(deriveBackupKey(password, 'invalid', nativeDerive));
  check('invalid native KDF inputs are rejected before dispatch', () => assert.equal(backupKeyNativeState.calls, callsBeforeInvalid));
  nativeBackupCrypto.supported = false;
  const priorCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  try {
    Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
    const fallbackClear = await decryptBackup(independentEnvelope, password);
    check('native JS password derivation matches independent production-work-factor encryption', () => assert.deepEqual(parseBackup(fallbackClear), parseBackup(original)));
  } finally {
    if (priorCrypto) Object.defineProperty(globalThis, 'crypto', priorCrypto);
    else Reflect.deleteProperty(globalThis, 'crypto');
  }
  console.log(`\n${count} ENCRYPTED BACKUP CHECKS PASSED`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
