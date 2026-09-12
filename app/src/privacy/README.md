# Optional privacy lock

This is an app-access gate, not encryption of the ledger. The native verifier lives in Expo SecureStore; the browser uses a local-storage verifier and explicitly describes the browser lock as a screen privacy feature. Ordinary ledger backups remain readable; protected export uses a separate password. Backups never include the PIN, verifier, salt, or lock settings.

## Integration

- Wrap the app with `PrivacyProvider`.
- Wrap the rendered ledger UI with `PrivacyGate c={c}` after the root font-loading branch. Keep fonts and the root hooks outside the gate. No ledger child UI mounts before the privacy record has loaded or while locked. Real background transitions unmount the ledger UI, including dialogs; temporary biometric prompt inactivity preserves the form beneath an opaque cover.
- Add a Settings route to `PrivacySettings c={c} onBack={...} onEnabled={...}`. `onEnabled` should turn on the reminder preference that hides notification details.
- `usePrivacy()` exposes `enabled`, `biometricAvailable`, `biometricEnabled`, `busy`, `lock()` and the controller. Credentials are never exposed through the context.

## Behavior and storage

Enrollment confirms a 4–6 digit PIN. Strong enrolled biometrics are enabled by default when available, with the chosen PIN as fallback. An explicitly saved biometric opt-out remains unchanged. When enabled, biometrics prompt automatically once the stored lock is ready and the app is active and focused. A controller-owned latch permits one automatic attempt per real app visit; only a genuine background transition re-arms it. Android prompt blur/focus and iOS prompt inactivity cannot create cancellation/retry loops even when the unlock form unmounts beneath its privacy cover.

Cancellation, errors, unavailable biometrics, and biometric lockout leave PIN entry available. The manual biometric button remains when supported biometrics are enabled. Focusing the PIN field or starting manual authentication suppresses automatic retries for that visit. Manual "lock now" stays locked. Backgrounding cancels an outstanding Android prompt and rejects any late success; returning permits one new automatic attempt. Automatic authentication never starts while already unlocked, busy, unready, obscured, or in a fatal storage state. Changing the PIN or disabling the lock still requires current PIN or biometric authentication, using a single-use authorization that expires in 60 seconds and is revoked on backgrounding.

PIN verification uses PBKDF2-HMAC-SHA256 with a random 128-bit salt, 600,000 iterations, and a 256-bit verifier. The local `modules/iou-privacy-crypto` Expo module runs platform PBKDF2 on a native worker queue (Android 8+ SecretKeyFactory; iOS CommonCrypto). WebCrypto handles the browser path. Android 7 and Expo Go retain the yielding `@noble/hashes` compatibility path. All paths produce the exact existing v1 verifier; no PIN reset or data migration is needed. The native module requires rebuilding the app and is discovered automatically by Expo's local-module autolinking.

The alpha.1 production build did every native PIN derivation in Hermes JavaScript. Read-only ADB observation on the user's S24 Ultra running Android 16 captured setup staying busy for roughly two minutes, with about 70 seconds of JavaScript CPU time. After upgrading the same installation to alpha.2, PIN activity used 0.50 seconds of native worker CPU time without a sustained JavaScript spike, and the user confirmed the PIN worked. No missing-module, KDF bridge, SecureStore, JavaScript, or crash errors appeared. These are CPU measurements, not exact wall-clock unlock durations; monitoring did not read screens, PINs, or ledger data.

Every awaited native/storage/derivation stage has a 30-second deadline, with a retryable Arabic error rather than endless loading. Timed-out results cannot later enable a lock, change a PIN, or unlock the ledger. A timed-out write/removal closes the gate until the original operation settles and storage can be reconciled; a retry cannot race an unfinished write and incorrectly read an empty record. If a native write never returns, the error explains to close/reopen the app so the fresh process can check the durable record; it never offers an unauthenticated lock reset or data deletion. Timed-out Android biometric prompts are cancelled to restore PIN controls.

Five failed attempts trigger 30 seconds of cooldown, increasing to at most 15 minutes. Attempts and cooldown survive restart. The controller serializes authentication and rejects late results after a background transition. Malformed records and storage errors fail closed; unavailable storage prevents enrollment rather than claiming to save the lock.

The native record uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and deliberately does not use SecureStore's biometric-bound `requireAuthentication`, which can invalidate a record after biometric enrollment changes and would destroy the PIN fallback. LocalAuthentication handles biometric verification separately. The record is small and uses key `iou.privacy-lock.v1`, outside the ledger persistence/export schema. On iOS, Keychain records can survive reinstall; forgetting both PIN and available biometrics requires using an existing backup on another device. The app does not provide an unauthenticated reset that would expose the existing ledger.

## Validation

`scripts/privacy-checks.ts` has 118 checks covering record validation, enrollment, persisted cooldowns, fresh reauthentication, removal/write/read failures, cancellation/PIN fallback, and background/concurrency races. These include never-resolving adapter calls, late results after timeouts, and 22 automatic-biometric lifecycle checks. WebCrypto and the JS compatibility KDF are checked against Node's independent PBKDF2 implementation at the actual 600,000-iteration setting. A timer assertion verifies that the JS fallback yields to host events so the privacy cover can respond during verification; this requires the real scheduler yielding in the pinned `@noble/hashes` 2.4.0 release.

`node scripts/native-pin-checks.mjs` requires a JDK (or `JAVA_HOME`) and compiles the actual Android crypto class. Its 8 checks compare production-work-factor vectors, including leading-zero PINs, against independent Node crypto results, and reject invalid derivation parameters. Android and Apple autolinking resolve the module. These JVM checks do not execute Android's provider, the Expo bridge, or iOS CommonCrypto; production build/device checks remain necessary.

Thirteen isolated browser workflows passed for enrollment/confirmation, changing and disabling with reauthentication, old-PIN rejection, reload gating, backgrounding, persisted cooldown, and the notification privacy default. Lock, settings, and PIN-change screens were inspected at 320px in light/dark mode without horizontal overflow or runtime errors. Browser verification used fresh contexts and fabricated data.

Sixteen independent React Provider/Gate lifecycle scenarios also passed with mocked native events, including synchronous Android prompt blur, cancellation/focus loops, cold startup readiness, real re-entry, stale success after backgrounding, iOS inactivity, manual lock, PIN fallback, and disabled/unavailable/corrupt storage states. They exercise the actual React integration but do not replace device biometric validation.

Alpha 3 phone testing on the S24 Ultra confirmed automatic native biometric prompting, successful entry, cancellation without loops, PIN fallback, and re-entry from Drive. Remaining device checks include iOS Face ID, changed enrollment, device lock/unlock, notification shade, and the app-switcher snapshot. Native modules require a new build; Expo Go does not support Face ID. No claim is made that a browser lock prevents a person with developer tools or storage access from reading browser data.

## Primary references

- [Expo SDK 57 LocalAuthentication](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/)
- [noble-hashes implementation and audit scope](https://github.com/paulmillr/noble-hashes)
- [Expo native AsyncFunction worker queues](https://docs.expo.dev/modules/module-api/#asyncfunction)
- [Android SecretKeyFactory algorithm availability](https://developer.android.com/reference/javax/crypto/SecretKeyFactory)
