import { requireOptionalNativeModule } from 'expo';
import { Platform } from 'react-native';

export interface AndroidDocumentEntry {
  uri: string;
  name: string;
  isDirectory: boolean;
}

interface AndroidDocumentsModule {
  listDirectory(uri: string): Promise<unknown>;
  writeText(uri: string, text: string): Promise<void>;
}

class AndroidDocumentsError extends Error {
  constructor(message = 'تعذر قراءة أسماء الملفات في مجلد النسخ الاحتياطي.') {
    super(message);
    this.name = 'AndroidDocumentsError';
  }
}

function treeIdentity(uri: string, directory = false): { authority: string; treeId: string; isDocument: boolean } {
  if (typeof uri !== 'string' || uri.length > 16_384) throw new AndroidDocumentsError();
  try {
    const parsed = new URL(uri);
    // Expo Directory.uri adds one trailing slash; document URIs stay exact.
    const path = directory && parsed.pathname.endsWith('/') ? parsed.pathname.slice(0, -1) : parsed.pathname;
    const parts = path.split('/');
    if (parsed.protocol !== 'content:' || !parsed.host || parsed.username || parsed.password || parsed.hash ||
      parts[0] !== '' || parts[1] !== 'tree' || !parts[2] ||
      !(parts.length === 3 || (parts.length === 5 && parts[3] === 'document' && parts[4]))) {
      throw new AndroidDocumentsError();
    }
    const treeId = decodeURIComponent(parts[2]);
    if (!treeId || treeId.includes('\0')) throw new AndroidDocumentsError();
    if (parts.length === 5 && (!decodeURIComponent(parts[4]) || decodeURIComponent(parts[4]).includes('\0'))) throw new AndroidDocumentsError();
    return { authority: parsed.host, treeId, isDocument: parts.length === 5 };
  } catch { throw new AndroidDocumentsError(); }
}

/** Preserve provider display names and opaque document URIs as a paired result. */
export function validateAndroidDocumentEntries(folderUri: string, value: unknown): AndroidDocumentEntry[] {
  const folder = treeIdentity(folderUri, true);
  if (!Array.isArray(value) || value.length > 10_000) throw new AndroidDocumentsError();
  const seen = new Set<string>();
  return value.map(entry => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) throw new AndroidDocumentsError();
    const candidate = entry as Record<string, unknown>;
    if (typeof candidate.uri !== 'string' || typeof candidate.name !== 'string' || candidate.name.length === 0 ||
      candidate.name.length > 4096 || candidate.name.includes('\0') || typeof candidate.isDirectory !== 'boolean') {
      throw new AndroidDocumentsError();
    }
    const identity = treeIdentity(candidate.uri);
    if (!identity.isDocument || identity.authority !== folder.authority || identity.treeId !== folder.treeId || seen.has(candidate.uri)) {
      throw new AndroidDocumentsError();
    }
    seen.add(candidate.uri);
    return { uri: candidate.uri, name: candidate.name, isDirectory: candidate.isDirectory };
  });
}

export async function listAndroidDocuments(uri: string): Promise<AndroidDocumentEntry[]> {
  treeIdentity(uri, true);
  if (Platform.OS !== 'android') throw new AndroidDocumentsError();
  const native = requireOptionalNativeModule<AndroidDocumentsModule>('IouBackupDocuments');
  if (!native || typeof native.listDirectory !== 'function') {
    throw new AndroidDocumentsError('يلزم تحديث التطبيق لقراءة ملفات هذا المجلد.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([native.listDirectory(uri), new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new AndroidDocumentsError()), 30_000);
    })]);
    return validateAndroidDocumentEntries(uri, result);
  } catch { throw new AndroidDocumentsError(); }
  finally { if (timer) clearTimeout(timer); }
}

/** Resolve only after the provider's owned, truncating output stream closes. */
export async function writeAndroidDocument(uri: string, text: string): Promise<void> {
  if (!treeIdentity(uri).isDocument || new URL(uri).search || typeof text !== 'string' || Platform.OS !== 'android') {
    throw new AndroidDocumentsError('تعذر حفظ ملف النسخة الاحتياطية.');
  }
  const native = requireOptionalNativeModule<AndroidDocumentsModule>('IouBackupDocuments');
  if (!native || typeof native.writeText !== 'function') {
    throw new AndroidDocumentsError('يلزم تحديث التطبيق لحفظ ملفات هذا المجلد.');
  }
  try {
    // Do not time out a write: the provider could still mutate the document
    // after a timeout, racing verification, cleanup, or a subsequent backup.
    await native.writeText(uri, text);
  } catch { throw new AndroidDocumentsError('تعذر حفظ ملف النسخة الاحتياطية.'); }
}
