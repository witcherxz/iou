const assert = require('node:assert/strict');
const { createCipheriv, createDecipheriv, pbkdf2Sync } = require('node:crypto');
const { Buffer } = require('node:buffer');
import { BackupPasswordError, decryptBackup, encryptBackup, encryptedEnvelope, PASSWORD_ITERATIONS } from '../src/backup/encrypted';
import { parseReadableBackup, readableFiles } from '../src/backup/readable';
import { InvalidBackupError, parseBackup, serialize } from '../src/backup/types';
import { seedState } from './fixtures/ledger';

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
