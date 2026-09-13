# Backup and recovery

IoU supports local recovery points, a user-selected device folder, manual files, and manual Google Drive export/import. A file can be saved to a cloud service through the phone's share sheet; IoU cannot confirm that the receiving service kept it. Each native export has a distinct cached file and keeps its readable filename, so later exports cannot change an earlier handoff. The operating system manages eventual cache cleanup.

Screenshots: [backup tools](screenshots/features-backup-tools-dark.png), [protected import](screenshots/features-backup-password.png), [restore preview](screenshots/features-backup-restore.png), and [standalone report](screenshots/features-backup-report.png).

## Google Drive

Choose **Google Drive (يدوي)** in backup setup, then **مشاركة إلى Drive**. The phone opens its share sheet with the complete readable HTML report. On Android, Drive may be below the first visible app row: tap **المزيد** (More), scroll upward through the app list, and choose **Drive**. Review the account and folder, then tap **تحميل** (Upload) or **حفظ** (Save) in Drive. If Drive is absent from the full list, install its app and sign in, or save the file first and upload it from Drive. In the browser, **تنزيل نسخة لـ Drive** downloads the same report for uploading to Drive.

To recover it, choose **استعادة ملف من Drive**. Select the report through the system file picker where Drive is available, or download it from Drive first and select the local file. The usual validation and confirmation preview run before replacing the ledger. Selecting a file can lock IoU while the Android picker is open. The validated selection stays only in memory and waits for unlock before asking for its password or showing the restore preview. No data is applied without that fresh confirmation. A later privacy lock cancels the presented restore, including a password check in progress; changes to the ledger during the wait or preview also block replacement. Import preserves the chosen manual Drive destination.

Manual Drive export does not sign in from IoU, grant IoU access to other Drive files, run automatically, or claim a synchronized timestamp. Returning from or dismissing the share sheet is not proof that a cloud upload finished. The screen asks the user to confirm the file appears in Drive. Protected reports can also be sent through the share sheet from the backup tools screen.

Direct automatic Drive synchronization remains disabled. It needs a configured Google Cloud project, platform OAuth clients registered to the production package and signing certificate, and supported native authorization. The existing generic custom-scheme flow must be replaced and tested before enabling it. [Expo's Google authentication guide](https://docs.expo.dev/guides/google-authentication/) recommends a native integration; [Google's installed-app OAuth documentation](https://developers.google.com/identity/protocols/oauth2/native-app) excludes custom URI schemes on Android. The manual flow uses [Expo SDK 57 file sharing](https://docs.expo.dev/versions/v57.0.0/sdk/sharing/).

## Read the ledger without IoU

The default manual export, `iou-ledger.html`, opens offline in a browser. It contains Arabic tables with 0–9 digits, balances, debts, payments, forgiveness entries, installment balances, and correction history. It provides downloads for four UTF-8 CSV files (with a BOM for spreadsheet applications) and the canonical JSON. It uses no remote fonts, scripts, or services.

- `iou-balances.csv`: each person's receivable, payable, and net remaining balance in SAR.
- `iou-transactions.csv`: every debt/payment/forgiveness, actual date, recording time, due date, note, linked debt, and cancellation status. Separate columns show cash paid and forgiven amounts. Debt rows summarize their linked entries; do not add those summaries again to individual payment/forgiveness rows.
- `iou-installments.csv`: schedule, remaining amount, cash paid and forgiven amount per installment, allocating reductions in actual-date order.
- `iou-history.csv`: before/after corrections, with complete before/after records for fields not represented by dedicated columns.

Voided entries remain visible but do not count toward balances. Date-only values use the Gregorian calendar; timestamps ending in `Z` use UTC. The report explains that positive net balances are owed to the book owner. CSV text starting with spreadsheet formula characters is prefixed with an apostrophe; numeric values remain numeric.

CSV files are for reading and analysis, not direct import. Restore accepts the full HTML report or canonical JSON. Import extracts the data block without executing or rendering imported HTML, validates the entire ledger, and shows a preview before replacement. Version 1 and 2 JSON backups migrate to version 3; forgiveness, corrections, recording dates, and reminder settings round-trip in version 3. Older app versions cannot restore format 3; the standalone report remains readable. Destination permissions, device privacy-lock secrets, OAuth tokens, and local backup status are excluded from portable backups.

## Folder recovery

Each successful folder backup creates an immutable, dated `iou-snapshot-*.json` file and verifies it by reading it back. Before replacing a legacy primary backup, IoU archives the existing valid primary. `iou-backup.json` and `iou-backup.previous.json` remain compatibility mirrors. A partial new write cannot truncate the existing dated files. Corrupt candidates do not replace known-good recovery copies.

Only after the latest JSON and readable companions have been verified does IoU prune dated snapshots to the ten newest archive writes. Cleanup is best effort; a provider that refuses deletion can retain more versions. Unrelated user files and unreadable snapshot-like files are never pruned. The latest HTML and four CSV companions reflect the latest successful write; if companion generation fails, the operation reports failure but the canonical JSON history remains recoverable.

A partial-write warning states when a verified recovery snapshot exists but updating the current files or readable report failed. The app log records only a fixed diagnostic code for the failed stage, without a folder URI or ledger contents. Partial writes do not advance the successful-backup timestamp. A failed write keeps automatic backup paused across app restart, cancelled restore and read-only history. Retry the folder backup explicitly to verify that every file was saved; if a backup already exists, confirmation still appears. A successful explicit folder/provider save or selecting a new destination clears the pause. Opening a share sheet cannot clear it.

The history screen lists valid versions, hides duplicate mirrors, and allows restoring an older selection after re-reading and validating it. Default restore selects the newest valid backup by its actual timestamp across the primary, previous copy and dated history. A valid but older primary cannot hide a newer recovery snapshot; the primary wins only when timestamps tie. Files that exist but are all invalid are reported as invalid rather than an empty folder.

Automatic backup never runs on startup or merely on choosing a destination. The first save or restore is explicit. Local recovery suspends unattended external writes until reviewed. Android folder metadata pairs provider display names with exact document URIs, and each selected version is revalidated against a fresh listing before reading. A native owning output stream truncates and closes each Android document before read-back verification, using the existing folder grant. Other filesystem operations use Expo FileSystem. Provider permissions and interrupted writes require real-device verification. The local folder alone does not protect against losing the device.

## Optional protected export

“Create protected backup” exports `iou-protected.html`. The user supplies and confirms a password of at least ten characters. The password is never retained by IoU. The import password dialog can be cancelled while verification is running; a cancelled or locked session cannot apply a later result. The entire report, including its embedded JSON and CSV links, is encrypted. The password is separate from the optional app PIN. Regular folder/report/CSV exports remain readable and unencrypted.

Some earlier Android exports serialized encrypted bytes as a numeric-key object because the SDK native encoding option differed from its TypeScript API. IoU can recover this exact contiguous-byte form after the usual password authentication; sparse, nonbyte and unrelated object shapes are rejected. Import an affected file into IoU and create a fresh protected export to use its standalone browser form. New exports validate the native combined base64 data, nonce, tag and size before creating the file.

The protected file has a small, self-contained unlock form using browser WebCrypto. It works offline in modern browsers that expose WebCrypto for local files, or it can be imported into IoU. A forgotten password cannot be recovered. Opening and downloading the decrypted tables creates ordinary, unencrypted files.

The file includes exactly one JSON script element with ID `iou-encrypted-data` and MIME type `application/json`. Its interoperable envelope is:

```json
{
  "format": "iou-encrypted-backup",
  "version": 1,
  "cipher": "AES-256-GCM",
  "kdf": "PBKDF2-SHA256",
  "iterations": 600000,
  "salt": "16 random bytes as lowercase hexadecimal",
  "nonce": "12 random bytes as lowercase hexadecimal",
  "ciphertext": "base64(ciphertext || 16-byte authentication tag)"
}
```

Derive a 32-byte key from the exact UTF-8 password (without normalization) and salt using PBKDF2-HMAC-SHA256. AES-GCM additional authenticated data is the UTF-8 string `IoU portable backup v1`. Decryption produces the full UTF-8 HTML report. Canonical ledger JSON is in its `iou-backup-data` JSON script element. Formats and work factors outside the supported envelope are rejected before expensive derivation. A fresh salt and nonce are generated for each export using Expo Crypto's secure random source. Expo Crypto performs AES-GCM. Production Android and iOS modules derive backup keys on a native worker using the exact UTF-8 bytes of the password. Web uses WebCrypto, and environments without the native backup method retain the `@noble/hashes` fallback. Native derivation failures do not silently restart the slow fallback. The separate PIN method and existing backup envelope are unchanged.

The JSON ledger limit is 10 MiB; reports/protected artifacts allow up to 80 MiB because tabular and spreadsheet representations repeat data. The automated checks verify independent Node crypto interoperability, invalid-password/tamper rejection, HTML/CSV escaping, v1 migration, and simulated provider failures. These are not a substitute for native provider/device tests.
