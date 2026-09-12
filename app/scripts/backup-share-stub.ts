/** Local file/share adapter: the recipient deliberately reads only after handoff. */
export const Platform = { OS: 'android' };
export const Paths = { cache: 'file:///private/cache' };
export const shareFiles = new Map<string, string>();
export const shareDirectories = new Set<string>();
export const shares: { uri: string; options: Record<string, unknown> }[] = [];
export const shareState = { available: true, failWrite: false, failShare: false };
let sequence = 0;
export const randomUUID = () => `test-export-${++sequence}`;
const path = (parts: (string | { uri: string })[]) => parts.map(p => typeof p === 'string' ? p : p.uri).join('/');
export class Directory {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) { this.uri = path(parts); }
  create() { if (shareDirectories.has(this.uri)) throw new Error('Directory already exists'); shareDirectories.add(this.uri); }
}
export class File {
  uri: string;
  constructor(...parts: (string | { uri: string })[]) { this.uri = path(parts); }
  create(options?: { overwrite?: boolean }) {
    if (shareFiles.has(this.uri) && !options?.overwrite) throw new Error('File already exists');
    shareFiles.set(this.uri, '');
  }
  write(text: string) {
    if (shareState.failWrite) throw new Error('Cache unavailable');
    shareFiles.set(this.uri, text);
  }
}
export async function isAvailableAsync() { return shareState.available; }
export async function shareAsync(uri: string, options: Record<string, unknown>) {
  if (shareState.failShare) throw new Error('Native share failed');
  shares.push({ uri, options });
}
