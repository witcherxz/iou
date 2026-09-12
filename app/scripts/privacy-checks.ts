// Node-only test oracle; the application intentionally does not include Node globals.
const { pbkdf2Sync, webcrypto } = require('node:crypto') as {
  pbkdf2Sync: (pin: string, salt: Uint8Array, iterations: number, length: number, digest: string) => { toString(encoding: string): string };
  webcrypto: Crypto;
};
import { PrivacyAdapter, PrivacyController } from '../src/privacy/controller';
import { derivePin } from '../src/privacy/crypto';
import { failedAttempt, LockRecord, normalizePin, parseLockRecord, PIN_ITERATIONS, sameVerifier } from '../src/privacy/policy';
import { confirmAction, registerConfirmationHandler } from '../src/confirm';

let passed = 0;
function check(condition: unknown, label: string) { if (!condition) throw new Error(label); passed++; }
async function rejects(action: () => Promise<unknown>, label: string) {
  let failed = false;
  try { await action(); } catch { failed = true; }
  check(failed, label);
}
const base: LockRecord = { version: 1, algorithm: 'pbkdf2-sha256', iterations: PIN_ITERATIONS,
  salt: 'abcd'.repeat(8), verifier: 'a'.repeat(64), biometric: true, failedAttempts: 0, blockedUntil: 0 };

function harness(timeoutMs?: number) {
  let raw: string | null = null;
  let now = 1_000_000;
  let failures = { read: false, write: false, remove: false };
  let deriveCount = 0;
  let saltIndex = 0;
  let bioResult = true;
  let biometricCount = 0;
  let deferred: Promise<void> | null = null;
  const adapter: PrivacyAdapter = {
    available: async () => true,
    read: async () => { if (failures.read) throw new Error('read failed'); return raw; },
    write: async value => { if (failures.write) throw new Error('write failed'); raw = value; },
    remove: async () => { if (failures.remove) throw new Error('remove failed'); raw = null; },
    randomSalt: async () => (++saltIndex).toString(16).padStart(32, '0'),
    derive: async (pin, salt) => { deriveCount++; if (deferred) await deferred; return (pin + salt).padEnd(64, '0').slice(0, 64); },
    hasBiometrics: async () => true,
    authenticate: async () => { biometricCount++; if (deferred) await deferred; return bioResult; },
    now: () => now,
  };
  return { adapter, controller: new PrivacyController(adapter, timeoutMs), getRaw: () => raw,
    setRaw: (value: string | null) => { raw = value; }, advance: (ms: number) => { now += ms; },
    failures, deriveCount: () => deriveCount, biometricCount: () => biometricCount, setBio: (value: boolean) => { bioResult = value; },
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

  const hangingRead = harness(10);
  hangingRead.adapter.read = () => new Promise(() => {});
  await hangingRead.controller.initialize();
  check(hangingRead.controller.getSnapshot().ready && !hangingRead.controller.getSnapshot().busy &&
    !!hangingRead.controller.getSnapshot().fatalError && !hangingRead.controller.getSnapshot().unlocked,
  'Never-resolving native storage shows a retryable error and keeps the ledger closed');

  const hangingBioProbe = harness(10);
  hangingBioProbe.adapter.hasBiometrics = () => new Promise(() => {});
  await hangingBioProbe.controller.initialize();
  check(!hangingBioProbe.controller.getSnapshot().biometricAvailable && hangingBioProbe.controller.getSnapshot().unlocked,
    'Unresponsive biometric capability probe leaves PIN setup available');

  const slowSetup = harness(10);
  await slowSetup.controller.initialize();
  const finishSetup = slowSetup.defer();
  await rejects(() => slowSetup.controller.enable('1234', false), 'PIN setup times out instead of spinning forever');
  check(!slowSetup.controller.getSnapshot().busy && !slowSetup.controller.getSnapshot().enabled && slowSetup.getRaw() === null,
    'Timed-out derivation releases controls without saving an incomplete lock');
  finishSetup(); await Promise.resolve();
  check(slowSetup.getRaw() === null, 'Late enrollment derivation cannot unexpectedly enable the lock');
  await slowSetup.controller.enable('1234', true);
  slowSetup.controller.lock();
  const finishUnlock = slowSetup.defer();
  await rejects(() => slowSetup.controller.authenticatePin('1234'), 'Unresponsive PIN verification times out');
  finishUnlock(); await Promise.resolve();
  check(!slowSetup.controller.getSnapshot().unlocked && !slowSetup.controller.getSnapshot().busy,
    'A correct late PIN result cannot unlock after timeout');
  check(await slowSetup.controller.authenticatePin('1234'), 'Retry works after the old derivation settles');
  await slowSetup.controller.authenticatePin('1234', 'settings');
  const previousRecord = slowSetup.getRaw();
  const finishChange = slowSetup.defer();
  await rejects(() => slowSetup.controller.changePin('5678', false), 'PIN changes have a bounded wait');
  finishChange(); await Promise.resolve();
  check(slowSetup.getRaw() === previousRecord, 'Late PIN change leaves the existing saved verifier intact');

  const slowStorage = harness(10);
  await slowStorage.controller.initialize();
  let finishWrite!: () => void;
  const originalWrite = slowStorage.adapter.write;
  slowStorage.adapter.write = value => new Promise<void>(resolve => {
    finishWrite = () => { void originalWrite(value).then(resolve); };
  });
  await rejects(() => slowStorage.controller.enable('1234', false), 'A hanging native write times out');
  check(!slowStorage.controller.getSnapshot().unlocked && !!slowStorage.controller.getSnapshot().fatalError,
    'Uncertain persistence closes the gate until storage is reconciled');
  let readCount = 0;
  const originalRead = slowStorage.adapter.read;
  slowStorage.adapter.read = async () => { readCount++; return originalRead(); };
  await slowStorage.controller.initialize();
  check(readCount === 0 && !slowStorage.controller.getSnapshot().unlocked && !slowStorage.controller.getSnapshot().busy &&
    slowStorage.controller.getSnapshot().fatalError?.includes('أغلق التطبيق'),
    'Retry cannot race a pending write and explains how to restart an unresponsive native operation');
  finishWrite(); await Promise.resolve(); await Promise.resolve();
  slowStorage.adapter.write = originalWrite;
  await slowStorage.controller.initialize();
  check(slowStorage.controller.getSnapshot().enabled && !slowStorage.controller.getSnapshot().unlocked,
    'A completed late write is loaded safely and requires the chosen PIN');
  check(await slowStorage.controller.authenticatePin('1234'), 'The PIN saved by the late write remains valid');

  slowSetup.controller.lock();
  let cancellations = 0;
  slowSetup.adapter.cancelAuthentication = async () => { cancellations++; };
  const finishSlowBio = slowSetup.defer();
  check(!await slowSetup.controller.authenticateBiometric(), 'Biometric OS calls have a bounded wait');
  check(cancellations === 1 && !slowSetup.controller.getSnapshot().biometricPrompt && !slowSetup.controller.getSnapshot().busy,
    'Timed-out biometric prompt is cancelled and PIN controls become usable');
  finishSlowBio(); await Promise.resolve();
  check(!slowSetup.controller.getSnapshot().unlocked, 'Late biometric success cannot open the gate');

  const automatic = harness();
  await automatic.controller.initialize(); await automatic.controller.enable('1234', true);
  const auto = new PrivacyController(automatic.adapter);
  auto.setForeground(true);
  check(!await auto.autoUnlockWithBiometrics() && automatic.biometricCount() === 0,
    'Automatic biometrics wait for the persisted lock to load');
  await auto.initialize();
  automatic.setBio(false);
  check(!await auto.autoUnlockWithBiometrics() && automatic.biometricCount() === 1 && !auto.getSnapshot().unlocked,
    'First active app entry automatically prompts, while cancellation keeps the ledger locked');
  auto.setForeground(false); auto.setForeground(true);
  for (let i = 0; i < 3; i++) await auto.autoUnlockWithBiometrics();
  check(automatic.biometricCount() === 1,
    'Native prompt focus changes and repeated render effects cannot trigger a cancellation loop');
  auto.background();
  check(!await auto.autoUnlockWithBiometrics() && automatic.biometricCount() === 1,
    'A real background transition never starts authentication in the background');
  automatic.setBio(true); auto.setForeground(true);
  check(await auto.autoUnlockWithBiometrics() && automatic.biometricCount() === 2 && auto.getSnapshot().unlocked,
    'Returning from a real background transition gets one new automatic attempt');
  await auto.autoUnlockWithBiometrics();
  check(automatic.biometricCount() === 2, 'An unlocked ledger never auto-prompts');
  auto.lockManually();
  check(!await auto.autoUnlockWithBiometrics() && !auto.getSnapshot().unlocked,
    'Manual lock stays locked instead of immediately reopening with biometrics');

  const entering = new PrivacyController(automatic.adapter);
  await entering.initialize();
  check(!await entering.autoUnlockWithBiometrics() && automatic.biometricCount() === 2,
    'A cold start that is not yet active does not prompt');
  entering.setForeground(true);
  const finishAutomatic = automatic.defer();
  const firstAutomatic = entering.autoUnlockWithBiometrics();
  check(entering.getSnapshot().biometricPrompt && automatic.biometricCount() === 3,
    'Eligible automatic authentication starts the native prompt immediately');
  check(!await entering.autoUnlockWithBiometrics() && automatic.biometricCount() === 3,
    'Overlapping effect calls cannot start a second native prompt');
  entering.setForeground(false);
  check(!await entering.autoUnlockWithBiometrics(), 'Native-prompt obscuring cannot start a background retry');
  let backgroundCancellations = 0;
  automatic.adapter.cancelAuthentication = async () => { backgroundCancellations++; };
  entering.background(); finishAutomatic();
  check(!await firstAutomatic && !entering.getSnapshot().unlocked && backgroundCancellations === 1,
    'Genuine background during the prompt cancels it and rejects late success');
  entering.setForeground(true);
  check(await entering.autoUnlockWithBiometrics() && automatic.biometricCount() === 4,
    'The next real visit can authenticate after the previous prompt was invalidated');

  const pinRace = new PrivacyController(automatic.adapter);
  await pinRace.initialize(); pinRace.setForeground(true);
  const finishManualPin = automatic.defer();
  const manualPin = pinRace.authenticatePin('9999');
  check(!await pinRace.autoUnlockWithBiometrics() && automatic.biometricCount() === 4,
    'Automatic biometrics cannot interrupt an in-progress PIN attempt');
  finishManualPin(); await manualPin;
  check(!await pinRace.autoUnlockWithBiometrics() && automatic.biometricCount() === 4,
    'A failed PIN attempt remains on the PIN fallback without an automatic biometric retry');
  pinRace.background(); pinRace.setForeground(true); pinRace.preferPin();
  check(!await pinRace.autoUnlockWithBiometrics() && automatic.biometricCount() === 4,
    'Focusing the PIN field suppresses an automatic prompt before typing starts');
  check(await pinRace.authenticatePin('1234'), 'The original PIN remains usable after suppressing automatic biometrics');

  const optedOut = harness();
  await optedOut.controller.initialize(); await optedOut.controller.enable('1234', false);
  const optedOutReload = new PrivacyController(optedOut.adapter);
  await optedOutReload.initialize(); optedOutReload.setForeground(true);
  check(!await optedOutReload.autoUnlockWithBiometrics() && optedOut.biometricCount() === 0,
    'An explicit persisted biometric opt-out survives restart and is respected');
  const unavailableBio = new PrivacyController(automatic.adapter);
  automatic.adapter.hasBiometrics = async () => false;
  await unavailableBio.initialize(); unavailableBio.setForeground(true);
  check(!await unavailableBio.autoUnlockWithBiometrics() && automatic.biometricCount() === 4,
    'Unavailable or unenrolled biometrics leave automatic authentication disabled');
  check(await unavailableBio.authenticatePin('1234'), 'PIN fallback works when biometric enrollment is unavailable');
  const failedStorage = harness();
  failedStorage.setRaw('{invalid'); await failedStorage.controller.initialize(); failedStorage.controller.setForeground(true);
  check(!await failedStorage.controller.autoUnlockWithBiometrics() && failedStorage.biometricCount() === 0,
    'Fatal privacy storage errors cannot launch an automatic prompt');
  const noLock = harness();
  await noLock.controller.initialize(); noLock.controller.setForeground(true);
  check(!await noLock.controller.autoUnlockWithBiometrics() && noLock.biometricCount() === 0,
    'The optional lock stays optional and never prompts while disabled');

  check(!await confirmAction('Private restore', 'Preview'), 'A confirmation cannot open before the private dialog host mounts');
  let confirmation: string[] = [];
  const unregisterFirst = registerConfirmationHandler(async (...request) => { confirmation = request; return true; });
  check(await confirmAction('Restore', 'Preview', 'Apply') && confirmation.join('|') === 'Restore|Preview|Apply',
    'The mounted host receives the intended confirmation and returns approval');
  let cancelingHostCalls = 0;
  const unregisterSecond = registerConfirmationHandler(async () => { cancelingHostCalls++; return false; });
  unregisterFirst();
  check(!await confirmAction('Restore', 'Preview') && cancelingHostCalls === 1,
    'Cleanup from an older host cannot remove the current canceling host');
  unregisterSecond();
  check(!await confirmAction('Private restore', 'Preview'), 'Unmounting the host cancels subsequent private confirmations');
  let finishRead!: () => void;
  const readFinishes = new Promise<void>(resolve => { finishRead = resolve; });
  let lateHostCalls = 0;
  const unregisterLate = registerConfirmationHandler(async () => { lateHostCalls++; return true; });
  const lateConfirmation = readFinishes.then(() => confirmAction('Private restore', 'Late decrypted preview'));
  unregisterLate(); finishRead();
  check(!await lateConfirmation && lateHostCalls === 0,
    'A restore completing after a privacy lock cannot show a preview or receive approval outside the gate');

  const salt = '0123456789abcdef0123456789abcdef';
  const saltBytes = Uint8Array.from(salt.match(/../g)!, byte => parseInt(byte, 16));
  const expected = pbkdf2Sync('123456', saltBytes, PIN_ITERATIONS, 32, 'sha256').toString('hex');
  let nativeCalls = 0;
  check(await derivePin('123456', salt, PIN_ITERATIONS, async (pin, actualSalt, iterations) => {
    nativeCalls++;
    check(pin === '123456' && actualSalt === salt && iterations === PIN_ITERATIONS,
      'Native worker receives the unchanged PIN, salt, and existing iteration count');
    return expected;
  }) === expected && nativeCalls === 1, 'Native derivation takes precedence over the JavaScript fallback');
  await rejects(() => derivePin('123456', salt, PIN_ITERATIONS, async () => 'bad'), 'Invalid native output is rejected');
  await rejects(() => derivePin('123456', salt, PIN_ITERATIONS, async () => { throw new Error('Native failure'); }),
    'Native failures are surfaced without silently changing the derivation engine');
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
