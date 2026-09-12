import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Compile the actual Android worker and compare its bytes with independent Node
// PBKDF2. Only synthetic fixtures are used; output never includes password/key data.
const directory = mkdtempSync(join(tmpdir(), 'iou-backup-key-checks-'));
const java = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name;
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8', timeout: 60_000 });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const salt = '0123456789abcdef0123456789abcdef';
const vectors = [
  ['ascii', 'public test backup password'],
  ['arabic', 'عبارة اختبار عامة 123'],
  ['emoji', '🔐 test 😀 password'],
  ['combining', 'cafe\u0301 معرّف'],
  ['spaces', '  public\tpassword\n '],
  ['embedded-nul', 'public\u0000test password'],
  ['lone-high', 'public \ud800 password'],
  ['lone-low', 'public \udc00 password'],
  ['hmac-long', 'عبارة اختبار '.repeat(20)],
  ['max-utf16', '😀'.repeat(512)],
  ['max-three-byte', '字'.repeat(1024)],
  ['surrogate-at-limit', 'a'.repeat(1023) + '\ud800'],
];
try {
  const checks = vectors.map(([label, password]) => {
    const bytes = new TextEncoder().encode(password);
    const expected = pbkdf2Sync(bytes, Buffer.from(salt, 'hex'), 600_000, 32, 'sha256').toString('hex');
    return `check("${label}", BackupKdf.derive("${Buffer.from(bytes).toString('hex')}", SALT, 600_000).equals("${expected}"));`;
  }).join('\n');
  const source = join(directory, 'NativeBackupKeyChecks.java');
  writeFileSync(source, `import expo.modules.iouprivacycrypto.BackupKdf;
public class NativeBackupKeyChecks {
  private static int passed = 0;
  private static final String SALT = "${salt}";
  private static void check(String label, boolean result) { if (!result) throw new AssertionError("Backup key mismatch: " + label); passed++; }
  private static void reject(String hex, String salt, int iterations) throws Exception {
    try { BackupKdf.derive(hex, salt, iterations); }
    catch (IllegalArgumentException expected) { passed++; return; }
    throw new AssertionError("Invalid backup derivation accepted");
  }
  public static void main(String[] args) throws Exception {
    ${checks}
    reject("", SALT, 600_000);
    reject(null, SALT, 600_000);
    reject("0", SALT, 600_000);
    reject("GG", SALT, 600_000);
    reject("41", "invalid", 600_000);
    reject("41", SALT, 1);
    reject("41", SALT, 600_001);
    reject("c080", SALT, 600_000);
    reject("eda080", SALT, 600_000);
    reject("61".repeat(1025), SALT, 600_000);
    reject("61".repeat(4097), SALT, 600_000);
    System.out.println("Native backup key checks: " + passed + " passed.");
  }
}
`);
  run(java('javac'), ['-d', directory, resolve('modules/iou-privacy-crypto/android/src/main/java/expo/modules/iouprivacycrypto/BackupKdf.java'), source]);
  process.stdout.write(run(java('java'), ['-cp', directory, 'NativeBackupKeyChecks']));
} finally { rmSync(directory, { recursive: true, force: true }); }
