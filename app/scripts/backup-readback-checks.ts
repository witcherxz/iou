import { File as StubFile, files, folders, metadata, nativeWriteCalls, failNextOpen, failNextWriteMatching, readCalls, openHandles } from './backup-filesystem-stub';
import { FolderBackupWriteError, readFolderBackup, writeToFolder } from '../src/backup/folder';
import { BACKUP_FILENAME } from '../src/config/app';
import { REPORT_FILENAME, readableFiles } from '../src/backup/readable';

type Outcome = 'read' | 'empty' | 'mismatch';
interface Fault { folder: string; target: RegExp; sequence: Outcome[]; persistent?: Outcome; reads: number }

/** Run real folder logic with delayed provider visibility and a scoped virtual clock. */
export async function runReadbackChecks(text: string): Promise<number> {
  let checks = 0;
  const ok = (value: unknown, message: string) => { if (!value) throw new Error(message); };
  const check = (name: string, test: () => void) => { test(); checks++; console.log(`PASS ${name}`); };
  const originalRead = StubFile.prototype.text;
  const originalSetTimeout = globalThis.setTimeout;
  const originalNow = Date.now;
  let now = originalNow();
  let fault: Fault | null = null;
  const waits: number[] = [];
  let activeReads = 0;
  let maxActiveReads = 0;
  Date.now = () => now;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    const delay = Number(args[1] ?? 0);
    // Existing directory-listing deadline retains its separate contract.
    if (delay === 30_000) return originalSetTimeout(...args);
    ok(delay > 0 && delay <= 2000, 'Unexpected verification retry delay');
    waits.push(delay);
    return originalSetTimeout(() => { now += delay; args[0](); }, 0);
  }) as typeof setTimeout;
  StubFile.prototype.text = async function () {
    activeReads++;
    maxActiveReads = Math.max(maxActiveReads, activeReads);
    try {
      const exact = await originalRead.call(this);
      const entry = metadata.get(this.uri);
      if (fault && entry?.folder === fault.folder && fault.target.test(entry.name)) {
        fault.reads++;
        const outcome = fault.sequence.shift() ?? fault.persistent;
        if (outcome === 'read') throw new Error('private provider read details');
        if (outcome === 'empty') return '';
        if (outcome === 'mismatch') return exact + 'old trailing bytes';
      }
      return exact;
    } finally { activeReads--; }
  };
  const entries = (uri: string) => [...metadata.values()].filter(entry => entry.folder === uri);
  const oncePerDocument = (start: number) => {
    const writes = nativeWriteCalls.slice(start);
    ok(new Set(writes).size === writes.length, 'A verification retry rewrote a document');
  };
  try {
    for (const [label, target, sequence] of [
      ['snapshot temporarily unreadable', /^iou-snapshot-/, ['read', 'read']],
      ['canonical temporarily empty and stale', /^iou-backup\.json$/, ['empty', 'mismatch']],
      ['report temporarily unreadable', /^iou-ledger\.html$/, ['read']],
    ] as Array<[string, RegExp, Outcome[]]>) {
      const uri = `content://provider/tree/readback-transient-${checks}`;
      folders.add(uri);
      const writeStart = nativeWriteCalls.length;
      const waitStart = waits.length;
      const expectedRetries = sequence.length;
      fault = { folder: uri, target, sequence: [...sequence], reads: 0 };
      let error: unknown;
      try { await writeToFolder(uri, text); } catch (caught) { error = caught; }
      check(`SAF ${label} becomes exact without rewriting or creating duplicate files`, () => {
        ok(error === undefined, `Transient readback failed: ${error instanceof FolderBackupWriteError ? error.code : 'unexpected error'}`);
        ok(waits.length - waitStart === expectedRetries, 'Did not wait between transient failures');
        oncePerDocument(writeStart);
        ok(entries(uri).length === 7, 'Expected one snapshot, canonical and five companions');
        for (const companion of [{ name: BACKUP_FILENAME, text }, ...readableFiles(text)]) {
          const entry = entries(uri).find(candidate => candidate.name === companion.name);
          ok(entry && files.get(entry.uri) === companion.text, 'Companion was not exact');
        }
      });
    }
    for (const [label, target, persistent, expectedCode, snapshotSaved, documents] of [
      ['unreadable snapshot', /^iou-snapshot-/, 'read', 'FOLDER_SNAPSHOT_READ', false, 1],
      ['unequal snapshot', /^iou-snapshot-/, 'mismatch', 'FOLDER_SNAPSHOT_VERIFY', false, 1],
      ['unreadable canonical', /^iou-backup\.json$/, 'read', 'FOLDER_LATEST_READ', true, 2],
      ['unequal report', /^iou-ledger\.html$/, 'mismatch', 'FOLDER_REPORT_VERIFY', true, 3],
    ] as Array<[string, RegExp, Outcome, string, boolean, number]>) {
      const uri = `content://provider/tree/readback-persistent-${checks}`;
      folders.add(uri);
      const writeStart = nativeWriteCalls.length;
      const waitStart = waits.length;
      fault = { folder: uri, target, sequence: [], persistent, reads: 0 };
      let error: unknown;
      try { await writeToFolder(uri, text); } catch (caught) { error = caught; }
      check(`SAF persistent ${label} fails within the retry budget with accurate recovery status`, () => {
        ok(error instanceof FolderBackupWriteError, 'Persistent verification incorrectly succeeded');
        const failure = error as FolderBackupWriteError;
        ok(failure.code === expectedCode && failure.snapshotSaved === snapshotSaved, 'Wrong final verification status');
        ok(!failure.message.includes('private'), 'Raw provider error escaped');
        const elapsed = waits.slice(waitStart).reduce((sum, delay) => sum + delay, 0);
        ok(elapsed >= 20_000 && elapsed <= 30_000, 'Retry window is not bounded near25 seconds');
        ok(fault!.reads > 1 && fault!.reads <= 20, 'Unexpected read retry count');
        oncePerDocument(writeStart);
        ok(entries(uri).length === documents, 'Later files were created after failed verification');
      });
      fault = null;
      if (snapshotSaved) ok((await readFolderBackup(uri))?.text === text, 'Verified recovery snapshot was lost');
    }
    for (const kind of ['open', 'write'] as const) {
      const uri = `content://provider/tree/readback-${kind}-failure`;
      folders.add(uri);
      const waitStart = waits.length;
      const readStart = readCalls.length;
      const writeStart = nativeWriteCalls.length;
      if (kind === 'open') failNextOpen(); else failNextWriteMatching(/^iou-snapshot-/);
      let error: unknown;
      try { await writeToFolder(uri, text); } catch (caught) { error = caught; }
      check(`SAF ${kind} failure never starts read retries or another write`, () => {
        ok(error instanceof FolderBackupWriteError && error.code === 'FOLDER_SNAPSHOT_WRITE', 'Write failure was hidden');
        ok(waits.length === waitStart && readCalls.length === readStart, 'Read attempted after failed write');
        ok(nativeWriteCalls.length === writeStart + 1 && entries(uri).length === 1, 'Write or creation retried');
        ok(openHandles === 0, 'Provider stream leaked');
      });
    }
    check('SAF verification reads never overlap', () => ok(maxActiveReads === 1 && activeReads === 0, 'Provider reads overlapped'));
  } finally {
    fault = null;
    StubFile.prototype.text = originalRead;
    globalThis.setTimeout = originalSetTimeout;
    Date.now = originalNow;
  }
  return checks;
}
