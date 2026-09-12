/** In-memory provider with injected partial writes for recovery regression checks. */
export const files = new Map<string, string>();
export const folders = new Set<string>();
export enum FileMode { Truncate = 'wt' }
export let openHandles = 0;
export const nonTruncatingFolders = new Set<string>();
let failingName: string | null = null;
let failingPattern: RegExp | null = null;
export const failNextWrite = (name: string) => { failingName = name; };
export const failNextWriteMatching = (pattern: RegExp) => { failingPattern = pattern; };
export class Directory {
  constructor(public uri: string) {}
  get exists() { return folders.has(this.uri); }
  list(): File[] {
    if (!this.exists) throw new Error('Directory unavailable');
    return [...files.keys()].filter(uri => uri.startsWith(this.uri + '/')).map(uri => new File(uri));
  }
  createFile(name: string, _mime: string): File {
    const file = new File(this.uri + '/' + name);
    if (files.has(file.uri)) throw new Error('Duplicate file');
    files.set(file.uri, '');
    return file;
  }
  static async pickDirectoryAsync() { return new Directory('memory://backup'); }
}
export class File {
  constructor(public uri: string) {}
  get name() { return this.uri.split('/').pop()!; }
  get size() { return files.get(this.uri)?.length ?? 0; }
  delete() { files.delete(this.uri); }
  async text() {
    const text = files.get(this.uri);
    if (text === undefined) throw new Error('Missing file');
    return text;
  }
  open(mode: FileMode) {
    if (mode !== FileMode.Truncate) throw new Error('Unexpected mode');
    files.set(this.uri, '');
    openHandles++;
    let closed = false;
    return {
      writeBytes: (bytes: Uint8Array) => this.write(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)),
      close: () => { if (!closed) { closed = true; openHandles--; } },
    };
  }
  write(text: string) {
    if (this.name === failingName || failingPattern?.test(this.name)) {
      failingName = null;
      failingPattern = null;
      files.set(this.uri, text.slice(0, 20));
      throw new Error('Provider failed after truncating file');
    }
    const old = files.get(this.uri) ?? '';
    const retainsTail = [...nonTruncatingFolders].some(uri => this.uri.startsWith(uri + '/'));
    files.set(this.uri, text + (retainsTail ? old.slice(text.length) : ''));
  }
}
