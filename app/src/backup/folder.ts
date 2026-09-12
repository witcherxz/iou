import { Directory, File } from 'expo-file-system';

import { BACKUP_FILENAME } from '../config/app';

/**
 * Folder backup: the user picks any folder once and the app keeps a
 * `iou-backup.json` file in it. No accounts, no API keys.
 *
 * On Android the picker takes a *persistable* URI permission, so the choice
 * survives app restarts and the folder can be one that Drive, Nextcloud or
 * Syncthing already syncs. On iOS the grant lasts for the session only, so the
 * user is asked to pick again after a cold start.
 */

export class FolderUnavailableError extends Error {
  constructor() {
    super('Backup folder is no longer accessible');
    this.name = 'FolderUnavailableError';
  }
}

/** Opens the system folder picker. Returns null when the user cancels. */
export async function pickFolder(): Promise<string | null> {
  try {
    const dir = await Directory.pickDirectoryAsync();
    return dir.uri;
  } catch {
    return null;
  }
}

function backupFileIn(dir: Directory): File | null {
  for (const entry of dir.list()) {
    if (entry instanceof File && entry.name === BACKUP_FILENAME) return entry;
  }
  return null;
}

function openFolder(uri: string): Directory {
  const dir = new Directory(uri);
  if (!dir.exists) throw new FolderUnavailableError();
  return dir;
}

export async function writeToFolder(folderUri: string, text: string): Promise<void> {
  const dir = openFolder(folderUri);
  // Reuse the existing file — SAF would otherwise create "iou-backup (1).json".
  const file = backupFileIn(dir) ?? dir.createFile(BACKUP_FILENAME, 'application/json');
  file.write(text);
}

/** Returns the stored backup, or null when the folder has none yet. */
export async function readFromFolder(folderUri: string): Promise<string | null> {
  const file = backupFileIn(openFolder(folderUri));
  if (!file) return null;
  return file.text();
}

export function folderIsReachable(folderUri: string | null): boolean {
  if (!folderUri) return false;
  try {
    return new Directory(folderUri).exists;
  } catch {
    return false;
  }
}

/** Human-readable tail of a `content://` or `file://` folder URI. */
export function folderLabel(folderUri: string | null): string {
  if (!folderUri) return '';
  try {
    const decoded = decodeURIComponent(folderUri);
    const tail = decoded.split(/[:/]/).filter(Boolean).pop() ?? decoded;
    return tail;
  } catch {
    return folderUri;
  }
}
