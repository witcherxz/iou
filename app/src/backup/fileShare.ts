import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Platform } from 'react-native';

import { BACKUP_FILENAME } from '../config/app';
import { InvalidBackupError } from './types';
import { MAX_PORTABLE_BYTES, ReadableFile } from './readable';

export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device');
    this.name = 'SharingUnavailableError';
  }
}

/** Sharing only confirms the sheet opened, not that the user kept a copy. */
export async function exportToFile(text: string): Promise<void> {
  return exportArtifact({ name: BACKUP_FILENAME, text, mime: 'application/json' });
}

export async function exportArtifact({ name, text, mime }: ReadableFile): Promise<void> {
  if (new TextEncoder().encode(text).byteLength > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([text], { type: mime }));
    const link = document.createElement('a');
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return;
  }
  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();
  const file = new File(Paths.cache, name);
  file.create({ overwrite: true });
  file.write(text);
  // The receiving app may read the URI after the sheet closes; keep the cache file.
  await Sharing.shareAsync(file.uri, {
    mimeType: mime,
    UTI: mime === 'text/html' ? 'public.html' : mime === 'text/csv' ? 'public.comma-separated-values-text' : 'public.json',
    dialogTitle: 'نسخة احتياطية لدفتر الديون',
  });
}

/** Returns null for cancellation; read/provider errors propagate to the caller. */
export async function importFromFile(): Promise<string | null> {
  if (Platform.OS === 'web') {
    return new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json,.html,.htm,application/json,text/html';
      input.style.display = 'none';
      input.oncancel = () => { input.remove(); resolve(null); };
      input.onchange = async () => {
        const file = input.files?.[0];
        input.remove();
        if (!file) { resolve(null); return; }
        if (file.size > MAX_PORTABLE_BYTES) { reject(new InvalidBackupError()); return; }
        try { resolve(await file.text()); } catch (error) { reject(error); }
      };
      document.body.appendChild(input);
      input.click();
    });
  }
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled || !picked.result) return null;
  if (picked.result.size > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  return picked.result.text();
}
