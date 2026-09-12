# STATUS — IoU
Updated: 2026-09-12 | State: ACTIVE
Goal: Provide a private Arabic debt ledger with clear balances and recoverable records.
Phase: verify

## Now
[Alpha 2](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.2) is published and installed on the user's Samsung S24 Ultra (Android 16), and the user confirmed the PIN performance fix. Alpha 3 automatic biometric entry passed the full app checks, TypeScript, 57 release guards and 16 independent React lifecycle scenarios. Publishing the signed update for phone validation.

Next:
1. Publish/install Alpha 3 over the existing app and confirm its automatic prompt on the S24 Ultra.
2. Confirm manual Drive sharing and file restoration through the phone's providers.
3. Complete broader native accessibility/reminder/provider validation; direct automatic Drive sync still requires native authorization and Google Cloud setup.

## Health

| metric | current | measured | previous | threshold | goal | source |
|---|---:|---|---:|---:|---:|---|
| Automated checks passing | 1206 count | 2026-09-12 | 1082 count | >= 1206 count | 1206 count | `cd app && npm run check`; `node scripts/release-workflow-checks.mjs`; `node scripts/native-pin-checks.mjs`; `/tmp/iou-device-debug/*-final.log` |
| TypeScript | PASS | 2026-09-12 | PASS | = PASS | PASS | `cd app && npm run typecheck` |
| Isolated browser and Drive scenarios | 30 count | 2026-09-12 | — | >= 30 count | 30 count | `/tmp/iou-forgiveness-ui/results.json`; `/tmp/iou-drive/results.json`; `/tmp/iou-drive/ui-results.json` |
| Alpha 2 production APK | PASS | 2026-09-12 | PASS | = PASS | PASS | [Release workflow](https://github.com/witcherxz/iou/actions/runs/34700682863); [verification and device installation](app/docs/RELEASING.md#alpha-2) |

## DoD — Alpha 3 automatic biometric entry

- [x] Confirm Alpha 2 PIN unlock on the connected Samsung S24 Ultra.
- [x] Prompt automatically on entry when the lock and available biometrics are enabled.
- [x] Preserve PIN fallback, explicit biometric opt-out and cancellation without prompt loops.
- [x] Verify startup, foreground/background, native-prompt focus changes and authentication races.
- [ ] Pass checks and publish/install Alpha 3 with production signing and existing data preserved.

## Blockers / Risks

- PIN performance is confirmed on the connected S24 Ultra; biometric lifecycle, app-switcher privacy, TalkBack/font scaling, folder grants, sharing and notification delivery still need native validation. Response: test the automatic prompt on the connected phone and complete broader validation before a stable release.
- Direct Google Drive authorization is unfinished. Response: keep direct sync disabled and offer the tested manual share/download and file-restore flow. Native Drive upload completion remains user-confirmed.
- The app lock controls access; ordinary local/folder/CSV/report data remains readable. Protected manual exports use a separate password. Response: explain the distinction and keep off-device copies private.
- Automatic backups run after foreground edits and are suspended after local recovery; reminders retain the nearest 60 alerts plus weekly and refresh on foreground. Response: explain these operating limits in the feature notes.

## Decisions

- 2026-09-12: Facing a template-signed APK with seeded records, chose a separate production identity and dedicated release key, to start clean while preserving the old app for export, accepting explicit backup import for users upgrading from debug builds.

- 2026-09-12: Facing mistaken financial entries, chose validated corrections and reversible cancellation over destructive deletion, to retain original records and trace balance changes, accepting visible history and payment-dependency checks.
- 2026-09-12: Facing app-independent recovery needs, chose self-contained HTML plus spreadsheet CSVs and interoperable optional encryption, to keep records usable without IoU, accepting that ordinary folder exports remain readable.

- 2026-09-12: Facing a request for Material 3, chose shared semantic tokens and adapted React Native components over a separate web-only UI kit, to keep one Arabic interface across platforms, accepting responsibility for native accessibility validation.

- 2026-09-12: Facing mixed-direction debts, chose explicit received/paid settlement and separate gross totals over implicit net settlement, to preserve actual obligations, accepting one direction choice when both sides owe.
- 2026-09-12: Facing an unverified Google native OAuth flow, chose to keep direct Drive disabled over exposing a connection after adding IDs, to avoid promising unusable backup, accepting file/folder backup as the available paths.
- 2026-09-12: Facing potential overwrite of external backups during startup or recovery, chose explicit first save and suspended automatic backup after local recovery, to protect older/newer copies, accepting a manual review step.

## Log

- 2026-09-12 [work]: User confirmed Alpha 2 PIN unlock works promptly. App-specific diagnostics showed about 0.50 seconds of native-worker CPU time with no sustained JavaScript load or errors. Implemented automatic biometric entry with cancellation/PIN fallback, preserved opt-out and background race protection. Passed full app checks (118 privacy checks), TypeScript, 57 release guards and 16 independent React lifecycle scenarios. Preparing the signed Alpha 3 update; PIN and ledger contents remain private.

- 2026-09-12 [release]: Published Alpha 2 from 18e786e; both Actions runs passed. Independently verified APK signature, checksum, identity, version, native PIN classes, offline bundle and absence of demo content. Updated the connected S24 Ultra using `adb install -r`; Android confirms versionCode 2 and the app launches without native-module errors. Captured original lock setup at roughly two minutes/70 seconds JS CPU; interactive updated PIN and native Drive tests were pending at installation.

- 2026-09-12 [work]: Addressed Samsung S24 Ultra lock-setup report with native compatible PBKDF2 and bounded operations; implemented manual Drive export/restore and distinct full/partial forgiveness. Passed 1,206 automated checks including native Java compatibility, TypeScript, prebuild/autolinking and 30 isolated browser/Drive scenarios. ADB tools are ready but no phone is connected; preparing Alpha 2 with production package/signing continuity.

- 2026-09-12 [release]: Published v0.1.0-alpha.1 from commit 7762dfd after correcting SDK 37 certificate parsing. Main and tag Actions runs passed all 1,082 checks and the signed production build. Downloaded the 72,361,378-byte APK and independently verified its SHA-256, pinned signature, production identity/version, Arabic label, non-debuggable manifest, absent overlay permission and fixture-free offline bundle. Fresh-install and preservation browser checks passed earlier; native hardware validation remains for the alpha.

- 2026-09-12 [incident]: The first parser correction covered SDK 37 V3 labels but missed Gradle's V2-only signature. Replaced the scheme-label whitelist with verification of every non-source-stamp certificate digest against the pinned key. Passed 49 release checks, including the complete CI output; APK signature, package, version and non-debuggable manifest had already passed before this parser error.

- 2026-09-12 [incident]: First alpha APK compiled in GitHub Actions, but its certificate parser rejected SDK 37's new `V3.0 Signer:` label and prevented publication. Reproduced with the official SDK 37 binary, retained strict certificate pinning, and passed 43 release checks plus real SDK 36/37 output probes. Retrying the unpublished tag after the verifier correction.

- 2026-09-12 [work]: Prepared 0.1.0-alpha.1 production packaging, fixture-free initialization, app branding, release signing secrets, guarded APK workflow and tagged prerelease publishing. Passed 1,061 automated assertions, TypeScript, eight clean-install/preservation scenarios, actionlint and Android prebuild. User authorized commit and push; GitHub APK validation remains pending.

- 2026-09-12 [work]: Implemented all five requested features with v1 migration, 10-version recovery, optional encrypted reports and biometric/PIN lock. Fixed backdated-payment balance summaries and web switch/selection semantics during integration. Passed 1,014 automated assertions, TypeScript, 57 isolated browser/report workflows and Android production export. Added `app/docs/FEATURES.md` and screenshots. No commit or push performed.

- 2026-09-12 [work]: Removed Home people-direction filters and their navigation state. All people, including payable-only and debt-free records, now appear directly. TypeScript and focused browser checks at 320/390/1440 passed; updated home screenshots.

- 2026-09-12 [work]: Applied requested Western Arabic 0–9 digits throughout generated UI text and amount entry; retained Arabic/Persian input acceptance. TypeScript, 624 assertions and 19 browser workflows passed. Refreshed current screenshots and verified amount/date normalization and numeric restore previews.

- 2026-09-12 [work]: Implemented Material 3 screens, tonal themes, local Material Symbols, adaptive RTL navigation and themed confirmations. Passed 624 core/backup/contrast assertions, TypeScript, 19 browser workflows, 72 viewport/theme captures and Android production export. Added current screenshots and design notes.

- 2026-09-12 [work]: Reviewed UI/UX, backup methods and ledger logic; implemented fixes; 128 core/backup checks, TypeScript, 19 browser scenarios and Android bundle export passed. Added screenshots and documented native release work. No commit or push performed.
