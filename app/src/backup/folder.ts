import { Directory, File } from 'expo-file-system';
import { Platform } from 'react-native';

import { BACKUP_FILENAME } from '../config/app';
import { InvalidBackupError, MAX_BACKUP_BYTES, parseBackup } from './types';
import { readableFiles } from './readable';

/** Android persists the folder grant; iOS may require picking it again next session. */
export const folderSupported = Platform.OS === 'android' || Platform.OS === 'ios';
export const PREVIOUS_BACKUP_FILENAME = 'iou-backup.previous.json';
export const SNAPSHOT_LIMIT = 10;
const snapshotPattern = /^iou-snapshot-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-\d+\.json$/;
export interface FolderBackupVersion {
  id: string;
  backedUpAt: string;
  peopleCount: number;
  transactionCount: number;
}

export class FolderUnavailableError extends Error {
  constructor() {
    super('Backup folder is no longer accessible');
    this.name = 'FolderUnavailableError';
  }
}

export async function pickFolder(): Promise<string | null> {
  if (!folderSupported) throw new FolderUnavailableError();
  try {
    return (await Directory.pickDirectoryAsync()).uri;
  } catch (error) {
    // Cancellation is expected; provider/permission errors must reach the UI.
    if (error instanceof Error && /cancel/i.test(error.message)) return null;
    throw error;
  }
}

function fileIn(dir: Directory, name: string): File | null {
  return dir.list().find((entry): entry is File => entry instanceof File && entry.name === name) ?? null;
}

function openFolder(uri: string): Directory {
  if (!folderSupported) throw new FolderUnavailableError();
  const dir = new Directory(uri);
  if (!dir.exists) throw new FolderUnavailableError();
  return dir;
}

async function readValid(file: File): Promise<string> {
  if (file.size > MAX_BACKUP_BYTES) throw new InvalidBackupError();
  const text = await file.text();
  parseBackup(text);
  return text;
}

async function writeVerified(dir: Directory, name: string, text: string, mime = 'application/json'): Promise<void> {
  const file = fileIn(dir, name) ?? dir.createFile(name, mime);
  file.write(text);
  if (await file.text() !== text) throw new Error('Backup file verification failed');
}

export function folderHasBackup(folderUri: string): boolean {
  const dir = openFolder(folderUri);
  return dir.list().some(entry => entry instanceof File && isBackupName(entry.name));
}

const isBackupName = (name: string) => name === BACKUP_FILENAME || name === PREVIOUS_BACKUP_FILENAME || snapshotPattern.test(name);

async function archiveVerified(dir: Directory, text: string): Promise<void> {
  // Names identify immutable writes. A failed provider write can damage only the
  // newly-created file; neither the latest good backup nor its history is opened.
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  let suffix = 0;
  let name: string;
  do { name = `iou-snapshot-${stamp}-${suffix++}.json`; } while (fileIn(dir, name));
  const file = dir.createFile(name, 'application/json');
  file.write(text);
  if (await file.text() !== text) throw new Error('Backup snapshot verification failed');
}

async function validCopies(dir: Directory): Promise<{ file: File; text: string }[]> {
  const copies: { file: File; text: string }[] = [];
  for (const entry of dir.list()) {
    if (!(entry instanceof File) || !isBackupName(entry.name)) continue;
    try { copies.push({ file: entry, text: await readValid(entry) }); } catch { /* A corrupt version must not hide a valid older copy. */ }
  }
  return copies;
}

/** List validated versions only; primary/previous mirrors do not duplicate history. */
export async function listFolderVersions(folderUri: string): Promise<FolderBackupVersion[]> {
  const dir = openFolder(folderUri);
  const copies = await validCopies(dir);
  if (!copies.length && dir.list().some(entry => entry instanceof File && isBackupName(entry.name))) throw new InvalidBackupError();
  copies.sort((a, b) => Date.parse(parseBackup(b.text).backedUpAt) - Date.parse(parseBackup(a.text).backedUpAt));
  const seen = new Set<string>();
  return copies.filter(copy => {
    if (seen.has(copy.text)) return false;
    seen.add(copy.text);
    return true;
  }).map(copy => {
    const payload = parseBackup(copy.text);
    return { id: copy.file.name, backedUpAt: payload.backedUpAt, peopleCount: payload.people.length, transactionCount: payload.tx.length };
  });
}

/** Re-read and validate at selection time; a picker never retains stale file contents. */
export async function readFolderVersion(folderUri: string, id: string): Promise<string> {
  if (!isBackupName(id)) throw new InvalidBackupError();
  const file = fileIn(openFolder(folderUri), id);
  if (!file) throw new Error('Backup version is no longer available');
  return readValid(file);
}

async function pruneSnapshots(dir: Directory): Promise<void> {
  const copies = await validCopies(dir);
  const history = copies.filter(copy => snapshotPattern.test(copy.file.name));
  // Retain the newest successful archive writes, even if the ledger is restored
  // from an older date. Never delete user files or the compatibility mirrors.
  history.sort((a, b) => b.file.name.localeCompare(a.file.name, 'en', { numeric: true }));
  const keep = new Set(history.slice(0, SNAPSHOT_LIMIT).map(copy => copy.file.name));
  for (const entry of dir.list()) if (entry instanceof File && snapshotPattern.test(entry.name) && !keep.has(entry.name)) {
    try { entry.delete(); } catch { /* Retention is best effort; never fail a verified backup over cleanup. */ }
  }
}

export async function writeToFolder(folderUri: string, text: string): Promise<void> {
  parseBackup(text);
  const dir = openFolder(folderUri);
  const copies = await validCopies(dir);
  const current = fileIn(dir, BACKUP_FILENAME);
  if (current) {
    let previous: string | undefined;
    try {
      previous = await readValid(current);
    } catch (error) {
      if (!(error instanceof InvalidBackupError)) throw error;
      // An interrupted primary write must never replace the valid recovery copy.
    }
    if (previous !== undefined) {
      if (!copies.some(copy => snapshotPattern.test(copy.file.name) && copy.text === previous)) await archiveVerified(dir, previous);
      await writeVerified(dir, PREVIOUS_BACKUP_FILENAME, previous);
    }
  }
  // SAF providers do not promise atomic rename. Keep the verified prior copy intact
  // while replacing the current file, and read back before reporting success.
  if (!copies.some(copy => snapshotPattern.test(copy.file.name) && copy.text === text)) await archiveVerified(dir, text);
  await writeVerified(dir, BACKUP_FILENAME, text);
  for (const report of readableFiles(text)) await writeVerified(dir, report.name, report.text, report.mime);
  await pruneSnapshots(dir);
}

export async function readFolderBackup(folderUri: string): Promise<{ text: string; recovered: boolean } | null> {
  const dir = openFolder(folderUri);
  const current = fileIn(dir, BACKUP_FILENAME);
  let error: unknown;
  if (current) {
    try {
      return { text: await readValid(current), recovered: false };
    } catch (caught) {
      error = caught;
    }
  }
  const alternatives = await validCopies(dir);
  alternatives.sort((a, b) => Date.parse(parseBackup(b.text).backedUpAt) - Date.parse(parseBackup(a.text).backedUpAt));
  if (alternatives[0]) return { text: alternatives[0].text, recovered: true };
  if (error) throw error;
  if (dir.list().some(entry => entry instanceof File && isBackupName(entry.name))) throw new InvalidBackupError();
  return null;
}

export async function readFromFolder(folderUri: string): Promise<string | null> {
  return (await readFolderBackup(folderUri))?.text ?? null;
}

export function folderIsReachable(folderUri: string | null): boolean {
  if (!folderSupported || !folderUri) return false;
  try {
    return new Directory(folderUri).exists;
  } catch {
    return false;
  }
}

export function folderLabel(folderUri: string | null): string {
  if (!folderUri) return '';
  try {
    const decoded = decodeURIComponent(folderUri);
    return decoded.split(/[:/]/).filter(Boolean).pop() ?? decoded;
  } catch {
    return folderUri;
  }
}
