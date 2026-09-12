# Optional privacy lock

This is an app-access gate, not encryption of the ledger. The native verifier lives in Expo SecureStore; the browser uses a local-storage verifier and explicitly describes the browser lock as a screen privacy feature. Ordinary ledger backups remain readable; protected export uses a separate password. Backups never include the PIN, verifier, salt, or lock settings.

## Integration

- Wrap the app with `PrivacyProvider`.
- Wrap the rendered ledger UI with `PrivacyGate c={c}` after the root font-loading branch. Keep fonts and the root hooks outside the gate. No ledger child UI mounts before the privacy record has loaded or while locked. Real background transitions unmount the ledger UI, including dialogs; temporary biometric prompt inactivity preserves the form beneath an opaque cover.
- Add a Settings route to `PrivacySettings c={c} onBack={...} onEnabled={...}`. `onEnabled` should turn on the reminder preference that hides notification details.
- `usePrivacy()` exposes `enabled`, `biometricAvailable`, `biometricEnabled`, `busy`, `lock()` and the controller. Credentials are never exposed through the context.

## Behavior and storage

Enrollment confirms a 4–6 digit PIN. Strong enrolled biometrics are enabled by default when available, with the chosen PIN as fallback. Cancellation, unavailable biometrics, and biometric lockout leave the PIN route available. Changing the PIN or disabling the lock requires current PIN or biometric authentication, using a single-use authorization that expires in 60 seconds and is revoked on backgrounding.

PIN verification uses PBKDF2-HMAC-SHA256 with a random 128-bit salt, 600,000 iterations, and a 256-bit verifier. WebCrypto handles the browser path; `@noble/hashes` handles Hermes. Five failed attempts trigger 30 seconds of cooldown, increasing to at most 15 minutes. Attempts and cooldown survive restart. The controller serializes authentication and rejects late results after a background transition. Malformed records and storage errors fail closed; unavailable storage prevents enrollment rather than claiming to save the lock.

The native record uses `WHEN_UNLOCKED_THIS_DEVICE_ONLY` and deliberately does not use SecureStore's biometric-bound `requireAuthentication`, which can invalidate a record after biometric enrollment changes and would destroy the PIN fallback. LocalAuthentication handles biometric verification separately. The record is small and uses key `iou.privacy-lock.v1`, outside the ledger persistence/export schema. On iOS, Keychain records can survive reinstall; forgetting both PIN and available biometrics requires using an existing backup on another device. The app does not provide an unauthenticated reset that would expose the existing ledger.

## Validation

`scripts/privacy-checks.ts` has 74 checks covering record validation, enrollment, persisted cooldowns, fresh reauthentication, removal/write/read failures, cancellation/PIN fallback, and background/concurrency races. The KDF is checked against Node's independent PBKDF2 implementation at the actual 600,000-iteration setting through both browser and native paths. A timer assertion also verifies that the native KDF yields to host events so the privacy cover can respond during verification; this requires the real scheduler yielding in the pinned `@noble/hashes` 2.4.0 release.

Thirteen isolated browser workflows passed for enrollment/confirmation, changing and disabling with reauthentication, old-PIN rejection, reload gating, backgrounding, persisted cooldown, and the notification privacy default. Lock, settings, and PIN-change screens were inspected at 320px in light/dark mode without horizontal overflow or runtime errors. Browser verification used fresh contexts and fabricated data.

Real-device checks still need to exercise fingerprint/Face ID success and cancellation, changed enrollment, device lock/unlock, notification shade, app switching during verification, and the app-switcher snapshot. Native modules require a new build; Expo Go does not support Face ID. No claim is made that a browser lock prevents a person with developer tools or storage access from reading browser data.

## Primary references

- [Expo SDK 57 LocalAuthentication](https://docs.expo.dev/versions/v57.0.0/sdk/local-authentication/)
- [Expo SDK 57 SecureStore](https://docs.expo.dev/versions/v57.0.0/sdk/securestore/)
- [Expo SDK 57 Crypto](https://docs.expo.dev/versions/v57.0.0/sdk/crypto/)
- [noble-hashes implementation and audit scope](https://github.com/paulmillr/noble-hashes)
