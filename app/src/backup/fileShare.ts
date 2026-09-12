import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';

import { BACKUP_FILENAME } from '../config/app';

/**
 * Manual backup: export hands the JSON to the system share sheet (Drive, Files,
 * email, WhatsApp — whatever is installed), import reads it back through the
 * system file picker. Needs no setup at all and works in Expo Go.
 */

export class SharingUnavailableError extends Error {
  constructor() {
    super('Sharing is not available on this device');
    this.name = 'SharingUnavailableError';
  }
}

export async function exportToFile(text: string): Promise<void> {
  const file = new File(Paths.cache, BACKUP_FILENAME);
  if (file.exists) file.delete();
  file.create();
  file.write(text);

  if (!(await Sharing.isAvailableAsync())) throw new SharingUnavailableError();
  await Sharing.shareAsync(file.uri, {
    mimeType: 'application/json',
    UTI: 'public.json',
    dialogTitle: 'نسخة احتياطية لدفتر الديون',
  });
}

/** Returns the chosen file's contents, or null when the user cancels. */
export async function importFromFile(): Promise<string | null> {
  // Deliberately unfiltered: some providers hide .json behind a generic type.
  const picked = await File.pickFileAsync({ mimeTypes: '*/*' });
  if (picked.canceled || !picked.result) return null;
  return picked.result.text();
}
