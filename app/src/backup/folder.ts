import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import { BACKUP_FILENAME } from '../config/app';
import { listAndroidDocuments, writeAndroidDocument } from './androidDocuments';
import { InvalidBackupError, MAX_BACKUP_BYTES, parseBackup } from './types';
import { readableFiles } from './readable';

/** Android persists the folder grant; iOS may require picking it again next session. */
export const folderSupported = Platform.OS === 'android' || Platform.OS === 'ios';
export const PREVIOUS_BACKUP_FILENAME = 'iou-backup.previous.json';
export const SNAPSHOT_LIMIT = 10;
const SAF_VERIFY_WINDOW_MS = 25_000;
const snapshotPattern = /^iou-snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+\.json$/;
export interface FolderBackupVersion {
  /** Ephemeral identity from a directory listing, never displayed to the user. */
  id: string;
  backedUpAt: string;
  peopleCount: number;
  transactionCount: number;
}

interface FolderFile {
  file: File;
  /** Provider display name, independent of opaque document IDs. */
  name: string;
}
interface ValidCopy extends FolderFile { text: string }

export class FolderUnavailableError extends Error {
  constructor() {
    super('Backup folder is no longer accessible');
    this.name = 'FolderUnavailableError';
  }
}

export type FolderBackupWriteStage = 'read' | 'history' | 'previous' | 'snapshot' | 'latest' | 'report' | 'cleanup';
export type FolderBackupOperation = 'LIST' | 'CREATE' | 'WRITE' | 'READ' | 'VERIFY' | 'IO';

/** Safe diagnostics: no provider URI, ledger contents, or raw native message. */
export class FolderBackupWriteError extends Error {
  readonly code: string;
  readonly operation: FolderBackupOperation;
  constructor(
    readonly stage: FolderBackupWriteStage,
    readonly snapshotSaved: boolean,
    operation: FolderBackupOperation | boolean = 'IO',
  ) {
    const detail = typeof operation === 'boolean' ? operation ? 'VERIFY' : 'IO' : operation;
    const message = snapshotSaved
      ? stage === 'report'
        ? 'حُفظت نسخة للاستعادة، لكن تعذّر تحديث التقرير أو الجداول. أعد المحاولة.'
        : 'حُفظت نسخة للاستعادة، لكن لم يكتمل تحديث ملفات النسخ. أعد المحاولة.'
      : detail === 'VERIFY'
        ? 'تعذّر التحقق من الملف المحفوظ. أعد المحاولة أو صدّر ملفاً احتياطياً.'
        : 'تعذّر إكمال الحفظ في المجلد. أعد المحاولة أو صدّر ملفاً احتياطياً.';
    super(message);
    this.name = 'FolderBackupWriteError';
    this.operation = detail;
    this.code = `FOLDER_${stage.toUpperCase()}_${detail}`;
  }
}

class FolderOperationError extends Error {
  constructor(readonly operation: FolderBackupOperation) {
    super(`Folder operation failed: ${operation}`);
  }
}

export async function pickFolder(): Promise<string | null> {
  if (!folderSupported) throw new FolderUnavailableError();
  try {
    return (await Directory.pickDirectoryAsync()).uri;
  } catch (error) {
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw error;
  }
}

function openFolder(uri: string): Directory {
  if (!folderSupported) throw new FolderUnavailableError();
  const dir = new Directory(uri);
  if (!dir.exists) throw new FolderUnavailableError();
  return dir;
}

async function listFiles(dir: Directory): Promise<FolderFile[]> {
  try {
    if (Platform.OS === 'android' && dir.uri.startsWith('content://')) {
      // Names and URIs come from one paired metadata query. Never infer a name
      // from an opaque document ID or zip two independently ordered listings.
      return (await listAndroidDocuments(dir.uri))
        .filter(entry => !entry.isDirectory)
        .map(entry => ({ file: new File(entry.uri), name: entry.name }));
    }
    return dir.list().filter((entry): entry is File => entry instanceof File)
      .map(file => ({ file, name: file.name }));
  } catch {
    throw new FolderOperationError('LIST');
  }
}

/** Stable selection for compatibility mirrors when a provider permits duplicate names. */
async function fileIn(dir: Directory, name: string): Promise<FolderFile | null> {
  const matches = (await listFiles(dir)).filter(entry => entry.name === name);
  matches.sort((a, b) => a.file.uri.localeCompare(b.file.uri, 'en'));
  return matches[0] ?? null;
}

async function readText(file: File): Promise<string> {
  try { return await file.text(); } catch { throw new FolderOperationError('READ'); }
}

async function readValid(file: File): Promise<string> {
  let size: number;
  try { size = file.size; } catch { throw new FolderOperationError('READ'); }
  if (size > MAX_BACKUP_BYTES) throw new InvalidBackupError();
  const text = await readText(file);
  parseBackup(text);
  return text;
}

function createFile(dir: Directory, name: string, mime: string): File {
  try { return dir.createFile(name, mime); } catch { throw new FolderOperationError('CREATE'); }
}

async function writeFileVerified(file: File, text: string): Promise<void> {
  const androidDocument = Platform.OS === 'android' && file.uri.startsWith('content://');
  try {
    if (androidDocument) {
      // The native writer owns and closes the provider stream before resolving.
      // This commits fresh SAF documents and truncates shorter rewrites without
      // Expo's existence check or non-owning File.open descriptor lifecycle.
      await writeAndroidDocument(file.uri, text);
    } else {
      file.write(text);
    }
  } catch {
    throw new FolderOperationError('WRITE');
  }
  if (!androidDocument) {
    if (await readText(file) !== text) throw new FolderOperationError('VERIFY');
    return;
  }
  // Cloud providers can close a write before the same document becomes readable.
  // Retry only reads of this exact URI, never creation or writing. This window
  // bounds retries; an already pending native read is awaited, not abandoned
  // for overlapping I/O. Expo File.text does not expose read cancellation.
  const deadline = Date.now() + SAF_VERIFY_WINDOW_MS;
  let waited = 0;
  let delay = 250;
  for (;;) {
    let failure: FolderOperationError;
    try {
      if (await readText(file) === text) return;
      failure = new FolderOperationError('VERIFY');
    } catch {
      failure = new FolderOperationError('READ');
    }
    // Also cap scheduled waits if the system clock moves backwards.
    const remaining = Math.min(deadline - Date.now(), SAF_VERIFY_WINDOW_MS - waited);
    if (remaining <= 0) throw failure;
    const wait = Math.min(delay, remaining);
    await new Promise<void>(resolve => setTimeout(resolve, wait));
    waited += wait;
    delay = Math.min(delay * 2, 2000);
  }
}

async function writeVerified(dir: Directory, name: string, text: string, mime = 'application/json'): Promise<void> {
  const existing = await fileIn(dir, name);
  await writeFileVerified(existing?.file ?? createFile(dir, name, mime), text);
}

const isBackupName = (name: string) => name === BACKUP_FILENAME || name === PREVIOUS_BACKUP_FILENAME || snapshotPattern.test(name);

export async function folderHasBackup(folderUri: string): Promise<boolean> {
  return (await listFiles(openFolder(folderUri))).some(entry => isBackupName(entry.name));
}

async function archiveVerified(dir: Directory, text: string): Promise<void> {
  // An interrupted write can damage only the newly created file.
  const names = new Set((await listFiles(dir)).map(entry => entry.name));
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let suffix = 0;
  let name: string;
  do { name = `iou-snapshot-${stamp}-${suffix++}.json`; } while (names.has(name));
  await writeFileVerified(createFile(dir, name, 'application/json'), text);
}

async function validCopies(entries: FolderFile[]): Promise<ValidCopy[]> {
  const copies: ValidCopy[] = [];
  for (const entry of entries) {
    if (!isBackupName(entry.name)) continue;
    try { copies.push({ ...entry, text: await readValid(entry.file) }); } catch {
      // A corrupt/unreadable version must not hide another valid version.
    }
  }
  return copies;
}

/** List validated versions only; identical primary/previous mirrors are deduplicated. */
export async function listFolderVersions(folderUri: string): Promise<FolderBackupVersion[]> {
  const entries = await listFiles(openFolder(folderUri));
  const copies = await validCopies(entries);
  if (!copies.length && entries.some(entry => isBackupName(entry.name))) throw new InvalidBackupError();
  copies.sort((a, b) => Date.parse(parseBackup(b.text).backedUpAt) - Date.parse(parseBackup(a.text).backedUpAt));
  const seen = new Set<string>();
  return copies.filter(copy => {
    if (seen.has(copy.text)) return false;
    seen.add(copy.text);
    return true;
  }).map(copy => {
    const payload = parseBackup(copy.text);
    return { id: copy.file.uri, backedUpAt: payload.backedUpAt, peopleCount: payload.people.length, transactionCount: payload.tx.length };
  });
}

/** Revalidate membership and provider name before reading an ephemeral version URI. */
export async function readFolderVersion(folderUri: string, id: string): Promise<string> {
  const entry = (await listFiles(openFolder(folderUri)))
    .find(candidate => candidate.file.uri === id && isBackupName(candidate.name));
  if (!entry) throw new InvalidBackupError();
  return readValid(entry.file);
}

async function pruneSnapshots(dir: Directory): Promise<void> {
  const copies = await validCopies(await listFiles(dir));
  const history = copies.filter(copy => snapshotPattern.test(copy.name));
  // Names order successful archive writes; URI identity handles duplicate names.
  history.sort((a, b) => b.name.localeCompare(a.name, 'en', { numeric: true }) || b.file.uri.localeCompare(a.file.uri, 'en'));
  // Delete only validated IoU archives, never unreadable files or arbitrary user
  // files that happen to resemble a snapshot name.
  for (const entry of history.slice(SNAPSHOT_LIMIT)) {
    try { entry.file.delete(); } catch { /* A cleanup failure cannot invalidate a verified backup. */ }
  }
}

export async function writeToFolder(folderUri: string, text: string): Promise<void> {
  parseBackup(text);
  const dir = openFolder(folderUri);
  let stage: FolderBackupWriteStage = 'read';
  let snapshotSaved = false;
  try {
    const copies = await validCopies(await listFiles(dir));
    const current = await fileIn(dir, BACKUP_FILENAME);
    if (current) {
      let previous: string | undefined;
      try { previous = await readValid(current.file); } catch (error) {
        if (!(error instanceof InvalidBackupError)) throw error;
      }
      if (previous !== undefined) {
        stage = 'history';
        if (!copies.some(copy => snapshotPattern.test(copy.name) && copy.text === previous)) await archiveVerified(dir, previous);
        stage = 'previous';
        await writeVerified(dir, PREVIOUS_BACKUP_FILENAME, previous);
      }
    }
    stage = 'snapshot';
    if (!copies.some(copy => snapshotPattern.test(copy.name) && copy.text === text)) await archiveVerified(dir, text);
    snapshotSaved = true;
    stage = 'latest';
    await writeVerified(dir, BACKUP_FILENAME, text);
    stage = 'report';
    for (const report of readableFiles(text)) await writeVerified(dir, report.name, report.text, report.mime);
    stage = 'cleanup';
    try { await pruneSnapshots(dir); } catch {
      // Every backup file is already verified. Unavailable cleanup metadata
      // may retain extra history, but cannot invalidate the completed save.
    }
  } catch (error) {
    throw new FolderBackupWriteError(stage, snapshotSaved, error instanceof FolderOperationError ? error.operation : 'IO');
  }
}

export async function readFolderBackup(folderUri: string): Promise<{ text: string; recovered: boolean } | null> {
  const entries = await listFiles(openFolder(folderUri));
  const copies = await validCopies(entries);
  copies.sort((a, b) => Date.parse(parseBackup(b.text).backedUpAt) - Date.parse(parseBackup(a.text).backedUpAt));
  const newest = copies[0];
  if (newest) {
    // A failed mirror write can leave a perfectly valid but older canonical
    // file. Offer the newest verified data, with canonical preferred on ties.
    const primary = copies.find(copy => copy.name === BACKUP_FILENAME &&
      Date.parse(parseBackup(copy.text).backedUpAt) === Date.parse(parseBackup(newest.text).backedUpAt));
    return primary ? { text: primary.text, recovered: false } : { text: newest.text, recovered: true };
  }
  if (entries.some(entry => isBackupName(entry.name))) throw new InvalidBackupError();
  return null;
}

export async function readFromFolder(folderUri: string): Promise<string | null> {
  return (await readFolderBackup(folderUri))?.text ?? null;
}

export function folderIsReachable(folderUri: string | null): boolean {
  if (!folderSupported || !folderUri) return false;
  try { return new Directory(folderUri).exists; } catch { return false; }
}

export function folderLabel(folderUri: string | null): string {
  if (!folderUri) return '';
  try {
    const decoded = decodeURIComponent(folderUri);
    return decoded.split(/[:/]/).filter(Boolean).pop() ?? decoded;
  } catch { return folderUri; }
}
