/** Provider adapter double: opaque IDs, paired metadata, stale fresh-file metadata and partial writes. */
export const files = new Map<string, string>();
export const folders = new Set<string>();
export enum FileMode { Truncate = 'wt' }
export let openHandles = 0;
export let freshSafWriteAttempts = 0;
export let expoSafOpenAttempts = 0;
export const nativeWriteCalls: string[] = [];
const nativeOpenDocuments = new Set<string>();
export const nonTruncatingFolders = new Set<string>();
export const opaqueFolders = new Set<string>();
export const reorderedFolders = new Set<string>();
export const readCalls: string[] = [];
export const metadata = new Map<string, { folder: string; uri: string; name: string; isDirectory: boolean }>();
const freshSafFiles = new Set<string>();
let sequence = 0;
let listingSequence = 0;
let failingName: string | null = null;
let failingPattern: RegExp | null = null;
let failingCreate: string | null = null;
let failingRead: string | null = null;
let mismatchingRead: string | null = null;
let failingListing = false;
let hangingListing = false;
let failingClose: string | null = null;
let failingOpen = false;
export const failNextWrite = (name: string) => { failingName = name; };
export const failNextWriteMatching = (pattern: RegExp) => { failingPattern = pattern; };
export const failNextCreate = (name: string) => { failingCreate = name; };
export const failNextRead = (name: string) => { failingRead = name; };
export const mismatchNextRead = (name: string) => { mismatchingRead = name; };
export const failNextListing = () => { failingListing = true; };
export const hangNextListing = () => { hangingListing = true; };
export const failNextClose = (name: string) => { failingClose = name; };
export const failNextOpen = () => { failingOpen = true; };
const normalize = (uri: string) => uri.replace(/\/$/, '');

export function addDocument(folder: string, name: string, text: string, id?: string, isDirectory = false): string {
  folder = normalize(folder);
  const parsed = new URL(folder);
  const tree = parsed.pathname.split('/').slice(0, 3).join('/');
  const identity = id ?? (opaqueFolders.has(folder) ? `opaque-${++sequence}` : name);
  const uri = `${parsed.protocol}//${parsed.host}${tree}/document/${encodeURIComponent(identity)}`;
  if (metadata.has(uri)) throw new Error('Duplicate document identity');
  metadata.set(uri, { folder, uri, name, isDirectory });
  if (isDirectory) folders.add(uri); else files.set(uri, text);
  return uri;
}

export function documentUriNamed(folder: string, name: string): string {
  const entry = [...metadata.values()].find(entry => entry.folder === normalize(folder) && entry.name === name && files.has(entry.uri));
  if (!entry) throw new Error('Missing named mock document');
  return entry.uri;
}

export async function listDocumentMetadata(folder: string) {
  if (hangingListing) { hangingListing = false; return await new Promise<never>(() => {}); }
  if (failingListing) { failingListing = false; throw new Error('private provider details must not escape'); }
  const entries = [...metadata.values()]
    .filter(entry => entry.folder === normalize(folder) && (entry.isDirectory || files.has(entry.uri)))
    .map(({ uri, name, isDirectory }) => ({ uri, name, isDirectory }));
  if (reorderedFolders.has(normalize(folder)) && ++listingSequence % 2) entries.reverse();
  return entries;
}

/** Model asynchronous provider writes that finish only when the owned stream closes. */
export async function writeDocumentText(uri: string, text: string): Promise<void> {
  if (!uri.startsWith('content://') || !files.has(uri)) throw new Error('Missing provider document');
  nativeWriteCalls.push(uri);
  if (failingOpen) {
    failingOpen = false;
    throw new Error('private provider stream-open failure');
  }
  nativeOpenDocuments.add(uri);
  openHandles++;
  files.set(uri, ''); // resolver.openOutputStream(uri, "wt") truncates on open.
  try {
    await Promise.resolve();
    writeContent(uri, text);
  } finally {
    nativeOpenDocuments.delete(uri);
    openHandles--;
    if (metadata.get(uri)?.name === failingClose) {
      failingClose = null;
      throw new Error('private provider close failure');
    }
  }
}

function writeContent(uri: string, text: string) {
  const name = metadata.get(uri)?.name ?? decodeURIComponent(new URL(uri).pathname).split('/').pop()!;
  if (name === failingName || failingPattern?.test(name)) {
    failingName = null;
    failingPattern = null;
    files.set(uri, text.slice(0, 20));
    throw new Error('Provider failed after truncating file');
  }
  const old = files.get(uri) ?? '';
  const parent = metadata.get(uri)?.folder;
  const retainsTail = parent ? nonTruncatingFolders.has(parent) : [...nonTruncatingFolders].some(folder => uri.startsWith(folder + '/'));
  files.set(uri, text + (retainsTail ? old.slice(text.length) : ''));
}

export class Directory {
  constructor(public uri: string) {}
  get exists() { return folders.has(normalize(this.uri)); }
  list(): File[] {
    if (!this.exists) throw new Error('Directory unavailable');
    if (this.uri.startsWith('content://')) throw new Error('Android SAF must use paired provider metadata');
    return [...files.keys()].filter(uri => uri.startsWith(this.uri + '/')).map(uri => new File(uri));
  }
  createFile(name: string, _mime: string): File {
    if (name === failingCreate) { failingCreate = null; throw new Error('private create details'); }
    if (this.uri.startsWith('content://')) {
      const uri = addDocument(this.uri, name, '');
      freshSafFiles.add(uri);
      return new File(uri);
    }
    const file = new File(this.uri + '/' + name);
    if (files.has(file.uri)) throw new Error('Duplicate file');
    files.set(file.uri, '');
    return file;
  }
  static async pickDirectoryAsync() { return new Directory('memory://backup'); }
}

export class File {
  constructor(public uri: string) {}
  get name() { return decodeURIComponent(new URL(this.uri).pathname).split('/').pop()!; }
  get size() { return freshSafFiles.has(this.uri) ? 0 : files.get(this.uri)?.length ?? 0; }
  delete() { files.delete(this.uri); metadata.delete(this.uri); freshSafFiles.delete(this.uri); }
  async text() {
    readCalls.push(this.uri);
    if (nativeOpenDocuments.has(this.uri)) throw new Error('Provider document not committed before close');
    const name = metadata.get(this.uri)?.name ?? this.name;
    if (name === failingRead) { failingRead = null; throw new Error('private read details'); }
    const text = files.get(this.uri);
    if (text === undefined) throw new Error('Missing file');
    if (name === mismatchingRead) { mismatchingRead = null; return text + 'unexpected tail'; }
    return text;
  }
  open(mode: FileMode) {
    if (this.uri.startsWith('content://')) {
      expoSafOpenAttempts++;
      throw new Error('Expo non-owning provider handles must not be used');
    }
    if (mode !== FileMode.Truncate) throw new Error('Unexpected mode');
    if (!files.has(this.uri)) throw new Error('Cannot open missing document');
    files.set(this.uri, '');
    openHandles++;
    let closed = false;
    return {
      writeBytes: (bytes: Uint8Array) => writeContent(this.uri, new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)),
      close: () => { if (!closed) { closed = true; openHandles--; } },
    };
  }
  write(text: string) {
    if (freshSafFiles.has(this.uri)) {
      freshSafWriteAttempts++;
      throw new Error('File.write attempts unsupported File.create while provider metadata lags');
    }
    writeContent(this.uri, text);
  }
}
