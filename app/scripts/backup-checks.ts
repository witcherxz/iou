import { emptyState } from '../src/initialState';
import { seedState } from './fixtures/ledger';
import { backupFingerprint, InvalidBackupError, isBackupTimestamp, parseBackup, restoredState, serialize } from '../src/backup/types';
import { folderHasBackup, FolderBackupWriteError, PREVIOUS_BACKUP_FILENAME, readFolderBackup, writeToFolder, listFolderVersions, readFolderVersion, SNAPSHOT_LIMIT } from '../src/backup/folder';
import { csvCell, embeddedJson, parseReadableBackup, readableFiles, REPORT_FILENAME } from '../src/backup/readable';
import { BACKUP_FILENAME } from '../src/config/app';
import { editEntry, voidEntry } from '../src/ledger';
import { PersistedState } from '../src/types';
import { failNextWrite, failNextWriteMatching, files, folders, nonTruncatingFolders, openHandles } from './backup-filesystem-stub';

// Keep these checks dependency-free, like the existing ledger checks.
const assert = {
  ok(value: unknown, label = 'Expected truthy value') { if (!value) throw new Error(label); },
  equal(actual: unknown, expected: unknown) {
    if (actual !== expected) throw new Error(`Expected ${String(expected)}, got ${String(actual)}`);
  },
  notEqual(actual: unknown, expected: unknown) {
    if (actual === expected) throw new Error('Expected different values');
  },
  deepEqual(actual: unknown, expected: unknown) { this.equal(JSON.stringify(actual), JSON.stringify(expected)); },
  throws(fn: () => unknown, expected: new () => Error) {
    try { fn(); } catch (error) { if (error instanceof expected) return; throw error; }
    throw new Error('Expected operation to throw');
  },
  async rejects(promise: Promise<unknown>, expected?: new () => Error) {
    try { await promise; } catch (error) { if (!expected || error instanceof expected) return; throw error; }
    throw new Error('Expected operation to reject');
  },
};

let checks = 0;
const check = (label: string, test: () => void) => { test(); checks++; console.log(`PASS ${label}`); };
async function main() {
  const source = { ...seedState(), backupTarget: 'folder' as const, backupFolderUri: 'content://private/device/grant', lastBackup: 'اليوم ١:٢٣ م', refreshToken: 'must-not-export' };
  const text = serialize(source);
  const payload = parseBackup(text);
  check('round-trip retains ledger and portable settings', () => {
    assert.equal(payload.tx.length, source.tx.length);
    assert.equal(payload.profileName, source.profileName);
    assert.deepEqual(payload.reminderPrefs, source.reminderPrefs);
    assert.deepEqual(payload.reminderSettings, source.reminderSettings);
    assert.deepEqual(payload.changes, source.changes);
  });
  check('exports omit destination, local status and unexpected credentials', () => {
    for (const key of ['backupTarget', 'backupFolderUri', 'autoBackup', 'lastBackup', 'onboarded', 'refreshToken']) assert.ok(!(key in payload), key);
    assert.ok(!text.includes('private/device/grant'));
    assert.ok(!text.includes('must-not-export'));
  });
  check('legacy full-state exports remain readable with device fields ignored', () => {
    const restored = parseBackup(JSON.stringify({ ...source, version: 1, changes: undefined, reminderSettings: undefined, backedUpAt: payload.backedUpAt }));
    assert.equal(restored.tx.length, source.tx.length);
    assert.equal(restored.version, 3);
    assert.deepEqual(restored.changes, []);
    assert.equal(restored.reminderSettings.hour, 20);
    assert.ok(!('backupFolderUri' in restored));
  });
  check('restore preserves destination and local automatic preference', () => {
    const current = { ...emptyState(), backupTarget: 'folder' as const, backupFolderUri: 'content://new-device', autoBackup: false };
    const restored = restoredState(current, payload);
    assert.equal(restored.backupFolderUri, current.backupFolderUri);
    assert.equal(restored.backupTarget, 'folder');
    assert.equal(restored.autoBackup, false);
    assert.equal(restored.onboarded, true);
    assert.equal(restored.lastBackup, payload.backedUpAt);
    assert.equal(restoredState(current, payload, 'file').lastBackup, null);
  });
  check('backup status does not change the automatic data fingerprint', () => {
    assert.equal(backupFingerprint(source), backupFingerprint({ ...source, lastBackup: payload.backedUpAt } as typeof source));
    assert.notEqual(backupFingerprint(source), backupFingerprint({ ...source, profileName: 'Different ledger' }));
    assert.notEqual(backupFingerprint(source), backupFingerprint({ ...source, reminderSettings: { ...source.reminderSettings, hour: 9 } }));
  });
  check('timestamps reject display labels and invalid calendar dates', () => {
    assert.equal(isBackupTimestamp('اليوم ١:٢٣ م'), false);
    assert.equal(isBackupTimestamp('2026-02-30T12:00:00Z'), false);
    assert.equal(isBackupTimestamp(payload.backedUpAt), true);
  });
  const invalid = (label: string, mutate: (data: any) => void) => check(label, () => {
    const data = JSON.parse(text);
    mutate(data);
    assert.throws(() => parseBackup(JSON.stringify(data)), InvalidBackupError);
  });
  check('malformed JSON rejected', () => assert.throws(() => parseBackup('{'), InvalidBackupError));
  invalid('future schema rejected', d => { d.version = 4; });
  invalid('unversioned arrays rejected', d => { delete d.version; });
  invalid('invalid backup timestamp rejected', d => { d.backedUpAt = 'yesterday'; });
  invalid('null people rejected', d => { d.people[0] = null; });
  invalid('duplicate transaction IDs rejected', d => { d.tx[1].id = d.tx[0].id; });
  invalid('orphan debts rejected', d => { d.tx[0].personId = 'missing'; });
  invalid('negative amounts rejected', d => { d.tx[0].amount = -5; });
  invalid('fractional cents rejected', d => { d.tx[0].amount = 10.001; });
  invalid('invalid calendar dates rejected', d => { d.tx[0].createdAt = '2026-02-30'; });
  invalid('unknown directions rejected', d => { d.tx[0].dir = 'lent'; });
  invalid('orphan settlements rejected', d => { d.tx[2].debtId = 'missing'; });
  invalid('settlements for another person rejected', d => { d.tx[2].personId = 'p2'; });
  invalid('overpayments rejected', d => { d.tx[2].amount = 61; });
  invalid('inconsistent installments rejected', d => { d.tx[8].installments[0].amount = 999; });

  const readable = readableFiles(text);
  check('standalone report embeds exactly restorable portable ledger', () => assert.deepEqual(parseReadableBackup(readable[0].text), payload));
  check('report includes four spreadsheet exports and full JSON download', () => {
    assert.equal(readable.length, 5);
    for (const file of readable.slice(1)) {
      assert.ok(readable[0].text.includes(`download="${file.name}"`));
      assert.ok(file.text.startsWith('\ufeff'));
      assert.ok(file.text.includes('\r\n'));
    }
    assert.ok(readable[0].text.includes('download="iou-backup.json"'));
  });
  check('report does not request remote fonts, scripts, or services', () => {
    assert.ok(!/https?:\/\//.test(readable[0].text));
    assert.ok(!/<script(?! id="iou-backup-data" type="application\/json")/.test(readable[0].text));
    assert.ok(!/[٠-٩۰-۹]/u.test(readable[0].text));
  });
  check('spreadsheet text cannot start formulas even behind whitespace', () => {
    for (const cell of ['=1+1', '+cmd', '-cmd', '@SUM(A1)', ' \t=1+1', '\r=1+1', '\tplain']) assert.ok(csvCell(cell).startsWith('"\''));
    assert.equal(csvCell(-10), '"-10"');
    assert.equal(csvCell('"line,one\nline,two"'), '"""line,one\nline,two"""');
  });
  check('untrusted names and notes cannot escape report markup or data block', () => {
    const malicious = { ...source, profileName: '<img src=x onerror=alert(1)>', people: source.people.map((p, i) => i ? p : { ...p, name: '=HYPERLINK("https://example.test")' }), tx: source.tx.map((t, i) => i ? t : { ...t, note: '</script><script>alert(1)</script>&\u2028' }) };
    const report = readableFiles(serialize(malicious));
    assert.ok(!report[0].text.includes('<img src=x'));
    assert.ok(!report[0].text.includes('<script>alert(1)</script>'));
    assert.equal(parseReadableBackup(report[0].text).tx[0].note, malicious.tx[0].note);
    assert.ok(report[1].text.includes('"\'=HYPERLINK'));
    assert.ok(embeddedJson('</script>').includes('\\u003c'));
  });
  check('HTML imports reject missing or ambiguous embedded data without execution', () => {
    assert.throws(() => parseReadableBackup('<script>alert(1)</script>'), InvalidBackupError);
    assert.throws(() => parseReadableBackup(readable[0].text + readable[0].text), InvalidBackupError);
  });
  check('raw legacy JSON remains supported by the report importer', () => assert.deepEqual(parseReadableBackup(text), payload));
  check('UTF-8 BOM from text editors does not prevent JSON recovery', () => assert.deepEqual(parseReadableBackup('\ufeff' + text), payload));
  check('corrected and voided entries keep their audit history through report restore', () => {
    const edited = editEntry(source, 't1', { amount: 90, createdAt: '2026-01-02', note: 'corrected' }, 'change1', '2026-09-12T12:00:00Z');
    const voided = voidEntry(edited, 't3', 'change2', '2026-09-12T12:01:00Z');
    const rendered = readableFiles(serialize(voided));
    const restored = parseReadableBackup(rendered[0].text);
    assert.deepEqual(restored.changes, voided.changes);
    assert.equal(restored.tx.find(t => t.id === 't3')?.voidedAt, '2026-09-12T12:01:00Z');
    assert.ok(rendered[1].text.includes('"p1","سارة","150","0","150"'));
    assert.ok(rendered[2].text.includes('"ملغاة"'));
    assert.ok(rendered[4].text.includes('"2026-01-02"'));
    assert.ok(rendered[4].text.includes('"تعديل"'));
    assert.ok(rendered[4].text.includes('"إلغاء"'));
  });

  const forgiven: PersistedState = { ...emptyState(), people: [{ id: 'p1', name: 'شخص الاختبار', hue: 120 }], tx: [
    { id: 'd1', personId: 'p1', dir: 'me', amount: 1000, createdAt: '2026-01-01', installments: [
      { amount: 500, label: 'قسط 1', dueAt: '2026-02-01' }, { amount: 500, label: 'قسط 2', dueAt: '2026-03-01' },
    ] },
    { id: 'pmt', personId: 'p1', dir: 'settle', debtId: 'd1', amount: 700, createdAt: '2026-01-02' },
    { id: 'waiver', personId: 'p1', dir: 'forgive', debtId: 'd1', amount: 300, createdAt: '2026-01-03', note: 'تنازل عن المتبقي' },
  ] };
  const forgivenessFiles = readableFiles(serialize(forgiven));
  check('forgiveness survives standalone report restore as a separate transaction type', () => {
    const restored = parseReadableBackup(forgivenessFiles[0].text);
    assert.equal(restored.version, 3);
    assert.equal(restored.tx.find(t => t.id === 'waiver')?.dir, 'forgive');
    assert.equal(restored.tx.filter(t => t.dir === 'settle').reduce((sum, t) => sum + t.amount, 0), 700);
    assert.ok(forgivenessFiles[0].text.includes('مغلق بسداد وإعفاء'));
    assert.ok(forgivenessFiles[0].text.includes('المعفى منه (ر.س)'));
  });
  check('CSV separates 700 cash and 300 forgiven with zero outstanding', () => {
    assert.ok(forgivenessFiles[1].text.includes('"p1","شخص الاختبار","0","0","0"'));
    const debtRow = forgivenessFiles[2].text.split('\r\n').find(row => row.startsWith('"d1",'))!;
    const waiverRow = forgivenessFiles[2].text.split('\r\n').find(row => row.startsWith('"waiver",'))!;
    assert.ok(debtRow.endsWith('"0","700","300"'));
    assert.ok(waiverRow.includes('"إعفاء للشخص","300"'));
    assert.ok(waiverRow.endsWith('"0","0","300"'));
    assert.ok(!waiverRow.includes('سداد مستلم'));
  });
  check('installment CSV allocates cash and forgiveness separately in date order', () => {
    const rows = forgivenessFiles[3].text.split('\r\n');
    assert.ok(rows.some(row => row.includes('"قسط 1","500"') && row.endsWith('"500","0"')));
    assert.ok(rows.some(row => row.includes('"قسط 2","500"') && row.endsWith('"200","300"')));
  });
  check('cancelled forgiveness reopens report balances and retains its correction history', () => {
    const cancelled = voidEntry(forgiven, 'waiver', 'undo-waiver', '2026-09-12T12:00:00Z');
    const files = readableFiles(serialize(cancelled));
    const restored = parseReadableBackup(files[0].text);
    assert.ok(files[1].text.includes('"p1","شخص الاختبار","300","0","300"'));
    assert.equal(restored.changes[0].before.dir, 'forgive');
    assert.equal(restored.changes[0].kind, 'void');
    const waiverRow = files[2].text.split('\r\n').find(row => row.startsWith('"waiver",'))!;
    assert.ok(waiverRow.includes('"ملغاة"'));
    assert.ok(waiverRow.endsWith('"0","0","0"'));
  });
  check('forgiveness cannot be mislabeled as a legacy-format backup', () => {
    const data = JSON.parse(serialize(forgiven));
    assert.throws(() => parseBackup(JSON.stringify({ ...data, version: 2 })), InvalidBackupError);
  });

  const uri = 'memory://backup';
  folders.add(uri);
  await writeToFolder(uri, text);
  check('first folder write creates readable primary', () => {
    assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), text);
    assert.equal(folderHasBackup(uri), true);
    assert.deepEqual(parseReadableBackup(files.get(`${uri}/${REPORT_FILENAME}`)!), payload);
    assert.ok(files.has(`${uri}/iou-transactions.csv`));
  });
  const second = serialize({ ...source, profileName: 'second' });
  await writeToFolder(uri, second);
  check('next write retains previous valid backup', () => {
    assert.equal(files.get(`${uri}/${PREVIOUS_BACKUP_FILENAME}`), text);
    assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), second);
  });
  const third = serialize({ ...source, profileName: 'third' });
  failNextWrite(PREVIOUS_BACKUP_FILENAME);
  await assert.rejects(writeToFolder(uri, third));
  check('recovery write failure leaves primary untouched', () => assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), second));
  failNextWrite(BACKUP_FILENAME);
  await assert.rejects(writeToFolder(uri, third));
  const recovered = await readFolderBackup(uri);
  check('interrupted primary write recovers the newest already-verified snapshot', () => {
    assert.equal(recovered?.recovered, true);
    assert.equal(recovered?.text, third);
  });
  await writeToFolder(uri, third);
  check('repair never replaces recovery with corrupted primary data', () => {
    assert.equal(files.get(`${uri}/${PREVIOUS_BACKUP_FILENAME}`), second);
    assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), third);
  });
  await assert.rejects(writeToFolder(uri, '{invalid'), InvalidBackupError);
  check('invalid payload cannot modify good primary', () => assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), third));

  const initialVersions = await listFolderVersions(uri);
  check('folder history deduplicates primary and previous mirrors', () => assert.equal(initialVersions.length, 3));
  const oldId = initialVersions.find(version => version.peopleCount === source.people.length && files.get(`${uri}/${version.id}`) === text)!.id;
  const selected = await readFolderVersion(uri, oldId);
  check('older dated backup can be explicitly read for restore', () => assert.equal(selected, text));
  await assert.rejects(readFolderVersion(uri, '../other.json'), InvalidBackupError);
  check('snapshot selector rejects path traversal', () => assert.ok(true));
  failNextWriteMatching(/^iou-snapshot-/);
  await assert.rejects(writeToFolder(uri, serialize({ ...source, profileName: 'failed' })));
  check('partial immutable snapshot write leaves current and older backups valid', () => {
    assert.equal(files.get(`${uri}/${BACKUP_FILENAME}`), third);
    assert.equal(files.get(`${uri}/${oldId}`), text);
  });
  const afterFailure = await listFolderVersions(uri);
  check('corrupt partial files are excluded from selectable history', () => assert.equal(afterFailure.length, 3));
  files.set(`${uri}/other-user-file.txt`, 'keep me');
  for (let i = 0; i < 14; i++) await writeToFolder(uri, JSON.stringify({ ...parseBackup(text), profileName: `revision ${i}`, backedUpAt: new Date(Date.UTC(2026, 8, 12, 12, i)).toISOString() }));
  const versions = await listFolderVersions(uri);
  check('successful backups retain the last ten immutable versions', () => {
    assert.equal([...files.keys()].filter(key => key.startsWith(`${uri}/iou-snapshot-`)).length, SNAPSHOT_LIMIT);
    assert.equal(versions.length, SNAPSHOT_LIMIT);
    assert.equal(files.get(`${uri}/other-user-file.txt`), 'keep me');
    assert.ok(versions.every(version => parseBackup(files.get(`${uri}/${version.id}`)!).profileName.startsWith('revision ')));
  });
  files.set(`${uri}/${BACKUP_FILENAME}`, '{broken');
  files.set(`${uri}/${PREVIOUS_BACKUP_FILENAME}`, '{also broken');
  const fallback = await readFolderBackup(uri);
  check('corrupt latest and previous recover from dated history', () => {
    assert.equal(fallback?.recovered, true);
    assert.equal(parseBackup(fallback!.text).profileName, 'revision 13');
  });
  files.delete(`${uri}/${BACKUP_FILENAME}`);
  files.delete(`${uri}/${PREVIOUS_BACKUP_FILENAME}`);
  check('folder with snapshots alone is still recognized as containing backups', () => assert.equal(folderHasBackup(uri), true));
  failNextWrite(REPORT_FILENAME);
  let reportFailure: unknown;
  try { await writeToFolder(uri, text); } catch (error) { reportFailure = error; }
  const snapshotAfterReportFailure = await readFolderBackup(uri);
  check('companion report failure never damages canonical recovery data', () => assert.equal(snapshotAfterReportFailure?.text, text));
  check('companion failure reports verified recovery separately from full success', () => {
    assert.ok(reportFailure instanceof FolderBackupWriteError);
    const failure = reportFailure as FolderBackupWriteError;
    assert.equal(failure.snapshotSaved, true);
    assert.equal(failure.stage, 'report');
    assert.equal(failure.code, 'FOLDER_REPORT_IO');
    assert.ok(failure.message.includes('حُفظت نسخة للاستعادة'));
    assert.ok(!failure.message.includes(uri));
  });

  // SAF permits mode "w" providers that overwrite bytes without truncating. The
  // long-to-short transition also shrinks HTML/CSV reports containing Arabic/BOMs.
  const safUri = 'content://provider/tree/nontruncating';
  folders.add(safUri);
  nonTruncatingFolders.add(safUri);
  const longer = serialize({ ...source, profileName: 'دفتر الاختبار الطويل '.repeat(20) });
  const shorter = serialize({ ...source, profileName: 'قصير' });
  await writeToFolder(safUri, longer);
  await writeToFolder(safUri, shorter);
  check('SAF short rewrites explicitly truncate JSON and all companion files', () => {
    assert.equal(files.get(`${safUri}/${BACKUP_FILENAME}`), shorter);
    for (const report of readableFiles(shorter)) assert.equal(files.get(`${safUri}/${report.name}`), report.text);
    assert.equal(files.get(`${safUri}/${PREVIOUS_BACKUP_FILENAME}`), longer);
    assert.equal(openHandles, 0);
  });
  failNextWrite(REPORT_FILENAME);
  let handleFailure: unknown;
  try { await writeToFolder(safUri, text); } catch (error) { handleFailure = error; }
  check('SAF write failures close the handle and preserve verified snapshot diagnostics', () => {
    assert.equal(openHandles, 0);
    assert.ok(handleFailure instanceof FolderBackupWriteError);
    assert.equal((handleFailure as FolderBackupWriteError).snapshotSaved, true);
    assert.equal((handleFailure as FolderBackupWriteError).stage, 'report');
    assert.equal(files.get(`${safUri}/${BACKUP_FILENAME}`), text);
  });
  const corruptUri = 'memory://corrupt-only';
  folders.add(corruptUri);
  files.set(`${corruptUri}/iou-snapshot-2026-09-12T12-00-00-000Z-0.json`, '{bad');
  await assert.rejects(listFolderVersions(corruptUri), InvalidBackupError);
  await assert.rejects(readFolderBackup(corruptUri), InvalidBackupError);
  check('an all-corrupt folder is reported as invalid instead of empty', () => assert.ok(true));
  const zoneUri = 'memory://time-zones';
  folders.add(zoneUri);
  files.set(`${zoneUri}/iou-snapshot-2026-09-12T12-00-00-000Z-0.json`, JSON.stringify({ ...payload, backedUpAt: '2026-09-12T12:00:00+03:00', profileName: 'earlier' }));
  files.set(`${zoneUri}/iou-snapshot-2026-09-12T12-00-00-000Z-1.json`, JSON.stringify({ ...payload, backedUpAt: '2026-09-12T10:00:00Z', profileName: 'later' }));
  const byTime = await readFolderBackup(zoneUri);
  check('history recovery orders actual instants across timezone offsets', () => assert.equal(parseBackup(byTime!.text).profileName, 'later'));
  console.log(`\n${checks} BACKUP CHECKS PASSED`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
