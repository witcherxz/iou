import { File } from 'expo-file-system';
import { importFromFile } from '../src/backup/fileShare';
import { InvalidBackupError } from '../src/backup/types';
import { MAX_PORTABLE_BYTES } from '../src/backup/readable';
import { picker } from './backup-picker-native-stub';

let passed = 0;
function check(label: string, condition: unknown) {
  if (!condition) throw new Error(label);
  passed++;
  console.log(`PASS ${label}`);
}
async function main() {
  // This runs the installed Expo wrapper, not a rewritten File.pickFileAsync.
  const incompatible = await File.pickFileAsync({ mimeTypes: '*/*' });
  check(
    'Expo57 masks Android string-to-list conversion failure as picker cancellation',
    incompatible.canceled && picker.opened === 0,
  );
  const result = await importFromFile();
  check(
    'app passes native-compatible MIME list and reads the selected file',
    picker.opened === 1 && result === picker.text && picker.reads === 1,
  );
  picker.mode = 'cancel';
  check(
    'actual picker cancellation stays silent and never reads a file',
    (await importFromFile()) === null && picker.reads === 1,
  );
  picker.mode = 'read-error';
  let failure: unknown;
  try {
    await importFromFile();
  } catch (error) {
    failure = error;
  }
  check(
    'selected file read errors propagate rather than appearing as cancellation',
    failure instanceof Error && failure.message === 'Read failed',
  );
  picker.mode = 'success';
  picker.size = MAX_PORTABLE_BYTES + 1;
  const priorReads = picker.reads;
  failure = null;
  try {
    await importFromFile();
  } catch (error) {
    failure = error;
  }
  check(
    'oversized selected files reject before reading their contents',
    failure instanceof InvalidBackupError && picker.reads === priorReads,
  );
  picker.size = 0;
  check(
    'provider files with unknown reported size still return selected bytes',
    (await importFromFile()) === picker.text,
  );
  console.log(`\n${passed} BACKUP PICKER CHECKS PASSED`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
