import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Platform } from 'react-native';

import { exportArtifact, exportToFile, importFromFile, SharingUnavailableError } from './backup/fileShare';
import { BackupPasswordError, decryptBackup, encryptBackup, encryptedEnvelope } from './backup/encrypted';
import { parseReadableBackup, readableFiles } from './backup/readable';
import {
  folderHasBackup, folderIsReachable, folderLabel, folderSupported, FolderUnavailableError, FolderBackupWriteError,
  pickFolder, readFolderBackup, writeToFolder, listFolderVersions, readFolderVersion, FolderBackupVersion,
} from './backup/folder';
import {
  downloadBackup, hasConnectedAccount, NotConfiguredError, NotSignedInError, signIn, signOut, uploadBackup,
} from './backup/google';
import {
  AUTOMATIC_TARGETS, backupFingerprint, InvalidBackupError, isBackupTimestamp,
  parseBackup, restoredState, serialize, TARGET_LABELS,
} from './backup/types';
import { confirmAction } from './confirm';
import { isGoogleConfigured } from './config/google';
import { fmt } from './format';
import { BackupTarget, PersistedState } from './types';

export interface BackupView {
  target: BackupTarget;
  title: string;
  status: string;
  dot: 'ok' | 'busy' | 'warn' | 'off';
  working: boolean;
  supportsAuto: boolean;
  requiresFirstBackup: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  driveConfigured: boolean;
  folderSupported: boolean;
  folderLabel: string;
}

interface Options {
  state: PersistedState;
  ready: boolean;
  /** An older local recovery must not overwrite a newer external backup unattended. */
  suspendAutomatic?: boolean;
  /** Return the applied state when device policy adjusts portable preferences. */
  onRestored: (state: PersistedState) => Promise<PersistedState | void>;
  onToast: (message: string) => void;
  onPatch: (patch: Partial<PersistedState>) => void;
}

type Operation = 'save' | 'restore' | 'setup' | null;
export type PortableExport = 'report' | 'encrypted' | 'json' | 'balances' | 'transactions' | 'installments' | 'history';
export interface BackupPasswordRequest { error: string | null; verifying: boolean }

export function useBackup({ state, ready, suspendAutomatic = false, onRestored, onToast, onPatch }: Options) {
  const [operation, setOperation] = useState<Operation>(null);
  const [driveConnected, setDriveConnected] = useState(false);
  const [folderOk, setFolderOk] = useState(true);
  const [errorStatus, setErrorStatus] = useState<string | null>(null);
  const [versions, setVersions] = useState<FolderBackupVersion[]>([]);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [passwordRequest, setPasswordRequest] = useState<BackupPasswordRequest | null>(null);
  const passwordResolver = useRef<((password: string | null) => void) | null>(null);
  const busy = useRef(false);
  const automaticSuspended = useRef(suspendAutomatic);
  automaticSuspended.current = suspendAutomatic;
  const latest = useRef(state);
  latest.current = state;
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const baseline = useRef<{ destination: string; fingerprint: string } | null>(null);
  const driveConfigured = isGoogleConfigured();
  const { backupTarget: target, backupFolderUri } = state;
  const destination = `${target}:${backupFolderUri ?? ''}`;
  const fingerprint = useMemo(() => backupFingerprint(state), [
    state.version, state.profileName, state.people, state.tx, state.reminderPrefs,
    state.changes, state.reminderSettings, state.weekly, state.dark, state.accent,
  ]);
  const manualDrive = target === 'drive' && !driveConfigured;
  const supportsAuto = AUTOMATIC_TARGETS.includes(target) &&
    (target !== 'folder' || folderSupported) && (target !== 'drive' || driveConfigured);
  const requiresFirstBackup = supportsAuto && !isBackupTimestamp(state.lastBackup);

  const askPassword = useCallback((error: string | null = null) => new Promise<string | null>(resolve => {
    passwordResolver.current = resolve;
    setPasswordRequest({ error, verifying: false });
  }), []);
  const submitPassword = useCallback((password: string) => {
    const resolve = passwordResolver.current;
    if (!resolve) return;
    passwordResolver.current = null;
    setPasswordRequest({ error: null, verifying: true });
    resolve(password);
  }, []);
  const cancelPassword = useCallback(() => {
    if (!passwordResolver.current) return;
    passwordResolver.current(null);
    passwordResolver.current = null;
    setPasswordRequest(null);
  }, []);
  useEffect(() => () => { passwordResolver.current?.(null); passwordResolver.current = null; }, []);

  useEffect(() => {
    if (!driveConfigured) return;
    let active = true;
    hasConnectedAccount().then(connected => { if (active) setDriveConnected(connected); })
      .catch(() => { if (active) setDriveConnected(false); });
    return () => { active = false; };
  }, [driveConfigured]);

  useEffect(() => {
    if (target === 'folder') setFolderOk(folderIsReachable(backupFolderUri));
  }, [target, backupFolderUri]);

  const clearTimer = useCallback(() => {
    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = null;
  }, []);

  const begin = useCallback((next: Exclude<Operation, null>): boolean => {
    if (busy.current) return false;
    busy.current = true;
    clearTimer();
    setOperation(next);
    setErrorStatus(null);
    return true;
  }, [clearTimer]);

  const finish = useCallback(() => {
    busy.current = false;
    setOperation(null);
  }, []);

  const reportError = useCallback((error: unknown, source: BackupTarget, restoring = false) => {
    let message = restoring ? 'تعذّرت الاستعادة. حاول مرة أخرى' : 'تعذّر حفظ النسخة. حاول مرة أخرى';
    if (error instanceof InvalidBackupError) message = 'النسخة غير صالحة أو إصدارها غير مدعوم';
    else if (error instanceof BackupPasswordError) message = error.message;
    else if (error instanceof FolderBackupWriteError) {
      message = error.message;
      console.warn('[IoU backup]', error.code);
    }
    else if (error instanceof SharingUnavailableError) message = 'المشاركة غير متاحة على هذا الجهاز';
    else if (error instanceof NotConfiguredError) message = 'Google Drive غير متاح حالياً. اختر ملفاً أو مجلداً';
    else if (error instanceof NotSignedInError) {
      message = 'انقطع اتصال Google Drive. أعد الاتصال للمتابعة';
      setDriveConnected(false);
    } else if (source === 'folder') {
      const reachable = folderIsReachable(latest.current.backupFolderUri);
      setFolderOk(reachable);
      if (!reachable || error instanceof FolderUnavailableError) message = 'المجلد غير متاح. اختر المجلد مرة أخرى';
    }
    setErrorStatus(message);
    onToast(message);
  }, [onToast]);

  /** Only explicit actions may open sign-in. Automatic writes never prompt. */
  const withDrive = useCallback(async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (!driveConfigured) throw new NotConfiguredError();
    let prompted = false;
    if (!(await hasConnectedAccount())) {
      if (!(await signIn())) return undefined;
      prompted = true;
      setDriveConnected(true);
    }
    try {
      const result = await fn();
      setDriveConnected(true);
      return result;
    } catch (error) {
      if (!(error instanceof NotSignedInError) || prompted) throw error;
      setDriveConnected(false);
      if (!(await signIn())) return undefined;
      setDriveConnected(true);
      return fn();
    }
  }, [driveConfigured]);

  const runBackup = useCallback(async (automatic = false) => {
    const snapshot = latest.current;
    const source = snapshot.backupTarget;
    const shareToDrive = source === 'drive' && !driveConfigured;
    const manualFile = source === 'file' || shareToDrive;
    if (automatic && (automaticSuspended.current || !snapshot.autoBackup || !isBackupTimestamp(snapshot.lastBackup) ||
      !AUTOMATIC_TARGETS.includes(source) || manualFile)) return;
    if (!ready || source === 'none' || !begin('save')) return;
    const savedFingerprint = backupFingerprint(snapshot);
    try {
      if (!automatic && !manualFile && AUTOMATIC_TARGETS.includes(source) &&
        (automaticSuspended.current || !isBackupTimestamp(snapshot.lastBackup))) {
        const existing = source === 'folder'
          ? snapshot.backupFolderUri && await folderHasBackup(snapshot.backupFolderUri)
          : await withDrive(() => downloadBackup());
        if (existing === undefined) return;
        if (existing && !(await confirmAction(
          'توجد نسخة محفوظة',
          source === 'folder'
            ? 'سيُحفظ الدفتر الحالي كنسخة جديدة، مع الاحتفاظ بآخر 10 نسخ. يمكنك إلغاء الحفظ واستعادة نسخة سابقة أولاً.'
            : 'الحفظ سيستبدل النسخة الموجودة بالدفتر الحالي. يمكنك إلغاء الحفظ واستعادتها أولاً.',
          source === 'folder' ? 'حفظ نسخة جديدة' : 'استبدال النسخة',
        ))) return;
      }
      const payload = serialize(snapshot);
      if (source === 'folder') {
        if (!snapshot.backupFolderUri) throw new FolderUnavailableError();
        await writeToFolder(snapshot.backupFolderUri, payload);
        setFolderOk(true);
      } else if (manualFile) {
        await exportArtifact(readableFiles(payload)[0]);
      } else if (automatic) {
        await uploadBackup(payload);
      } else {
        const done = await withDrive(async () => { await uploadBackup(payload); return true; });
        if (!done) return;
      }
      baseline.current = {
        destination: `${source}:${snapshot.backupFolderUri ?? ''}`,
        fingerprint: savedFingerprint,
      };
      // A share sheet (including dismissal) cannot confirm that Drive saved it.
      if (!manualFile) onPatch({ lastBackup: new Date().toISOString() });
      if (!automatic) onToast(shareToDrive
        ? Platform.OS === 'web' ? 'بدأ تنزيل النسخة. ارفع الملف إلى Google Drive' : 'تأكد من اكتمال حفظ النسخة داخل Google Drive'
        : source === 'file'
        ? Platform.OS === 'web' ? 'بدأ تنزيل النسخة. تأكد من حفظ الملف' : 'اختر مكان حفظ النسخة من خيارات المشاركة'
        : 'تم حفظ النسخة الاحتياطية');
    } catch (error) {
      reportError(error, source);
    } finally {
      finish();
    }
  }, [ready, suspendAutomatic, driveConfigured, begin, finish, withDrive, onPatch, onToast, reportError]);

  const restoreFrom = useCallback(async (source: BackupTarget, versionId?: string) => {
    if (source === 'none' || !begin('restore')) return;
    const manualFile = source === 'file' || (source === 'drive' && !driveConfigured);
    try {
      let text: string | null | undefined;
      let recovered = false;
      if (source === 'folder') {
        const uri = latest.current.backupFolderUri;
        if (!uri) throw new FolderUnavailableError();
        const result = versionId ? { text: await readFolderVersion(uri, versionId), recovered: false } : await readFolderBackup(uri);
        text = result?.text ?? null;
        recovered = result?.recovered ?? false;
      } else if (manualFile) {
        text = (await importFromFile()) ?? undefined; // Cancellation is silent.
      } else {
        text = await withDrive(() => downloadBackup());
      }
      if (text === undefined) return;
      if (text === null) { onToast('لا توجد نسخة احتياطية'); return; }
      if (encryptedEnvelope(text)) {
        let passwordError: string | null = null;
        while (true) {
          const password = await askPassword(passwordError);
          if (password === null) return;
          try {
            text = await decryptBackup(text, password);
            setPasswordRequest(null);
            // Let the password modal unmount before showing the restore preview.
            await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
            break;
          } catch (error) {
            if (!(error instanceof BackupPasswordError)) throw error;
            passwordError = error.message;
          }
        }
      }
      const backup = parseReadableBackup(text);
      const before = backupFingerprint(latest.current);
      const date = new Date(backup.backedUpAt).toLocaleString('ar-SA', { calendar: 'gregory', numberingSystem: 'latn' });
      const message = `${recovered ? 'تعذّر قراءة النسخة الأخيرة؛ عُثر على نسخة سليمة من السجل.\n\n' : ''}` +
        `تاريخ النسخة: ${date}\n${fmt(backup.people.length, 0)} أشخاص · ${fmt(backup.tx.length, 0)} عمليات\n\n` +
        'سيتم استبدال بيانات الدفتر الحالي بهذه النسخة. لن يتم دمج الدفترين.';
      if (!(await confirmAction('استعادة النسخة الاحتياطية', message, 'استعادة'))) return;
      if (backupFingerprint(latest.current) !== before) {
        onToast('تغيّر الدفتر أثناء المعاينة. افتح الاستعادة مرة أخرى');
        return;
      }
      const next = restoredState(latest.current, backup, manualFile ? 'file' : source);
      const oldBaseline = baseline.current;
      baseline.current = { destination, fingerprint: backupFingerprint(next) };
      try {
        const applied = await onRestored(next);
        baseline.current = { destination, fingerprint: backupFingerprint(applied ?? next) };
      } catch (error) { baseline.current = oldBaseline; throw error; }
      if (source === 'folder') setFolderOk(true);
      onToast(recovered ? 'تمت الاستعادة من النسخة السابقة' : 'تمت الاستعادة');
    } catch (error) {
      reportError(error, source, true);
    } finally {
      setPasswordRequest(null);
      finish();
    }
  }, [begin, finish, driveConfigured, withDrive, onRestored, onToast, reportError, destination, askPassword]);

  const refreshVersions = useCallback(async () => {
    if (!begin('setup')) return;
    setHistoryError(null);
    try {
      const uri = latest.current.backupFolderUri;
      if (latest.current.backupTarget !== 'folder' || !uri) { setVersions([]); return; }
      setVersions(await listFolderVersions(uri));
    } catch (error) {
      setVersions([]);
      setHistoryError(error instanceof InvalidBackupError ? 'عُثر على ملفات نسخ، لكن لا توجد نسخة سليمة قابلة للاستعادة. جرّب ملفاً محفوظاً في مكان آخر.'
        : 'تعذّرت قراءة سجل النسخ. اختر المجلد مرة أخرى ثم أعد المحاولة.');
    } finally { finish(); }
  }, [begin, finish]);

  const exportPortable = useCallback(async (format: PortableExport, password?: string): Promise<boolean> => {
    if (!ready || !begin('save')) return false;
    try {
      const text = serialize(latest.current);
      if (format === 'encrypted') {
        await exportArtifact({ name: 'iou-protected.html', mime: 'text/html', text: await encryptBackup(text, password ?? '') });
      } else if (format === 'json') {
        await exportToFile(text);
      } else {
        const files = readableFiles(text);
        const file = format === 'report' ? files[0] : files.find(file => file.name === `iou-${format}.csv`)!;
        await exportArtifact(file);
      }
      onToast(Platform.OS === 'web' ? 'بدأ تنزيل الملف. تأكد من حفظه' : 'اختر مكان حفظ الملف من خيارات المشاركة');
      return true;
    } catch (error) {
      reportError(error, 'file');
      return false;
    } finally { finish(); }
  }, [ready, begin, finish, onToast, reportError]);

  const chooseFolder = useCallback(async (): Promise<boolean> => {
    if (!begin('setup')) return false;
    try {
      const uri = await pickFolder();
      if (!uri) return false;
      setFolderOk(true);
      onPatch({ backupTarget: 'folder', backupFolderUri: uri, lastBackup: null });
      return true;
    } catch (error) {
      reportError(error, 'folder');
      return false;
    } finally {
      finish();
    }
  }, [begin, finish, onPatch, reportError]);

  const selectTarget = useCallback(async (next: BackupTarget) => {
    if (next === target) return;
    if (next === 'folder') { await chooseFolder(); return; }
    if (!begin('setup')) return;
    try {
      if (next === 'drive' && driveConfigured && !(await withDrive(async () => true))) return;
      if (target === 'drive' && next !== 'drive') {
        await signOut();
        setDriveConnected(false);
      }
      onPatch({ backupTarget: next, lastBackup: null, ...(next === 'none' ? { backupFolderUri: null } : {}) });
    } catch (error) {
      reportError(error, next);
    } finally {
      finish();
    }
  }, [target, chooseFolder, begin, finish, driveConfigured, withDrive, onPatch, reportError]);

  useEffect(() => {
    clearTimer();
    if (!ready || suspendAutomatic) return;
    // Initial load and changing destination establish a baseline, never upload.
    if (!baseline.current || baseline.current.destination !== destination) {
      baseline.current = { destination, fingerprint };
      return;
    }
    if (!state.autoBackup || !supportsAuto || requiresFirstBackup) {
      baseline.current = { destination, fingerprint };
      return;
    }
    if (operation || errorStatus || fingerprint === baseline.current.fingerprint) return;
    if (target === 'folder' && (!backupFolderUri || !folderOk)) return;
    if (target === 'drive' && !driveConnected) return;
    autoTimer.current = setTimeout(() => { void runBackup(true); }, 5000);
    return clearTimer;
  }, [ready, suspendAutomatic, destination, fingerprint, state.autoBackup, supportsAuto, requiresFirstBackup,
    operation, errorStatus, target, backupFolderUri, folderOk, driveConnected, runBackup, clearTimer]);

  const automaticPaused = suspendAutomatic && state.autoBackup && supportsAuto;
  const healthy = !errorStatus && !requiresFirstBackup && !automaticPaused &&
    (target !== 'folder' || (folderOk && !!backupFolderUri)) && (target !== 'drive' || driveConnected);
  let status: string;
  if (operation) status = operation === 'restore' ? 'جارٍ الاستعادة…' : operation === 'setup' ? 'جارٍ الإعداد…' : 'جارٍ الحفظ…';
  else if (errorStatus) status = errorStatus;
  else if (target === 'none') status = 'اضغط للإعداد';
  else if (target === 'file') status = 'تصدير واستيراد يدوي';
  else if (manualDrive) status = Platform.OS === 'web' ? 'نسخ يدوي · ارفع الملف إلى Drive' : 'نسخ يدوي · اختر Drive عند المشاركة';
  else if (target === 'folder' && (!folderOk || !backupFolderUri)) status = 'اختر المجلد مرة أخرى للمتابعة';
  else if (target === 'drive' && !driveConnected) status = 'غير متصل';
  else if (automaticPaused) status = 'التلقائي متوقف: راجع النسخة المحلية المسترجعة';
  else if (requiresFirstBackup) status = 'احفظ أول نسخة أو استعد نسخة موجودة';
  else status = 'آخر نسخة: ' + new Date(state.lastBackup!).toLocaleString('ar-SA', {
    calendar: 'gregory', numberingSystem: 'latn', year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  const view: BackupView = {
    target, title: manualDrive ? 'Google Drive (يدوي)' : TARGET_LABELS[target], status,
    dot: operation ? 'busy' : errorStatus ? 'warn' : target === 'none' || target === 'file' || manualDrive ? 'off' : healthy ? 'ok' : 'warn',
    working: operation !== null, supportsAuto, requiresFirstBackup,
    primaryLabel: manualDrive ? Platform.OS === 'web' ? 'تنزيل نسخة لـ Drive' : 'مشاركة إلى Drive' : target === 'file' ? 'تصدير' : 'نسخ الآن',
    secondaryLabel: manualDrive ? 'استعادة ملف' : target === 'file' ? 'استيراد' : 'استعادة',
    driveConfigured, folderSupported, folderLabel: folderLabel(backupFolderUri),
  };

  const backupNow = useCallback(() => runBackup(false), [runBackup]);
  const restore = useCallback(() => restoreFrom(latest.current.backupTarget), [restoreFrom]);
  const restoreFile = useCallback(() => restoreFrom('file'), [restoreFrom]);
  const restoreVersion = useCallback((id: string) => restoreFrom('folder', id), [restoreFrom]);
  return { backup: view, backupNow, restore, restoreFile, chooseFolder, selectTarget,
    versions, historyError, refreshVersions, restoreVersion, exportPortable, passwordRequest, submitPassword, cancelPassword };
}
