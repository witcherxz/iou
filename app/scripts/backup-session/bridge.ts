/** Deferred provider/password boundaries; never accesses a device or account. */
import { FolderBackupWriteError } from '../../src/backup/folder';
export { FolderBackupWriteError };
export const bridge = {
  encrypted: false,
  hostMounted: false,
  confirmHold: false,
  answerConfirmation: null as null | ((value: boolean) => void),
  importHold: false,
  importCalls: 0,
  releaseImport: null as null | (() => void),
  decryptCalls: 0,
  resolveDecrypt: null as null | (() => void),
  rejectDecrypt: null as null | (() => void),
  configured: false,
  confirm: true,
  artifacts: [] as any[],
  patches: [] as any[],
  restores: [] as any[],
  toasts: [] as string[],
  googleCalls: [] as string[],
  importValue: null as string | null,
  shareError: false,
  connected: false,
  googleBackup: null as string | null,
  folderProbeCount: 0,
  folderProbeHold: false,
  folderProbeRelease: null as null | (() => void),
  folderExists: false,
  folderProbeError: false,
  confirmations: 0,
  folderWrites: 0,
  folderError: null as null | { stage: any; snapshotSaved: boolean; verify?: boolean },
};
export const isGoogleConfigured = () => bridge.configured;
export class SharingUnavailableError extends Error {}
export const exportArtifact = async (artifact: any) => {
  if (bridge.shareError) throw new SharingUnavailableError();
  bridge.artifacts.push(artifact);
};
export const exportToFile = async (text: string) =>
  exportArtifact({ name: 'iou-backup.json', mime: 'application/json', text });
export const importFromFile = async () => {
  bridge.importCalls++;
  if (bridge.importHold)
    await new Promise<void>((resolve) => {
      bridge.releaseImport = resolve;
    });
  return bridge.importValue;
};
export class BackupPasswordError extends Error {}
export const encryptedEnvelope = () => bridge.encrypted;
export const decryptBackup = async (text: string) => {
  bridge.decryptCalls++;
  return new Promise<string>((resolve, reject) => {
    bridge.resolveDecrypt = () => resolve(text);
    bridge.rejectDecrypt = () => reject(new BackupPasswordError());
  });
};
export const encryptBackup = async (text: string) => text;
export class FolderUnavailableError extends Error {}
export const folderSupported = true;
export const folderLabel = () => '';
export const folderHasBackup = async () => {
  bridge.folderProbeCount++;
  if (bridge.folderProbeHold)
    await new Promise<void>((resolve) => {
      bridge.folderProbeRelease = resolve;
    });
  if (bridge.folderProbeError) throw new Error('Provider could not list saved backups');
  return bridge.folderExists;
};
export const folderIsReachable = () => true;
export const pickFolder = async () => null;
export const readFolderBackup = async () => null;
export const writeToFolder = async () => {
  bridge.folderWrites++;
  if (bridge.folderError)
    throw new FolderBackupWriteError(
      bridge.folderError.stage,
      bridge.folderError.snapshotSaved,
      bridge.folderError.verify,
    );
};
export const listFolderVersions = async () => [];
export const readFolderVersion = async () => '';
export class NotConfiguredError extends Error {}
export class NotSignedInError extends Error {}
export const hasConnectedAccount = async () => {
  bridge.googleCalls.push('hasAccount');
  return bridge.connected;
};
export const signIn = async () => {
  bridge.googleCalls.push('signIn');
  bridge.connected = true;
  return true;
};
export const signOut = async () => {
  bridge.googleCalls.push('signOut');
  bridge.connected = false;
};
export const uploadBackup = async (text: string) => {
  bridge.googleCalls.push('upload');
  bridge.googleBackup = text;
};
export const downloadBackup = async () => {
  bridge.googleCalls.push('download');
  return bridge.googleBackup;
};
export const Platform = { OS: 'android' };
export const Alert = {};
