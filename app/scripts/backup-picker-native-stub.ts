/** Actual Expo File wrapper with the Android PickFileOptions list boundary. */
export const picker = {
  calls: 0,
  opened: 0,
  reads: 0,
  mode: 'success',
  text: '{"synthetic":true}',
  size: 18,
};
class NativeFile {
  constructor(public uri: string) {}
  validatePath() {}
  get size() {
    return picker.size;
  }
  async text() {
    picker.reads++;
    if (picker.mode === 'read-error') throw new Error('Read failed');
    return picker.text;
  }
}
class NativeDirectory {
  constructor(public uri: string) {}
  validatePath() {}
}
const native = {
  FileSystemFile: NativeFile,
  FileSystemDirectory: NativeDirectory,
  FileSystemWatcher: class {},
  FileSystemUploadTask: class {},
  FileSystemDownloadTask: class {},
  cacheDirectory: 'file:///cache',
  documentDirectory: 'file:///documents',
  bundleDirectory: 'file:///bundle',
  async pickFileAsync(options: { mimeTypes: unknown }) {
    picker.calls++;
    if (!Array.isArray(options.mimeTypes))
      throw new Error('Native PickFileOptions.mimeTypes expects List<String>');
    picker.opened++;
    if (picker.mode === 'cancel') throw new Error('Picker cancelled');
    return { uri: 'file:///selected.json' };
  },
};
export const requireNativeModule = () => native;
export const uuid = { v4: () => 'synthetic' };
export class NativeModule {}
export const Platform = { OS: 'android' };
export const randomUUID = () => 'synthetic';
export const isAvailableAsync = async () => true;
export const shareAsync = async () => {};
