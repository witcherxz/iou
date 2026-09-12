import assert from 'node:assert/strict';
import { pbkdf2Sync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

// Compile the actual Android worker's crypto class independently of Android/Expo.
// Node's crypto implementation supplies independent, public test-vector oracles.
const directory = mkdtempSync(join(tmpdir(), 'iou-pin-checks-'));
const java = name => process.env.JAVA_HOME ? join(process.env.JAVA_HOME, 'bin', name) : name;
const run = (command, args) => {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.error) throw result.error;
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
};
const vectors = [
  ['123456', '0123456789abcdef0123456789abcdef'],
  ['0000', '00000000000000000000000000000000'],
  ['00123', 'ffffffffffffffffffffffffffffffff'],
];
try {
  const checks = vectors.map(([pin, salt]) => {
    const expected = pbkdf2Sync(pin, Buffer.from(salt, 'hex'), 600_000, 32, 'sha256').toString('hex');
    return `check(PinKdf.derive("${pin}", "${salt}", 600_000).equals("${expected}"));`;
  }).join('\n');
  const source = join(directory, 'NativePinChecks.java');
  writeFileSync(source, `import expo.modules.iouprivacycrypto.PinKdf;
public class NativePinChecks {
  private static int passed = 0;
  private static void check(boolean result) { if (!result) throw new AssertionError("PIN verifier mismatch"); passed++; }
  private static void reject(String pin, String salt, int iterations) throws Exception {
    try { PinKdf.derive(pin, salt, iterations); }
    catch (IllegalArgumentException expected) { passed++; return; }
    throw new AssertionError("Invalid derivation accepted");
  }
  public static void main(String[] args) throws Exception {
    ${checks}
    reject("123", "0123456789abcdef0123456789abcdef", 600_000);
    reject("1234567", "0123456789abcdef0123456789abcdef", 600_000);
    reject("١٢٣٤", "0123456789abcdef0123456789abcdef", 600_000);
    reject("1234", "invalid", 600_000);
    reject("1234", "0123456789abcdef0123456789abcdef", 1);
    System.out.println("Native PIN checks: " + passed + " passed.");
  }
}
`);
  run(java('javac'), ['-d', directory, resolve('modules/iou-privacy-crypto/android/src/main/java/expo/modules/iouprivacycrypto/PinKdf.java'), source]);
  process.stdout.write(run(java('java'), ['-cp', directory, 'NativePinChecks']));
} finally { rmSync(directory, { recursive: true, force: true }); }
