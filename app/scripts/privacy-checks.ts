// Node-only test oracle; the application intentionally does not include Node globals.
const { pbkdf2Sync, webcrypto } = require('node:crypto') as {
  pbkdf2Sync: (pin: string, salt: Uint8Array, iterations: number, length: number, digest: string) => { toString(encoding: string): string };
  webcrypto: Crypto;
};
import { PrivacyAdapter, PrivacyController } from '../src/privacy/controller';
import { derivePin } from '../src/privacy/crypto';
import { failedAttempt, LockRecord, normalizePin, parseLockRecord, PIN_ITERATIONS, sameVerifier } from '../src/privacy/policy';

let passed = 0;
function check(condition: unknown, label: string) { if (!condition) throw new Error(label); passed++; }
async function rejects(action: () => Promise<unknown>, label: string) {
  let failed = false;
  try { await action(); } catch { failed = true; }
  check(failed, label);
}
const base: LockRecord = { version: 1, algorithm: 'pbkdf2-sha256', iterations: PIN_ITERATIONS,
  salt: 'abcd'.repeat(8), verifier: 'a'.repeat(64), biometric: true, failedAttempts: 0, blockedUntil: 0 };

function harness() {
  let raw: string | null = null;
  let now = 1_000_000;
  let failures = { read: false, write: false, remove: false };
  let deriveCount = 0;
  let saltIndex = 0;
  let bioResult = true;
  let deferred: Promise<void> | null = null;
  const adapter: PrivacyAdapter = {
    available: async () => true,
    read: async () => { if (failures.read) throw new Error('read failed'); return raw; },
    write: async value => { if (failures.write) throw new Error('write failed'); raw = value; },
    remove: async () => { if (failures.remove) throw new Error('remove failed'); raw = null; },
    randomSalt: async () => (++saltIndex).toString(16).padStart(32, '0'),
    derive: async (pin, salt) => { deriveCount++; if (deferred) await deferred; return (pin + salt).padEnd(64, '0').slice(0, 64); },
    hasBiometrics: async () => true,
    authenticate: async () => { if (deferred) await deferred; return bioResult; },
    now: () => now,
  };
  return { adapter, controller: new PrivacyController(adapter), getRaw: () => raw,
    setRaw: (value: string | null) => { raw = value; }, advance: (ms: number) => { now += ms; },
    failures, deriveCount: () => deriveCount, setBio: (value: boolean) => { bioResult = value; },
    defer: () => { let resolve!: () => void; deferred = new Promise<void>(r => { resolve = r; }); return () => { resolve(); deferred = null; }; } };
}

async function main() {
  check(normalizePin('٠١٢٣٤٥') === '012345', 'Normalize Arabic-Indic digits');
  check(normalizePin('۰۱۲۳۴۵') === '012345', 'Normalize Persian digits');
  check(normalizePin('12 a-345678') === '123456', 'Constrain input to 0–9 and six digits');
  check(parseLockRecord(JSON.stringify(base)).iterations === PIN_ITERATIONS, 'Read supported verifier format');
  for (const invalid of [null, {}, { ...base, iterations: 1 }, { ...base, salt: 'x' }, { ...base, verifier: '1234' },
    { ...base, version: 2 }, { ...base, failedAttempts: -1 }, { ...base, failedAttempts: 1.5 },
    { ...base, blockedUntil: -1 }, { ...base, biometric: 'yes' }]) {
    await rejects(async () => parseLockRecord(JSON.stringify(invalid)), 'Reject malformed privacy data');
  }
  check(sameVerifier(base.verifier, base.verifier), 'Matching verifier accepted');
  check(!sameVerifier(base.verifier, 'b'.repeat(64)) && !sameVerifier('', ''), 'Wrong or empty verifier rejected');
  let failed = base;
  for (let i = 0; i < 4; i++) failed = failedAttempt(failed, 100);
  check(failed.blockedUntil === 0, 'Allow first four failed attempts without delay');
  failed = failedAttempt(failed, 100);
  check(failed.blockedUntil === 30_100, 'Fifth failure starts 30-second cooldown');
  failed = failedAttempt(failed, 100);
  check(failed.blockedUntil === 60_100, 'Cooldown increases on subsequent failure');
  check(failedAttempt({ ...base, failedAttempts: 99 }, 100).blockedUntil === 900_100, 'Cooldown capped at 15 minutes');

  const h = harness();
  check(!h.controller.getSnapshot().ready && !h.controller.getSnapshot().unlocked, 'Initial gate denies access before storage read');
  await h.controller.initialize();
  check(h.controller.getSnapshot().unlocked && !h.controller.getSnapshot().enabled, 'Unconfigured lock leaves app usable');
  await rejects(() => h.controller.enable('12', true), 'Reject short PIN');
  await rejects(() => h.controller.enable('1234567', true), 'Reject long PIN');
  await h.controller.enable('1234', true);
  check(h.controller.getSnapshot().enabled && h.controller.getSnapshot().unlocked, 'Enable only after durable write');
  check(!h.getRaw()?.includes('"pin"') && !!h.getRaw()?.includes('verifier'), 'Store verifier without plaintext PIN field');
  const firstSalt = JSON.parse(h.getRaw()!).salt;
  await rejects(() => h.controller.enable('2345', false), 'Cannot overwrite existing lock through enrollment');
  await rejects(() => h.controller.changePin('2345', false), 'Changing PIN requires fresh authentication');
  await rejects(() => h.controller.disable(), 'Disabling requires fresh authentication');
  h.controller.lock();
  check(!h.controller.getSnapshot().unlocked, 'Background immediately revokes UI access');
  for (let i = 0; i < 5; i++) check(!await h.controller.authenticatePin('9999'), 'Incorrect PIN denied');
  const count = h.deriveCount();
  await rejects(() => h.controller.authenticatePin('1234'), 'Correct PIN also waits during cooldown');
  check(count === h.deriveCount(), 'Blocked attempt skips expensive KDF and guessing');
  const resumed = new PrivacyController(h.adapter);
  await resumed.initialize();
  check(resumed.getSnapshot().blockedUntil === h.controller.getSnapshot().blockedUntil && !resumed.getSnapshot().unlocked, 'Cooldown and lock survive restart');
  h.advance(30_000);
  check(await h.controller.authenticatePin('1234'), 'Correct PIN unlocks after cooldown');
  check(h.controller.getSnapshot().blockedUntil === 0 && JSON.parse(h.getRaw()!).failedAttempts === 0, 'Success clears persisted attempt count');
  check(await h.controller.authenticatePin('1234', 'settings'), 'Settings require current PIN');
  await h.controller.changePin('23456', false);
  check(JSON.parse(h.getRaw()!).salt !== firstSalt, 'PIN change creates fresh salt');
  await rejects(() => h.controller.disable(), 'Authorization consumed by PIN change');
  h.controller.lock();
  check(!await h.controller.authenticatePin('1234'), 'Old PIN no longer accepted');
  check(await h.controller.authenticatePin('23456'), 'New PIN accepted');
  await h.controller.authenticatePin('23456', 'settings');
  h.advance(60_001);
  await rejects(() => h.controller.disable(), 'Settings authorization expires');
  await h.controller.authenticatePin('23456', 'settings');
  h.failures.remove = true;
  await rejects(() => h.controller.disable(), 'Failed removal reported');
  check(h.controller.getSnapshot().enabled && h.getRaw() !== null, 'Failed disable retains lock');
  h.failures.remove = false;
  await h.controller.disable();
  check(h.getRaw() === null && !h.controller.getSnapshot().enabled, 'Authenticated disable removes only privacy record');

  const malformed = harness();
  malformed.setRaw('{not json');
  await malformed.controller.initialize();
  check(!!malformed.controller.getSnapshot().fatalError && !malformed.controller.getSnapshot().unlocked, 'Corrupted privacy storage fails closed');
  malformed.setRaw(null); malformed.failures.read = true;
  await malformed.controller.initialize();
  check(!malformed.controller.getSnapshot().unlocked, 'Read errors cannot silently disable lock');
  const unsupported = harness();
  unsupported.adapter.available = async () => false;
  await unsupported.controller.initialize();
  check(unsupported.controller.getSnapshot().unlocked && !unsupported.controller.getSnapshot().available, 'Unsupported platform remains usable without offering enrollment');
  await rejects(() => unsupported.controller.enable('1234', false), 'Unsupported storage cannot enable lock');
  const pinOnly = harness();
  pinOnly.adapter.hasBiometrics = async () => false;
  await pinOnly.controller.initialize(); await pinOnly.controller.enable('1234', true);
  check(!pinOnly.controller.getSnapshot().biometricEnabled, 'Unavailable biometrics create a usable PIN-only lock');
  pinOnly.controller.lock();
  check(!await pinOnly.controller.authenticateBiometric() && await pinOnly.controller.authenticatePin('1234'), 'PIN-only device always has a working unlock method');

  const io = harness();
  await io.controller.initialize();
  io.failures.write = true;
  await rejects(() => io.controller.enable('1234', false), 'Failed enrollment write reported');
  check(!io.controller.getSnapshot().enabled, 'Enrollment does not pretend to persist on write error');
  io.failures.write = false;
  await io.controller.enable('1234', false); io.controller.lock();
  io.failures.write = true;
  await rejects(() => io.controller.authenticatePin('9999'), 'Failure counter persistence error surfaced');
  check(!!io.controller.getSnapshot().fatalError && !io.controller.getSnapshot().unlocked, 'Counter write failure blocks access');
  await rejects(() => io.controller.authenticatePin('1234'), 'Fatal state cannot bypass persistence error');
  await io.controller.initialize();
  check(!io.controller.getSnapshot().unlocked && !!io.controller.getSnapshot().fatalError, 'Retry cannot discard pending failed attempt');
  io.adapter.available = async () => false;
  await io.controller.initialize();
  check(!io.controller.getSnapshot().unlocked && !!io.controller.getSnapshot().fatalError, 'Previously protected storage becoming unavailable cannot open the gate');
  io.adapter.available = async () => true;
  io.failures.write = false;
  await io.controller.initialize();
  check(JSON.parse(io.getRaw()!).failedAttempts === 1, 'Retry persists pending failure before loading');

  const bio = harness();
  await bio.controller.initialize(); await bio.controller.enable('1234', true); bio.controller.lock();
  bio.setBio(false);
  check(!await bio.controller.authenticateBiometric() && !bio.controller.getSnapshot().unlocked, 'Cancelled biometrics leave gate locked');
  check(await bio.controller.authenticatePin('1234'), 'PIN fallback works after biometric cancellation');
  bio.controller.lock(); bio.setBio(true);
  check(await bio.controller.authenticateBiometric(), 'Successful biometrics unlock');
  await bio.controller.authenticateBiometric('settings'); await bio.controller.disable();
  check(!bio.controller.getSnapshot().enabled, 'Biometric reauthentication permits disable');
  await bio.controller.enable('1234', true); bio.controller.lock();
  const releaseBio = bio.defer(); const biometricAttempt = bio.controller.authenticateBiometric();
  check(bio.controller.getSnapshot().biometricPrompt, 'Track system prompt while awaiting OS');
  bio.controller.lock(); releaseBio();
  check(!await biometricAttempt && !bio.controller.getSnapshot().unlocked, 'Background during biometric prompt invalidates late success');
  const releasePin = bio.defer(); const pinAttempt = bio.controller.authenticatePin('1234');
  await rejects(() => bio.controller.authenticatePin('9999'), 'Concurrent attempts rejected');
  bio.controller.lock(); releasePin();
  check(!await pinAttempt && !bio.controller.getSnapshot().unlocked, 'Background during PIN derivation invalidates late success');

  const salt = '0123456789abcdef0123456789abcdef';
  const saltBytes = Uint8Array.from(salt.match(/../g)!, byte => parseInt(byte, 16));
  const expected = pbkdf2Sync('123456', saltBytes, PIN_ITERATIONS, 32, 'sha256').toString('hex');
  const originalCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: webcrypto });
  check(await derivePin('123456', salt, PIN_ITERATIONS) === expected, 'WebCrypto verifier matches independent Node PBKDF2');
  Object.defineProperty(globalThis, 'crypto', { configurable: true, value: undefined });
  let timerFired = false;
  const timer = setTimeout(() => { timerFired = true; }, 0);
  check(await derivePin('123456', salt, PIN_ITERATIONS) === expected, 'Native JS KDF matches independent Node PBKDF2 at production work factor');
  check(timerFired, 'Native KDF yields to host events so the privacy cover can respond during verification');
  clearTimeout(timer);
  if (originalCrypto) Object.defineProperty(globalThis, 'crypto', originalCrypto);
  else Reflect.deleteProperty(globalThis, 'crypto');
  console.log(`Privacy checks: ${passed} passed.`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
