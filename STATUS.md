# STATUS — IoU
Updated: 2026-09-12 | State: ACTIVE
Goal: Provide a private Arabic debt ledger with clear balances and recoverable records.
Phase: alpha

## Now
Production-signed [0.1.0-alpha.1](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.1) is published. Main and tag workflows passed; the downloaded APK independently passed checksum, signature, manifest and sample-data checks. Begin native device validation for the next alpha.

Next:
1. Install the alpha on a device and validate biometrics, app-switcher privacy, TalkBack, keyboard and notifications.
2. Verify folder providers, readable exports and recovery on a device; direct Google Drive stays disabled until native authorization is completed.
3. Collect alpha feedback and preserve the production signing key for future updates.

## Health

| metric | current | measured | previous | threshold | goal | source |
|---|---:|---|---:|---:|---:|---|
| Automated checks passing | 1082 count | 2026-09-12 | 1076 count | >= 1082 count | 1082 count | `cd app && npm run check`; `node scripts/release-workflow-checks.mjs`; `/tmp/iou-alpha/checks.log` |
| TypeScript | PASS | 2026-09-12 | PASS | = PASS | PASS | `cd app && npm run typecheck` |
| Clean launch and preservation scenarios | 8 count | 2026-09-12 | — | >= 8 count | 8 count | `/tmp/iou-release/clean-install-results.json`; `/tmp/iou-alpha/production-browser-results.json` |
| GitHub production APK | PASS | 2026-09-12 | FAIL | = PASS | PASS | [Successful release workflow](https://github.com/witcherxz/iou/actions/runs/34681048490); [download verification record](app/docs/RELEASING.md#verified-alpha-release) |

## DoD — 0.1 Alpha production release

- [x] Remove demo fixtures from the app dependency graph and preserve existing ledgers.
- [x] Set version 0.1.0-alpha.1 / code 1 and production package `io.github.witcherxz.iou`.
- [x] Replace template artwork and show the version in Settings.
- [x] Configure dedicated signing credentials outside Git and fail release builds without them.
- [x] Check APK version, package, certificate, non-debuggable manifest and sample-free bundle before upload.
- [x] Pass automated guards, TypeScript, clean-install/upgrade browser checks, workflow lint and prebuild.
- [x] Commit/push reviewed work and tag v0.1.0-alpha.1.
- [x] Verify GitHub's signed APK, checksum and published prerelease.

## Blockers / Risks

- Native biometrics, app-switcher privacy, TalkBack/font scaling, folder grants, sharing and notification delivery are unmeasured without a device. Response: complete device validation before a stable release; browser and bundle checks do not establish native behavior.
- Direct Google Drive authorization is unfinished. Response: keep `expo.extra.google.enabled` false until supported authorization and credentialed device tests pass.
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

- 2026-09-12 [release]: Published v0.1.0-alpha.1 from commit 7762dfd after correcting SDK 37 certificate parsing. Main and tag Actions runs passed all 1,082 checks and the signed production build. Downloaded the 72,361,378-byte APK and independently verified its SHA-256, pinned signature, production identity/version, Arabic label, non-debuggable manifest, absent overlay permission and fixture-free offline bundle. Fresh-install and preservation browser checks passed earlier; native hardware validation remains for the alpha.

- 2026-09-12 [incident]: The first parser correction covered SDK 37 V3 labels but missed Gradle's V2-only signature. Replaced the scheme-label whitelist with verification of every non-source-stamp certificate digest against the pinned key. Passed 49 release checks, including the complete CI output; APK signature, package, version and non-debuggable manifest had already passed before this parser error.

- 2026-09-12 [incident]: First alpha APK compiled in GitHub Actions, but its certificate parser rejected SDK 37's new `V3.0 Signer:` label and prevented publication. Reproduced with the official SDK 37 binary, retained strict certificate pinning, and passed 43 release checks plus real SDK 36/37 output probes. Retrying the unpublished tag after the verifier correction.

- 2026-09-12 [work]: Prepared 0.1.0-alpha.1 production packaging, fixture-free initialization, app branding, release signing secrets, guarded APK workflow and tagged prerelease publishing. Passed 1,061 automated assertions, TypeScript, eight clean-install/preservation scenarios, actionlint and Android prebuild. User authorized commit and push; GitHub APK validation remains pending.

- 2026-09-12 [work]: Implemented all five requested features with v1 migration, 10-version recovery, optional encrypted reports and biometric/PIN lock. Fixed backdated-payment balance summaries and web switch/selection semantics during integration. Passed 1,014 automated assertions, TypeScript, 57 isolated browser/report workflows and Android production export. Added `app/docs/FEATURES.md` and screenshots. No commit or push performed.

- 2026-09-12 [work]: Removed Home people-direction filters and their navigation state. All people, including payable-only and debt-free records, now appear directly. TypeScript and focused browser checks at 320/390/1440 passed; updated home screenshots.

- 2026-09-12 [work]: Applied requested Western Arabic 0–9 digits throughout generated UI text and amount entry; retained Arabic/Persian input acceptance. TypeScript, 624 assertions and 19 browser workflows passed. Refreshed current screenshots and verified amount/date normalization and numeric restore previews.

- 2026-09-12 [work]: Implemented Material 3 screens, tonal themes, local Material Symbols, adaptive RTL navigation and themed confirmations. Passed 624 core/backup/contrast assertions, TypeScript, 19 browser workflows, 72 viewport/theme captures and Android production export. Added current screenshots and design notes.

- 2026-09-12 [work]: Reviewed UI/UX, backup methods and ledger logic; implemented fixes; 128 core/backup checks, TypeScript, 19 browser scenarios and Android bundle export passed. Added screenshots and documented native release work. No commit or push performed.
