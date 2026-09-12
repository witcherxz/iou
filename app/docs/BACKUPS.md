# Backup and recovery

IoU supports local recovery points, a user-selected device folder, and manual files. Direct Google Drive sign-in remains unavailable in this build. A file can be saved to a cloud service through the phone's share sheet; IoU cannot confirm that the receiving service kept it.

Screenshots: [backup tools](screenshots/features-backup-tools-dark.png), [protected import](screenshots/features-backup-password.png), [restore preview](screenshots/features-backup-restore.png), and [standalone report](screenshots/features-backup-report.png).

## Read the ledger without IoU

The default manual export, `iou-ledger.html`, opens offline in a browser. It contains Arabic tables with 0–9 digits, balances, debt and payment entries, installment balances, and correction history. It provides downloads for four UTF-8 CSV files (with a BOM for spreadsheet applications) and the canonical JSON. It uses no remote fonts, scripts, or services.

- `iou-balances.csv`: each person's receivable, payable, and net remaining balance in SAR.
- `iou-transactions.csv`: every debt/payment, actual date, recording time, due date, note, linked debt, and cancellation status.
- `iou-installments.csv`: schedule and unpaid amount per installment, allocating payments in order.
- `iou-history.csv`: before/after corrections, with complete before/after records for fields not represented by dedicated columns.

Voided entries remain visible but do not count toward balances. Date-only values use the Gregorian calendar; timestamps ending in `Z` use UTC. The report explains that positive net balances are owed to the book owner. CSV text starting with spreadsheet formula characters is prefixed with an apostrophe; numeric values remain numeric.

CSV files are for reading and analysis, not direct import. Restore accepts the full HTML report or canonical JSON. Import extracts the data block without executing or rendering imported HTML, validates the entire ledger, and shows a preview before replacement. Version 1 JSON backups migrate to version 2; corrections, recording dates, and reminder settings round-trip in version 2. Destination permissions, device privacy-lock secrets, OAuth tokens, and local backup status are excluded from portable backups.

## Folder recovery

Each successful folder backup creates an immutable, dated `iou-snapshot-*.json` file and verifies it by reading it back. Before replacing a legacy primary backup, IoU archives the existing valid primary. `iou-backup.json` and `iou-backup.previous.json` remain compatibility mirrors. A partial new write cannot truncate the existing dated files. Corrupt candidates do not replace known-good recovery copies.

Only after the latest JSON and readable companions have been verified does IoU prune dated snapshots to the ten newest archive writes. Cleanup is best effort; a provider that refuses deletion can retain more versions. Unrelated user files are never pruned. The latest HTML and four CSV companions reflect the latest successful write; if companion generation fails, the operation reports failure but the canonical JSON history remains recoverable.

The history screen lists valid versions, hides duplicate mirrors, and allows restoring an older selection after re-reading and validating it. If the primary is unreadable, automatic selection finds the newest valid backup by its actual timestamp, including dated history. Files that exist but are all invalid are reported as invalid rather than an empty folder.

Automatic backup never runs on startup or merely on choosing a destination. The first save or restore is explicit. Local recovery suspends unattended external writes until reviewed. Folder storage uses the Expo FileSystem provider; Android and iOS provider permissions and interrupted writes still require real-device verification. The local folder alone does not protect against losing the device.

## Optional protected export

“Create protected backup” exports `iou-protected.html`. The user supplies and confirms a password of at least ten characters. The password is never retained by IoU. The entire report, including its embedded JSON and CSV links, is encrypted. The password is separate from the optional app PIN. Regular folder/report/CSV exports remain readable and unencrypted.

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

Derive a 32-byte key from the exact UTF-8 password (without normalization) and salt using PBKDF2-HMAC-SHA256. AES-GCM additional authenticated data is the UTF-8 string `IoU portable backup v1`. Decryption produces the full UTF-8 HTML report. Canonical ledger JSON is in its `iou-backup-data` JSON script element. Formats and work factors outside the supported envelope are rejected before expensive derivation. A fresh salt and nonce are generated for each export using Expo Crypto's secure random source. Expo Crypto performs AES-GCM; native password derivation uses `@noble/hashes`, while web derivation uses WebCrypto.

The JSON ledger limit is 10 MiB; reports/protected artifacts allow up to 80 MiB because tabular and spreadsheet representations repeat data. The automated checks verify independent Node crypto interoperability, invalid-password/tamper rejection, HTML/CSV escaping, v1 migration, and simulated provider failures. These are not a substitute for native provider/device tests.
