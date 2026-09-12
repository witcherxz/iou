# دفتر الديون — IoU / UoM

React Native (Expo SDK 57) implementation of the Claude Design prototype in
`../design/project/IoU App.dc.html`.

A private, Arabic-first, right-to-left debt ledger in Saudi Riyal: who owes you,
who you owe, instalment plans, settlements, local reminders, and Google Drive
backup.

## Running

```bash
npm install
npm start          # then press "a" for Android, or scan the QR code
npm run android    # build + launch on a connected device/emulator
```

Quality gates:

```bash
npm run typecheck  # tsc --noEmit
npm run check      # pure-logic assertions (formatting, balances, instalments)
```

`npm run web` renders the same screens in a browser, which is handy for a
quick visual check of layout and theming.

Google sign-in and local notifications need a **development build**, not Expo
Go — `npx expo run:android` or `eas build --profile development`.

## Backup

The backup destination is chosen by the user in Settings → النسخ الاحتياطي, and
stored in `backupTarget` / `backupFolderUri`. All destinations serialise the same
payload, so a book backed up to a folder can be restored from a file and vice
versa.

| Target | Module | Setup | Automatic |
|---|---|---|---|
| `folder` | `src/backup/folder.ts` | user picks a folder once | yes |
| `file` | `src/backup/fileShare.ts` | none | no (manual export/import) |
| `drive` | `src/backup/google.ts` | OAuth client IDs in `app.json` | yes |
| `none` | — | — | — |

`src/useBackup.ts` dispatches across them and owns the debounced auto-backup.

### Folder (recommended)

`Directory.pickDirectoryAsync()` opens the system folder picker. On **Android**
the picker takes a *persistable* URI permission, so the grant survives app
restarts — including for a folder that Google Drive, Nextcloud or Syncthing
already syncs, which gives you off-device backup with no OAuth at all. On
**iOS** the grant is session-scoped, so the user is asked to pick again after a
cold start.

### File

Export writes to the cache and hands the file to `expo-sharing`; import reads it
back through `File.pickFileAsync`. Zero configuration, works in Expo Go.

### Google Drive (optional)

Backups go to Drive's `appDataFolder`, a hidden per-app folder. The app can only
see files it created there; it never gets access to the user's other files.

1. Create a project at <https://console.cloud.google.com/> and enable the
   **Google Drive API**.
2. Configure the OAuth consent screen and add the scope
   `https://www.googleapis.com/auth/drive.appdata`.
3. Create OAuth client IDs:
   - **Android** — package name `com.example.iou` (match `expo.android.package`
     in `app.json`) plus the SHA-1 of your signing key.
   - **iOS** — bundle id `com.example.iou`.
   - **Web** — only needed if you run the app in a browser.
4. Paste the IDs into `app.json` under `expo.extra.google`, replacing the
   `YOUR_*_CLIENT_ID` placeholders.

Until real IDs are present the option is greyed out in the backup setup screen
and the other destinations work unchanged.

The refresh token is stored with `expo-secure-store` (Keystore / Keychain), not
in AsyncStorage.

## Architecture

```
App.tsx                 screen/tab state machine, Android back handling, theming
src/store/store.tsx     persisted ledger + mutations (AsyncStorage)
src/selectors.ts        derived views: balances, remaining amounts, badges, schedules
src/format.ts           Arabic-Indic numerals and dates, due-date labels
src/theme.ts            light/dark palettes, oklch → sRGB for avatar tints
src/reminders.ts        local notification scheduling
src/useBackup.ts        backup orchestration across destinations
src/backup/folder.ts    user-picked folder (Storage Access Framework)
src/backup/fileShare.ts share-sheet export / file-picker import
src/backup/google.ts    OAuth (PKCE) + Drive appDataFolder upload/download
src/screens/            one file per screen from the prototype
src/components/         shared primitives (toggle, segment, chips, keypad, nav)
```

Navigation is a plain state machine, mirroring the prototype's
`screen`/`tab` state rather than adding a router. The Android hardware back
button unwinds it in `App.tsx`.

### Right-to-left

The root view sets `direction: 'rtl'` instead of calling
`I18nManager.forceRTL(true)`, which would require an app restart to take effect
and would flip the layout globally. Absolute `left`/`right` offsets stay
physical, exactly as in the prototype's `dir="rtl"` markup.

### Numbers

`Intl.NumberFormat('ar-SA')` depends on the ICU data in the OS build, so
`fmt()` in `src/format.ts` produces Arabic-Indic digits, `٬` group separators
and `٫` decimal separators directly. Output is identical on every device.

## Differences from the prototype

These are deliberate — each one is either a prototype bug or a placeholder that
a real app has to resolve.

| Prototype | Here | Why |
|---|---|---|
| `const sd = … debts.find(…)` read `debts` before its own `const` | Ordered correctly | The prototype threw a `ReferenceError` (temporal dead zone) whenever the settle screen opened for a specific debt — i.e. "تسجيل دفعة" and paying an instalment. |
| `person.amountLabel` was never defined | Derived from the balance | The person hero and settle screens rendered `undefined`. |
| Hardcoded date strings (`٢ سبتمبر`) and `dueIn` day offsets | Real ISO dates, labels computed from today | Offsets would go stale the moment the app was used on another day. |
| `sub: tx.length + ' عمليات'` used Western digits | Arabic-Indic, via `fmt()` | Every other number in the design is Arabic-Indic. |
| Reminders were a hardcoded list | Derived from open debts, toggles persisted, real local notifications | A toggle that schedules nothing isn't a reminder. |
| Profile name fixed to `عبدالله` | Stored in state, tap the row to rename | The design had no account model; the name has to come from somewhere. |
| Keypad keys rendered `1`–`9` | Same (unchanged) | Kept faithful. Flip `KEYPAD_ARABIC_DIGITS` in `src/config/app.ts` to render `١`–`٩`. |
| Device bezel, status bar and gesture pill from `android-frame.jsx` | Dropped | Mockup chrome — the real app is the content. `SafeAreaView` handles the insets. |

The demo ledger from the prototype is seeded on first launch so the app has
something to show. Set `SEED_ON_FIRST_LAUNCH = false` in `src/config/app.ts` to
start empty.
