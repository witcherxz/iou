# Android alpha releases

The application version is `0.1.0-alpha.10`, Android version code `10`, and production application ID `io.github.witcherxz.iou`. The same version is recorded in `app.json`, `package.json`, and the package-lock root. iOS uses the numeric marketing version `0.1.0` and build number `10` if built separately.

## Build and publish

1. Update the version in all three files, increase Android `versionCode`, and add `docs/releases/<version>.md`.
2. Run `npm run typecheck` and `npm run check`. The release check traverses the production source graph and rejects test fixtures, mocks, sample ledger markers and seeding switches.
3. Commit/push the reviewed changes. Main-branch Actions runs produce a signed APK artifact.
4. Push a matching version tag, such as `v0.1.0-alpha.10`. Actions builds and verifies the APK, then publishes it and its `.apk.sha256` checksum to a GitHub prerelease. Tag/version mismatches fail.

The workflow runs checks for pull requests without exposing signing credentials. Release builds use Node 22, JDK 17, Expo prebuild, and Gradle `:app:assembleRelease`. A Gradle init script assigns the dedicated release signing configuration and disables debugging; it does not silently fall back to the template debug key.

Before upload, the APK verifier checks package ID, version name/code, non-debuggable manifest, signature certificate, embedded Hermes/JavaScript and absence of demo fixture content. Downloaded APK checksums can be verified using:

```bash
sha256sum -c iou-0.1.0-alpha.10.apk.sha256
```

## Signing key

Repository Actions secrets contain `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, and `ANDROID_KEY_PASSWORD`. The key is a password-protected PKCS12 store with alias `iou-release`. All four secrets must be present. Signing material is decoded only into the runner's temporary directory and removed after the build. Key/password files must never be committed or uploaded with artifacts.

The public release certificate SHA-256 is:

```text
9a191eff750459eb5a2508e7875c9bad4bf4062fa488de057f6b4cf491faf5a6
```

The initial encrypted store and its private credential record are retained locally outside the repository at `/home/ak/.local/share/iou/signing/`, with directory mode `700` and file mode `600`. Keep a protected backup of that directory: future APK updates must use the same signing key. GitHub secrets cannot be retrieved as a replacement key backup. Certificate fingerprints are public; private keys and passwords are not.

## Production data and migration

Fresh installations create empty `دفتري` defaults only after all storage sources have been read successfully and found empty. Sample records live in `scripts/fixtures` and are excluded from runtime imports. The release verifier also scans the packaged JavaScript for fixture markers. Existing data is never removed by matching people's names or transaction contents.

The old debug package was `com.example.iou` and used the Expo template signing key. The production package installs separately, preserving the old app for backup/export. Import real records into the alpha and verify them before removing the old app. Future releases retain the production ID and signing key and increment the version code.

Alpha release notes record remaining device verification, including biometrics, notification delivery, app-switcher privacy and folder-provider behavior. A successful production build establishes packaging and signing, not hardware behavior.

## Verified alpha release

### Alpha 10

On 2026-09-12, [v0.1.0-alpha.10](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.10) was published from `a6ea9180aa8e145905399312f6e4f38db11a045c` after the user approved the name editor and pencil entry point. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34717292669) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34717292797) passed 1,354 integrated checks and the signed production build. Nine full-App browser scenarios passed locally with no browser errors; [browser evidence](verification/alpha10-browser.json).

The independently verified APK is 72,420,418 bytes, version `0.1.0-alpha.10` / code `10`, with the unchanged production identity and signing key. Signature, non-debuggable manifest, fixture-free offline bundle and both native module checks passed. [APK evidence](verification/alpha10-apk.json).

```text
a0a0652e412b801c3c25d5b19dcb1fe5bce5afd31e6ba7dc5ab122a267d974d2
```

The published APK installed over Alpha 9 on the isolated Android 16 emulator. Native Cancel and hardware Back discard drafts; the system keyboard opens, the full Save label fits, and HOME/PIN unlock preserves the name before a single save. Home, person and debt details use the new name with four transactions and the unchanged 50.17 balance. A successful folder backup independently confirmed that only one person name and the backup timestamp changed: IDs, all transactions, audits, settings and installment allocations remained exact. The previous backup and seven old snapshots stayed intact, and HTML/CSV companions matched the new canonical data across all 15 files. [Native evidence](verification/alpha10-native.json) and [screenshots](ANDROID-TESTING.md#alpha-10--editing-a-persons-name). Search remains deferred, and alpha-to-beta promotion requires the user's confirmation that core scope is complete.

### Alpha 9

On 2026-09-12, [v0.1.0-alpha.9](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.9) was published from `9bd6af490df1f7d97e90de4b67a189bd708b56f7`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34713790800) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34713790845) passed 1,298 integrated checks and the signed production build. Four focused RTL browser cases and 19 existing history/privacy workflows passed locally.

The independently verified APK is 72,416,386 bytes, version `0.1.0-alpha.9` / code `9`, with the unchanged production identity and signing key. Signature, non-debuggable manifest, fixture-free offline bundle and both native module checks passed. [APK evidence](verification/alpha9-apk.json).

```text
6b8d5015271bdbd35cb48e4fd4101a31e0b575244a256774588ce1ee404b72ae
```

The APK installed over Alpha 8 on the isolated Android 16 emulator. All 11 before/after text comparisons passed: names, operation counts, transaction headings and descriptions align right, the debt heading is shorter, and centered controls retain their alignment. The centered amount and left-to-right ISO date remained correct through read-only focus/cancellation. [Native evidence](verification/alpha9-native.json) and [screenshots](ANDROID-TESTING.md#alpha-9-regression--native-rtl-text-alignment). No ledger saves or phone actions were used for this comparison.

Separate compact-label clipping remains in the forgiveness selector and a debt-status badge. A fresh Alpha 8 install on a second temporary emulator reproduced the selector identically, confirming it predates this update; that emulator was stopped after the comparison. This issue is tracked for a separate UI correction.

### Alpha 8

On 2026-09-12, [v0.1.0-alpha.8](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.8) was published from `111d81c6b9c85a73c436c332977b534802ec572e`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34710749894) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34710749817) passed, including 1,298 integrated checks and the signed production build. Nineteen full-App history/creation/privacy UI scenarios, fourteen existing financial workflows and four real privacy lifecycle scenarios passed locally.

The independently verified APK is 72,416,406 bytes, version `0.1.0-alpha.8` / code `8`, with the unchanged production identity and signing key. Signature, non-debuggable manifest, fixture-free offline bundle, native PIN worker and native backup module checks passed.

```text
f71bb165e954361c6956b81fcb53c4a2ab95f627758fe207708fbeb424722a67
```

The published APK installed over Alpha 7 in the isolated Android 16 emulator and retained the PIN and ledger. The same HOME/PIN cycle that failed on Alpha 7 preserved the complete partial exemption draft on Alpha 8. Exactly one 13.50 exemption was saved with the selected date/note; another lock/unlock preserved the receipt without reopening a submission form. Cash and exemptions appeared distinctly in history. A successful local folder backup independently verified all previous transactions/audits unchanged, paid 41.83, forgiven 33.50 and remaining 50.17, with exact HTML/CSV companions and all retained snapshots intact. [Native verification record](verification/alpha8-native.json). No phone connection or action was used.

### Alpha 7

On 2026-09-12, [v0.1.0-alpha.7](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.7) was published from `1685bed4f4e0b1d7b4ac3e5528fc02d6724cdc3b`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34708711318) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34708711255) passed, including 1,298 integrated checks and the signed production build. Eighteen full Expo installment-day screen scenarios passed locally with no browser errors.

The independently verified APK is 72,412,646 bytes, version `0.1.0-alpha.7` / code `7`, with the unchanged production identity and signing key. Signature, manifest, fixture-free offline bundle, native PIN worker and native backup module checks passed.

```text
8f7225eb6f1e78b27f4a743a9697f9f43bce2bea421906397fdadfe30ff132b9
```

The published APK installed over Alpha 6 in the isolated Android 16 emulator and retained the existing PIN and ledger. Native day-31 preview/save/undo passed: the paid first installment stayed on September 17; the partially forgiven next row moved to October 31 and the last row clamped to November 30. A folder backup verified one exact audit change with cash/forgiveness records intact. Undo and a second backup restored the original debt exactly and retained the reversal in history. [Native verification record](verification/alpha7-native.json). The physical phone remains on Alpha 5; no further phone connection or action was used.

### Alpha 6

On 2026-09-12, [v0.1.0-alpha.6](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.6) was published from `17cb8c026d902a3edfd0d0d4b8304efb30e9b3bd`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34706442794) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34706444947) passed, including 1,259 integrated checks and the signed production build. Eight full entry-flow, fourteen settlement/edit/export, and eight independent privacy/dialog lifecycle scenarios passed locally. A held-decryption test confirms a locked app cannot display or apply a late restore confirmation.

The independently verified APK is 72,407,090 bytes, version `0.1.0-alpha.6` / code `6`, with the unchanged production identity and signing key. Signature, manifest, fixture-free offline bundle, native PIN worker and native backup module checks passed.

```text
aa15ef8e40fea6fedeca4133960832debb68ff9143c7abca20d2ae9dfcc54145
```

The user requested switching remaining native testing to an emulator. Phone testing stopped with Alpha 5 installed; Alpha 6 was installed in an isolated Android 16/API 36 emulator. PIN setup/unlock, background draft preservation, actual OS keyboard display, existing-backup confirmation without focus locking, local folder save, older-version restore, and Android Back cancellation passed. Three native backups, including smaller-file rewrites, were independently verified across canonical JSON, retained snapshots, readable HTML, and CSV companions. Dropbox account/provider behavior remains separately unverified.

### Alpha 5

On 2026-09-12, [v0.1.0-alpha.5](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.5) was published from `0ac6046d3a6af11a901416ed4d05633ab0c059d2`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34705200101) and [main workflow](https://github.com/witcherxz/iou/actions/runs/34705200048) passed, including 1,254 automated checks and the signed production build. Eight full Expo entry-flow, seven privacy-gate lifecycle, and six asynchronous backup-hook scenarios also passed locally.

The independently verified APK is 72,405,462 bytes, version `0.1.0-alpha.5` / code `5`, with the unchanged production identity and signing key. Signature, manifest, fixture-free offline bundle, native PIN worker and new native backup module checks passed.

```text
983ce6b92062e78775e89055db08606beaaab4ca814f1c3885e5711cb112b6c6
```

The update installed over Alpha 4 and retained lock settings. Three native backup attempts exposed a separate confirmation/privacy interaction: opening the existing-backup confirmation locks the app and cancels before a write, without a backup error or timestamp change. The app remained the top resumed activity; the focused window stayed in IoU, with no biometric prompt or app error. Alpha 6 moves Android dialogs into the existing app window. Alpha 5 must not be treated as verified completed Dropbox folder backup/recovery.

### Alpha 4

On 2026-09-12, [v0.1.0-alpha.4](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.4) was published from `6f4a4f28824585fc20543cce0da914726fb95f84`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34703133871) and main workflow passed, including 1,231 automated checks, TypeScript and the signed production build. Five partial-backup hook scenarios also passed locally.

The independently verified APK is 72,379,134 bytes, version `0.1.0-alpha.4` / code `4`, with the unchanged production identity and pinned signing key.

```text
8df8e101d4c2bc71dd4b4b5a367bff692e331f9ea58b065005664b9bebde66b0
```

The update installed over Alpha 3 and preserved PIN/biometric entry. Retrying the existing Dropbox folder through the app produced `FOLDER_SNAPSHOT_IO` before a recovery snapshot could be verified, without a JavaScript error or native crash. This exposed a remaining provider-specific path despite the successful generic provider tests. Alpha 5 addresses new-document writes and provider display-name metadata; Alpha 4 should not be treated as verified Dropbox folder recovery.

### Alpha 3

On 2026-09-12, [v0.1.0-alpha.3](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.3) was published from commit `e8bf4a3e649bd44bc577b86c75a1968f18bded2c`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34701892262) and main workflow passed, including 1,228 automated checks, TypeScript, native compilation and publication. Sixteen independent React biometric lifecycle scenarios also passed locally.

The independently downloaded APK is 72,377,614 bytes, version `0.1.0-alpha.3` / code `3`, and retains the same production package and pinned signing key. Its manifest, offline bundle, absent demo fixtures and compiled native PIN worker were verified again.

```text
866c5f6c79bbacc30991149ad963235e3a83396d23dec6a8e620b5f0e8157029
```

The update installed successfully over Alpha 2 on the connected S24 Ultra. ADB observed automatic biometric dialogs on initial launch, return from background, and return from Drive's upload screen. Successful biometric entry, cancellation leaving the lock closed without a prompt loop, and subsequent PIN unlock passed on the phone. Diagnostics retained only generic focus transitions and app-specific error counters; no PIN or ledger contents were logged.

### Alpha 2

On 2026-09-12, [v0.1.0-alpha.2](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.2) was published from commit `18e786ec512f28ad7e83c0cf6318de2a891cc409`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34700682863) and main workflow passed, including 1,206 automated checks, TypeScript, native compilation and publication. Thirty isolated browser/Drive scenarios also passed locally.

The independently downloaded APK is 72,375,806 bytes, uses production package `io.github.witcherxz.iou`, version `0.1.0-alpha.2` / code `2`, and the same pinned release key. Verification confirmed debugging disabled, no overlay permission or demo fixtures, the offline bundle, and both compiled native PIN worker classes in DEX.

```text
537aa3a528136384ec9a590bbd9fe16db7d32c66c7ecaf1b55b40fab66ecfa06
```

ADB confirmed a successful update over Alpha 1 on a Samsung S24 Ultra (`SM-S928B`, Android 16/API 36). Before updating, app-specific diagnostics captured roughly two minutes of original PIN setup work, with about 70 seconds of JavaScript CPU time and no JavaScript error, native crash or storage error. The user confirmed that Alpha 2 PIN unlock works promptly. The observed attempt used about 0.50 seconds of native-worker CPU time with no sustained JavaScript spike or errors; CPU time is not a wall-clock latency measurement. Drive share-provider confirmation is pending. No PIN or ledger content was collected for diagnostics.

### Alpha 1

On 2026-09-12, [v0.1.0-alpha.1](https://github.com/witcherxz/iou/releases/tag/v0.1.0-alpha.1) was published from commit `7762dfd041a35c34b4e21adacfe102be943139cb`. The [release workflow](https://github.com/witcherxz/iou/actions/runs/34681048490) passed TypeScript, 1,082 automated checks, native compilation, APK verification and publication. The main-branch workflow also passed.

The published `iou-0.1.0-alpha.1.apk` is 72,361,378 bytes. An independent download check verified its signature with Android SDK 37 and the pinned release certificate above. Android `aapt2` confirmed package `io.github.witcherxz.iou`, version `0.1.0-alpha.1` / code `1`, Arabic launcher label `دفتر الديون`, debugging disabled and no `SYSTEM_ALERT_WINDOW` permission. The APK contains its offline bundle, no signing-key files and none of the demo fixture markers.

The downloaded APK matches the published SHA-256:

```text
e5d8124871274f31d8484ab76d2bfcb0011aa9c3d8e9c939d22e2aa715f74d0b
```
