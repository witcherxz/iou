# STATUS — IoU
Updated: 2026-09-12 | State: ACTIVE
Goal: Provide a private Arabic debt ledger with clear balances and recoverable records.
Phase: verify

## Now
Alpha 9 is published and verified on the isolated Android 16 emulator. Names, transaction counts and descriptions align right, and history omits the redundant «دين ·» prefix. TypeScript, 1,298 integrated checks, four browser RTL cases, 19 history/privacy workflows and all 11 native text comparisons pass. Amount/date behavior and centered controls are preserved. Separate compact-label clipping was confirmed to predate Alpha 9 and remains queued. The user decides when core features are complete and the app can move from alpha to beta.

Next:
1. Correct existing native clipping in compact selector and status labels.
2. Validate completed cloud-provider backup/recovery before a stable release.
3. Continue native accessibility, privacy and reminder validation.

## Health

| metric | current | measured | previous | threshold | goal | source |
|---|---:|---|---:|---:|---:|---|
| Automated checks passing | 1298 count | 2026-09-12 | 1298 count | >= 1298 count | 1298 count | `cd app && npm run check`; `node scripts/release-workflow-checks.mjs`; `JAVA_HOME=/tmp/iou-device-debug/jdk-17.0.20.1+1 node scripts/native-pin-checks.mjs` |
| TypeScript | PASS | 2026-09-12 | PASS | = PASS | PASS | `cd app && npm run typecheck` |
| Alpha 9 production APK | PASS | 2026-09-12 | PASS | = PASS | PASS | [Release workflow](https://github.com/witcherxz/iou/actions/runs/34713790800); [independent APK verification](app/docs/verification/alpha9-apk.json) |
| Native card text alignment | PASS | 2026-09-12 | FAIL | = PASS | PASS | [Native baseline](app/docs/verification/alpha9-native-before.json); [11 native comparisons](app/docs/verification/alpha9-native.json) |

## DoD — Alpha 9 Arabic card alignment

- [x] Remove the redundant debt prefix while retaining direction labels.
- [x] Correct native RTL text alignment without reversing correctly ordered rows.
- [x] Preserve explicit centered controls and existing number/date inputs.
- [x] Pass TypeScript and integrated checks.
- [x] Verify browser card alignment and existing history workflows.
- [x] Publish and independently verify the signed Alpha 9 APK.
- [x] Verify right-aligned native names, counts and transaction descriptions on the emulator.

## Blockers / Risks

- Compact native labels clip in the forgiveness selector and a debt-status badge. A fresh Alpha 8 baseline reproduced the selector pixel-for-pixel, confirming this predates Alpha 9. Response: correct compact-label sizing in the next UI pass; full transaction type headings remain visible in history.

- PIN performance, automatic biometric prompting, cancellation/PIN fallback and native share/Drive upload-screen navigation are confirmed on the connected S24 Ultra. Alpha 6 local emulator folder save/recovery and in-window confirmations pass. Completed Dropbox-specific provider writes remain unverified after the Alpha 5 confirmation blocker; validate that provider separately. Full app-switcher privacy, TalkBack/font scaling and notifications still need native validation. Response: test the updated folder flow and complete broader validation before a stable release.
- Direct Google Drive authorization is unfinished. Response: keep direct sync disabled and offer the tested manual share/download and file-restore flow. Drive upload-screen navigation is verified; upload completion remains unverified.
- The app lock controls access; ordinary local/folder/CSV/report data remains readable. Protected manual exports use a separate password. Response: explain the distinction and keep off-device copies private.
- Automatic backups run after foreground edits and are suspended after local recovery; reminders retain the nearest 60 alerts plus weekly and refresh on foreground. Response: explain these operating limits in the feature notes.

## Decisions

- 2026-09-12: Facing an undefined alpha exit milestone, chose explicit user confirmation that core features are complete before beta, to match the product's intended scope, accepting further alpha builds until that confirmation.

- 2026-09-12: Facing a template-signed APK with seeded records, chose a separate production identity and dedicated release key, to start clean while preserving the old app for export, accepting explicit backup import for users upgrading from debug builds.

- 2026-09-12: Facing mistaken financial entries, chose validated corrections and reversible cancellation over destructive deletion, to retain original records and trace balance changes, accepting visible history and payment-dependency checks.
- 2026-09-12: Facing app-independent recovery needs, chose self-contained HTML plus spreadsheet CSVs and interoperable optional encryption, to keep records usable without IoU, accepting that ordinary folder exports remain readable.

- 2026-09-12: Facing a request for Material 3, chose shared semantic tokens and adapted React Native components over a separate web-only UI kit, to keep one Arabic interface across platforms, accepting responsibility for native accessibility validation.

- 2026-09-12: Facing mixed-direction debts, chose explicit received/paid settlement and separate gross totals over implicit net settlement, to preserve actual obligations, accepting one direction choice when both sides owe.
- 2026-09-12: Facing an unverified Google native OAuth flow, chose to keep direct Drive disabled over exposing a connection after adding IDs, to avoid promising unusable backup, accepting file/folder backup as the available paths.
- 2026-09-12: Facing potential overwrite of external backups during startup or recovery, chose explicit first save and suspended automatic backup after local recovery, to protect older/newer copies, accepting a manual review step.

## Log

- 2026-09-12 [release]: Published Alpha 9 from 9bd6af4 after both Actions runs passed. Independently verified the 72,416,386-byte APK and installed it over Alpha 8. All 11 native text comparisons passed, along with centered amount/action and ISO date checks. A separate temporary emulator confirmed compact selector clipping already existed in Alpha 8; it was stopped cleanly. No ledger saves occurred during the Alpha 9 comparison. [Native evidence](app/docs/verification/alpha9-native.json).

- 2026-09-12 [work]: Reproduced native text painted on the left inside RTL Home card boxes. Traced the behavior to mirrored explicit right alignment in React Native; changed shared text to native automatic alignment with explicit RTL paragraphs and preserved web/caller overrides. Removed the redundant person-history debt prefix. TypeScript and 1,298 integrated checks pass; preparing Alpha 9 and visual verification.

- 2026-09-12 [release]: Published Alpha 8 from 111d81c after both Actions runs passed. Independently verified the 72,416,406-byte production APK and installed it over Alpha 7 on the isolated emulator. Native HOME/PIN cycles preserved the entire exemption draft and its successful receipt. A local backup verified exactly one new 13.50 exemption with the selected date/note, unchanged previous records/audits, no duplicate, and exact agreement across 14 files and seven snapshots. [Native verification record](app/docs/verification/alpha8-native.json).

- 2026-09-12 [work]: Reproduced Alpha 7 native settlement draft reset after background/PIN unlock (partial exemption13.50 became full payment63.67); cancelled without saving. Lifted the whole session/receipt above PrivacyGate and guarded stale completions. Added clear shared payment/exemption history rows, separate amount labels/icons/notes and paid/waived summaries. TypeScript, 1,298 integrated checks, 19 full-App history/creation/privacy UI, 14 financial workflows and 4 actual privacy lifecycle scenarios pass; preparing Alpha 8.

- 2026-09-12 [release]: Published Alpha 7 from 1685bed after both Actions runs and 1,298 integrated checks passed. Independently verified the 72,412,646-byte production APK, signature, manifest, fixture-free bundle and native modules, then installed it over Alpha 6 in the isolated Android 16 emulator. Native preview/save preserves paid rows, cash and forgiveness records while changing remaining days with short-month clamping; the exported ledger has one exact audit change. Native Undo and a subsequent backup restored the complete original debt exactly and retained the reversal; [verification record](app/docs/verification/alpha7-native.json).

- 2026-09-12 [work]: Implemented bulk monthly installment-day previews with completed-row preservation, month-end clamping and single audited save/undo. Added 39 domain checks; 1,298 integrated checks and TypeScript pass. Android 16 emulator completed first and second local SAF backups and older-version restore; independently verified canonical, snapshots, readable report and CSV agreement. Alpha 7 screen validation and publication are in progress.

- 2026-09-12 [release]: Published Alpha 6 from 17cb8c0 after both Actions runs and 1,259 integrated checks passed. Independently verified the downloaded production APK signature, manifest, offline bundle, and both native modules. Emulator setup and native confirmation/backup/amount tests are in progress; no further phone actions.

- 2026-09-12 [work]: User requested ending dependence on the connected phone and using an Android emulator. Stopped phone actions; setting up an isolated emulator for Alpha 6 native backup, dialog, lock, and amount/draft tests. Phone remains on Alpha 5; no synthetic records were saved there.

- 2026-09-12 [work]: Prepared Alpha 6 after the user requested OS keyboard input: removed embedded keypads from debt and settlement screens, with eight form and fourteen settlement/edit/export UI scenarios passing. Native Alpha 5 backup attempts reproduced confirmation-triggered focus locking while IoU remained resumed; replaced Android modal windows with in-window dialogs. Passed 1,259 integrated checks and TypeScript. A held-decryption regression confirmed a native restore alert could appear/apply after locking; confirmations now cancel when their private host is unavailable, and the same test confirms no preview or restore while locked. Eight independent real-provider/gate dialog scenarios passed for confirmation queues, Back ordering, background cancellation, and narrow dialog layouts.

- 2026-09-12 [release]: Published and installed Alpha 5 from 0ac6046 after both Actions runs and 1,254 integrated checks passed. Independent APK verification confirmed signature, manifest, offline bundle and both native modules. Provider writes remain unverified because opening the existing-backup confirmation cancels through the privacy focus lock before writing; no backup error or timestamp change was observed.

- 2026-09-12 [work]: Prepared Alpha 5 with paired native document metadata, owned and explicitly closed native output streams, strict recovery identities, and entry drafts held above the privacy gate. Passed 1,254 integrated checks, TypeScript, eight full Expo form-flow scenarios, seven real privacy-gate lifecycle scenarios (including the failing previous source), and six asynchronous backup-hook scenarios. Provider tests cover opaque IDs, duplicates, actual Expo URL parsing, and stalled metadata queries. Native verification follows the production build.

- 2026-09-12 [release]: Published and installed Alpha 4 from 6f4a4f2 after both Actions runs and 1,231 checks passed. Independent APK verification passed. Native retry failed with FOLDER_SNAPSHOT_IO before a new recovery snapshot was verified; no JS error or native crash occurred. This remaining Dropbox provider failure is the Alpha 5 target.

- 2026-09-12 [review]: Corrected stale Alpha 4 preparation status after publication and installation; native folder completion remains failed rather than assumed successful from automated checks.

- 2026-09-12 [work]: Prepared Alpha 4 after direct ADB reproduction reached Drive's upload screen through More and scrolling. Added matching guidance, explicit truncation for Android document rewrites, and sanitized partial-backup errors. Full app checks (55 backup assertions), TypeScript, 57 release guards and five real-hook bookkeeping scenarios passed. Provider truncation is a verified compatibility issue; the phone's earlier generic folder failure remains unconfirmed pending the updated native test.

- 2026-09-12 [release]: Published and installed Alpha 3 from e8bf4a3 after both Actions runs and 1,228 automated checks passed. Independently verified APK checksum/signature/manifest/native module. Phone tests confirmed automatic biometrics, cancellation without loops, PIN fallback and re-entry from Drive. Drive's upload screen was reached via More and scrolling; no upload or backup-folder change occurred. Investigating the separate generic folder error and preparing truncation/partial-save improvements.

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
