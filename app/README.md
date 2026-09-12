# دفتر الديون — IoU / UoM

React Native (Expo SDK 57) app based on the Claude Design prototype in
`../design/project/IoU App.dc.html`, now using Material 3 components and color roles.

A private, Arabic-first, right-to-left debt ledger in Saudi Riyal: who owes you,
who you owe, instalment plans, dated settlements and corrections, optional privacy
lock, flexible local reminders, and portable file/folder backups.

## Running

Use Node.js 22.13 or later for Expo SDK 57.

```bash
npm install
npm start          # then press "a" for Android, or scan the QR code
npm run android    # build + launch on a connected device/emulator
```

Quality gates:

```bash
npm run typecheck  # tsc --noEmit
npm run check      # ledger, recovery, privacy, encryption, reminders and contrast
```

`npm run web` renders the same screens in a browser, which is handy for a
quick visual check of layout and theming.

Native folder permissions and local notifications require validation in an
Android development build: `npx expo run:android`. The direct Google Drive
integration is disabled pending supported native authorization and device tests.

## Backup

The backup destination is chosen by the user in Settings → النسخ الاحتياطي, and
stored in `backupTarget` / `backupFolderUri`. All destinations serialise the same
payload, so a book backed up to a folder can be restored from a file and vice
versa.

| Target | Module | Setup | Automatic |
|---|---|---|---|
| `folder` | `src/backup/folder.ts` | user picks a folder once | yes |
| `file` | `src/backup/fileShare.ts` | none | no (manual export/import) |
| `drive` | `src/backup/fileShare.ts` (manual); `src/backup/google.ts` (disabled direct transport) | share to the installed Drive app, or upload the downloaded report | no in the current build |
| `none` | — | — | — |

`src/useBackup.ts` dispatches across them and owns the debounced auto-backup.

### Folder

Android keeps the permission obtained through `Directory.pickDirectoryAsync()`
across restarts. On iOS, the folder may need to be selected again after a cold
start. Folder selection is unavailable in the browser; use file download/import.

Choose the destination, then restore an existing backup or save the first copy
with **نسخ الآن**. The first save asks before replacing an existing backup.
Automatic backups require a confirmed first copy, follow edits after five seconds,
and run only while the app is open. Startup and destination selection do not
upload. Errors stay visible until a manual retry; an automatic failure never
opens a sign-in prompt.

Writes create immutable dated JSON snapshots and verify them by reading back.
The folder retains the latest 10 valid dated snapshots, plus latest/previous
compatibility mirrors, an offline HTML report, and four CSV companions. If the
latest copy is damaged, restore can select the newest valid historical version.
The device separately retains 10 recovery points before ledger changes.

A local folder is still on the same device. Keep a copy elsewhere to survive
losing the phone. Cloud synchronization depends on the folder provider and must
be checked separately; choosing a folder does not itself enable cloud sync.

### File and restore

Mobile export writes to the cache and opens `expo-sharing`. Opening or dismissing
the share sheet does not prove a copy was saved, so it does not update the
confirmed backup timestamp. The default manual export is `iou-ledger.html`,
a standalone offline Arabic report with embedded recoverable JSON and CSV
downloads for spreadsheets. Optional protected HTML uses a separate password.
Import accepts ordinary/protected HTML and legacy JSON, even before choosing
a destination and from the storage recovery screen.

Before restore, the app validates the format version, dates, money precision,
unique IDs, people/debt/payment references, payment totals, and installment sums.
It previews the backup date and record counts and asks before replacing the
ledger. Cancellation leaves the ledger unchanged. Restore waits for local
persistence before reporting success, and retains a local recovery snapshot.

Backups include ledger data and portable preferences, excluding device folder
permissions, backup destination/status, and credentials. Legacy version 1 exports
remain readable when their ledger data is valid. Ordinary folder/report/CSV
exports are readable; optional protected HTML encrypts the entire report.
The device PIN and biometric settings never leave this device. See
[`docs/BACKUPS.md`](docs/BACKUPS.md) for formats, retention and encryption.

### Google Drive (manual export/import; direct synchronization unfinished)

The selectable **Google Drive (يدوي)** destination opens a readable report in the
share sheet on phones, or downloads it on web. Its restore action uses the file
picker and the same validated preview as any file import. The user finishes the
upload in Drive. Selecting, sharing, dismissing the share sheet, and importing a
manual report do not establish a synchronized timestamp or enable auto-backup.

The Drive transport targets `appDataFolder` with the `drive.appdata` scope, but
**the current generic `iou://oauthredirect` sign-in flow is not a release-ready
Google native integration**. Google no longer supports this custom-URI flow for
Android, and iOS requires a correctly registered callback. Adding client IDs
alone will not fix that. See [Google's native OAuth documentation](https://developers.google.com/identity/protocols/oauth2/native-app)
and [Expo's Google authentication guide](https://docs.expo.dev/guides/google-authentication/).

`expo.extra.google.enabled` defaults to `false`, independently of placeholder
client IDs. Before enabling it, implement supported platform authorization,
configure the Google project/API, scope and consent, match the app identity and
signing certificate, and verify sign-in, token refresh, backup, restore, and
revoked access on a real development build. Credentials are not included here.

The manual Drive controls remain available while direct authorization is disabled;
the UI describes each manual save and restoration step. See
[`docs/BACKUPS.md`](docs/BACKUPS.md#google-drive) for the user flow and limitations.

## Architecture

```
App.tsx                 screen/tab state machine, Android back handling, theming
src/store/store.tsx     serialized persistence + visible recovery (AsyncStorage)
src/ledger.ts          validated debt/payment mutations with integer halalas
src/validation.ts      shared whole-ledger validation for storage and restore
src/selectors.ts        derived views: balances, remaining amounts, badges, schedules
src/format.ts           Arabic labels with 0–9 numerals and calendar dates
src/theme.ts            Material 3 tonal palettes, Arabic type and layout tokens
src/reminders.ts        serialized local notification scheduling
src/reminderPlan.ts     advance/overdue/weekly planning and snoozes
src/privacy/            optional biometric/PIN gate and settings
src/store/history.ts    dated local snapshots and corruption recovery
src/useBackup.ts        backup orchestration across destinations
src/backup/folder.ts    user-picked folder (Storage Access Framework)
src/backup/fileShare.ts share-sheet export / file-picker import
src/backup/google.ts    disabled OAuth integration + Drive transport
src/screens/            Material screens for the ledger, forms and backup setup
src/components/         Material controls, adaptive navigation, dialogs and icons
```

Navigation is a plain state machine, mirroring the prototype's
`screen`/`tab` state rather than adding a router. The Android hardware back
button unwinds it in `App.tsx`.

### Right-to-left

The root view sets `direction: 'rtl'` instead of calling
`I18nManager.forceRTL(true)`, which would require an app restart to take effect
and would flip the layout globally. Absolute `left`/`right` offsets stay
physical. At 600dp and wider the main navigation moves to a right-side rail;
compact windows use a bottom bar with wrapping labels.

### Numbers

The Arabic interface uses Western Arabic digits (`0–9`), comma grouping and
a decimal point, for example `1,234.50`. `fmt()` in `src/format.ts` keeps numeric
output consistent across devices. Amount entry accepts Arabic-Indic and Persian
digits too, then displays `0–9`. Backup timestamps explicitly use `latn` digits.

## Differences from the prototype

These are deliberate — each one is either a prototype bug or a placeholder that
a real app has to resolve.

| Prototype | Here | Why |
|---|---|---|
| `const sd = … debts.find(…)` read `debts` before its own `const` | Ordered correctly | The prototype threw a `ReferenceError` (temporal dead zone) whenever the settle screen opened for a specific debt — i.e. "تسجيل دفعة" and paying an instalment. |
| `person.amountLabel` was never defined | Derived from the balance | The person hero and settle screens rendered `undefined`. |
| Hardcoded date strings (`٢ سبتمبر`) and `dueIn` day offsets | Real ISO dates, labels computed from today | Offsets would go stale the moment the app was used on another day. |
| Numeric styles varied between labels and entry | Consistent `0–9` digits via `fmt()` | Follows the requested numeral style throughout the Arabic interface. |
| Reminders were a hardcoded list | Derived from open debts, toggles persisted, real local notifications | A toggle that schedules nothing isn't a reminder. |
| Profile name fixed to `عبدالله` | Stored in state, tap the row to rename | The design had no account model; the name has to come from somewhere. |
| Keypad keys rendered `1`–`9` | `0`–`9` throughout keypad and amount fields | Matches displayed balances, counts and dates. |
| Device bezel, status bar and gesture pill from `android-frame.jsx` | Dropped | Mockup chrome — the real app is the content. `SafeAreaView` handles the insets. |

The app always starts empty after verified empty storage reads. Demo fixtures live
under `scripts/fixtures` and are never imported by the runtime. Existing saved
ledgers are preserved. Amounts
are calculated in integer halalas, and monthly plans use calendar months with
end-of-month clamping. Person payments select a direction explicitly when both
sides owe money. See [`docs/REVIEW.md`](docs/REVIEW.md) for the review and checks.

See [`docs/MATERIAL3.md`](docs/MATERIAL3.md) for the design system, interaction
decisions, current screenshots and accessibility verification. Icon fonts are
local, licensed subsets; their source is recorded in [`assets/fonts/README.md`](assets/fonts/README.md).

See [`docs/FEATURES.md`](docs/FEATURES.md) for correction/date behavior and the
latest verification, [`docs/FLEXIBLE_REMINDERS.md`](docs/FLEXIBLE_REMINDERS.md) for
scheduling, and [`src/privacy/README.md`](src/privacy/README.md) for the lock.

Android release version **0.1.0-alpha.1**, version code **1**, uses production ID
`io.github.witcherxz.iou` and a dedicated signing key. See
[`docs/RELEASING.md`](docs/RELEASING.md) for the release workflow and
[`docs/releases/0.1.0-alpha.1.md`](docs/releases/0.1.0-alpha.1.md) for installation.
