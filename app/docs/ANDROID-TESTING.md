# Android emulator testing

Native QA uses an isolated Android 16 / API 36 Google APIs x86_64 emulator with KVM acceleration. It has no cloud account and contains only synthetic ledger records. The production APK installs under its real package and signature, so native modules, release bundling, upgrades, storage, and the Android keyboard are exercised together.

The workstation launcher and explicit-target ADB wrapper are outside the repository:

```bash
/home/ak/.cache/iou-android-emulator/launch-emulator.sh
/home/ak/.cache/iou-android-emulator/adb-emulator.sh install -r /path/to/iou-VERSION.apk
```

The wrapper targets `emulator-5580` exclusively. Always specify this target; do not use bare ADB when a user's phone might also be attached. The SDK and AVD reside under `/home/ak/.cache/iou-android-emulator/`. PIN credentials for fabricated test data also stay outside the repository. No test records or credentials belong in the runtime app bundle.

For a headless AVD with a virtual hardware keyboard, enable the emulator's OS keyboard:

```bash
/home/ak/.cache/iou-android-emulator/adb-emulator.sh shell settings put secure show_ime_with_hard_keyboard 1
```

Run UI Automator operations sequentially. Ignore offscreen or inverted node bounds. When dismissing the keyboard, use the current `mInputShown` state from `dumpsys input_method`; cached IME flags can remain true after the keyboard closes and cause an extra Back press.

## Native scenarios

- Fill a debt, then add its person inline. Save and verify the amount, note, actual date, direction and installment schedule in a backup.
- Tap amount to show the OS keyboard. Background an unfinished form, unlock, and verify the draft before explicitly cancelling it.
- Enable PIN lock and verify unlock. With no biometric enrolled, verify PIN fallback. Biometric success on physical hardware needs separate verification.
- Choose a local folder through Android's document picker. Verify external picker return locks the app, while an in-app backup confirmation stays unlocked.
- Save two distinct ledgers to that folder. Open history, cancel a restore preview with Android Back, then restore an older copy deliberately. Save the smaller ledger again and verify that rewritten JSON/HTML/CSVs have no trailing bytes and retained snapshots remain usable.
- For installment editing, preview a new monthly day, save, reopen, and undo. Verify short months and completed installments through isolated browser and core tests as well.

A local document provider verifies the Android storage framework and app behavior. It does not establish completion through Dropbox or Drive accounts. Never claim cloud upload completion from merely reaching a provider's upload screen.

## Reproducible browser checks

Start a separate Expo web preview on port 8147 and use fresh browser contexts with synthetic records:

```bash
PLAYWRIGHT_MODULE=/path/to/@playwright/test node scripts/add-debt-ui-checks.cjs
PLAYWRIGHT_MODULE=/path/to/@playwright/test node scripts/installment-day-ui-checks.cjs
```

These complement native QA; they do not replace testing Android focus, keyboard and document-provider behavior.
