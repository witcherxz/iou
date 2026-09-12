import { exportArtifact, exportToFile, SharingUnavailableError } from '../src/backup/fileShare';
import { shares, shareFiles, shareState } from './backup-share-stub';

let passed = 0;
function check(label: string, valid: unknown) {
  if (!valid) throw new Error(label);
  passed++; console.log(`PASS ${label}`);
}
async function main() {
  await exportToFile('first immutable export');
  const first = shares[0];
  await exportToFile('second export with different ledger');
  check('delayed recipient reads the exact first export after a later export', shareFiles.get(first.uri) === 'first immutable export');
  check('repeated exports use separate cache URIs', first.uri !== shares[1].uri);
  check('unique cache directories preserve the familiar exported filename', shares.every(share => share.uri.endsWith('/iou-backup.json')));
  await exportArtifact({ name: 'iou-ledger.html', mime: 'text/html', text: '<html lang="ar">سجل جديد</html>' });
  check('HTML share keeps Arabic bytes and correct native media types', shareFiles.get(shares[2].uri) === '<html lang="ar">سجل جديد</html>' && shares[2].options.mimeType === 'text/html' && shares[2].options.UTI === 'public.html');
  await exportArtifact({ name: 'iou-balances.csv', mime: 'text/csv', text: '\ufeff"الشخص","50.17"\r\n' });
  check('CSV share preserves the BOM and spreadsheet media type', shareFiles.get(shares[3].uri)?.startsWith('\ufeff') && shares[3].options.UTI === 'public.comma-separated-values-text');
  shareState.available = false;
  let unavailable: unknown;
  try { await exportToFile('unavailable'); } catch (error) { unavailable = error; }
  check('unavailable native sharing never creates a claimed handoff', unavailable instanceof SharingUnavailableError && shares.length === 4);
  shareState.available = true; shareState.failWrite = true;
  let failed = false;
  try { await exportToFile('not written'); } catch { failed = true; }
  check('failed cache writes never share an empty file or alter previous exports', failed && shares.length === 4 && shareFiles.get(first.uri) === 'first immutable export');
  shareState.failWrite = false; shareState.failShare = true; failed = false;
  try { await exportToFile('failed native handoff'); } catch { failed = true; }
  check('native share rejection propagates without claiming success', failed && shares.length === 4);
  console.log(`\n${passed} BACKUP SHARE CHECKS PASSED`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
