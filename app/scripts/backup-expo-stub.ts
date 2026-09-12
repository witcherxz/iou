import { listDocumentMetadata, writeDocumentText } from './backup-filesystem-stub';
export function requireOptionalNativeModule(name: string) {
  if (name !== 'IouBackupDocuments') throw new Error('Unexpected native module');
  return { listDirectory: listDocumentMetadata, writeText: writeDocumentText };
}
