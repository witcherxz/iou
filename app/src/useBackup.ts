import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert } from 'react-native';

import { exportToFile, importFromFile, SharingUnavailableError } from './backup/fileShare';
import { folderIsReachable, folderLabel, pickFolder, readFromFolder, writeToFolder } from './backup/folder';
import {
  downloadBackup, hasConnectedAccount, NotConfiguredError, NotSignedInError, signIn, signOut, uploadBackup,
} from './backup/google';
import { AUTOMATIC_TARGETS, InvalidBackupError, parseBackup, serialize, TARGET_LABELS } from './backup/types';
import { isGoogleConfigured } from './config/google';
import { BackupTarget, PersistedState } from './types';

export interface BackupView {
  target: BackupTarget;
  title: string;
  /** Sub-line under the title in the settings card. */
  status: string;
  dot: 'ok' | 'busy' | 'warn' | 'off';
  working: boolean;
  /** Automatic backup only makes sense for targets the app can write unattended. */
  supportsAuto: boolean;
  primaryLabel: string;
  secondaryLabel: string;
  driveConfigured: boolean;
  folderLabel: string;
}

interface Options {
  state: PersistedState;
  ready: boolean;
  onRestored: (state: PersistedState) => void;
  onToast: (message: string) => void;
  onPatch: (patch: Partial<PersistedState>) => void;
}

const timeLabel = () => {
  const d = new Date();
  const h12 = d.getHours() % 12 || 12;
  const mm = String(d.getMinutes()).padStart(2, '0');
  const suffix = d.getHours() < 12 ? 'ص' : 'م';
  const digits = `${h12}:${mm}`.replace(/[0-9]/g, n => '٠١٢٣٤٥٦٧٨٩'[Number(n)]);
  return `اليوم ${digits} ${suffix}`;
};

export function useBackup({ state, ready, onRestored, onToast, onPatch }: Options) {
  const [working, setWorking] = useState(false);
  const [driveConnected, setDriveConnected] = useState(false);
  const [folderOk, setFolderOk] = useState(true);
  const autoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const driveConfigured = isGoogleConfigured();
  const { backupTarget: target, backupFolderUri } = state;

  useEffect(() => {
    if (!driveConfigured) return;
    hasConnectedAccount().then(setDriveConnected).catch(() => setDriveConnected(false));
  }, [driveConfigured]);

  useEffect(() => {
    if (target !== 'folder') return;
    setFolderOk(folderIsReachable(backupFolderUri));
  }, [target, backupFolderUri]);

  /** Ensures a Google session exists, prompting for consent at most once. */
  const withDrive = useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T | undefined> => {
      if (!driveConfigured) {
        Alert.alert('Google Drive غير مهيأ', 'أضف معرّفات OAuth في app.json، أو اختر وجهة أخرى للنسخ الاحتياطي.');
        return undefined;
      }
      try {
        if (!(await hasConnectedAccount())) {
          if (!(await signIn())) return undefined;
          setDriveConnected(true);
        }
        return await fn();
      } catch (err) {
        if (err instanceof NotSignedInError) {
          if (!(await signIn().catch(() => false))) return undefined;
          setDriveConnected(true);
          return fn();
        }
        if (err instanceof NotConfiguredError) {
          Alert.alert('Google Drive غير مهيأ', 'أضف معرّفات OAuth في app.json.');
          return undefined;
        }
        throw err;
      }
    },
    [driveConfigured],
  );

  /** Writes the ledger to the active target. Returns false when nothing happened. */
  const write = useCallback(
    async (payload: string): Promise<boolean> => {
      if (target === 'folder') {
        if (!backupFolderUri) return false;
        await writeToFolder(backupFolderUri, payload);
        return true;
      }
      if (target === 'file') {
        await exportToFile(payload);
        return true;
      }
      if (target === 'drive') {
        return (await withDrive(async () => {
          await uploadBackup(JSON.parse(payload));
          return true;
        })) ?? false;
      }
      return false;
    },
    [target, backupFolderUri, withDrive],
  );

  const read = useCallback(async (): Promise<string | null | undefined> => {
    if (target === 'folder') return backupFolderUri ? readFromFolder(backupFolderUri) : null;
    if (target === 'file') return importFromFile();
    if (target === 'drive') {
      const remote = await withDrive(() => downloadBackup());
      if (remote === undefined) return undefined; // cancelled or not configured
      return remote ? JSON.stringify(remote) : null;
    }
    return undefined;
  }, [target, backupFolderUri, withDrive]);

  const backupNow = useCallback(async () => {
    if (target === 'none') return;
    setWorking(true);
    try {
      const done = await write(serialize(state));
      if (done) {
        // A manual export leaves the app, so there is no confirmed copy to date.
        if (target !== 'file') onPatch({ lastBackup: timeLabel() });
        onToast(target === 'file' ? 'تم تصدير النسخة' : 'تم حفظ النسخة الاحتياطية');
      }
    } catch (err) {
      onToast(
        err instanceof SharingUnavailableError
          ? 'المشاركة غير متاحة على هذا الجهاز'
          : 'تعذّر حفظ النسخة الاحتياطية',
      );
      if (target === 'folder') setFolderOk(false);
    } finally {
      setWorking(false);
    }
  }, [target, state, write, onPatch, onToast]);

  const restore = useCallback(async () => {
    if (target === 'none') return;
    setWorking(true);
    try {
      const text = await read();
      if (text === undefined) return;
      if (text === null) {
        onToast('لا توجد نسخة احتياطية');
        return;
      }
      const backup = parseBackup(text);
      Alert.alert('استعادة النسخة الاحتياطية', 'سيتم استبدال البيانات الحالية بالنسخة المحفوظة.', [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'استعادة',
          style: 'destructive',
          onPress: () => {
            // Keep the destination the user just restored *from*.
            onRestored({
              ...backup,
              backupTarget: target,
              backupFolderUri: state.backupFolderUri,
            });
            onToast('تمت الاستعادة');
          },
        },
      ]);
    } catch (err) {
      onToast(err instanceof InvalidBackupError ? 'الملف ليس نسخة احتياطية صالحة' : 'تعذّرت الاستعادة');
    } finally {
      setWorking(false);
    }
  }, [target, read, onRestored, onToast, state.backupFolderUri]);

  /** Opens the folder picker and switches the target on success. */
  const chooseFolder = useCallback(async (): Promise<boolean> => {
    const uri = await pickFolder();
    if (!uri) return false;
    setFolderOk(true);
    onPatch({ backupTarget: 'folder', backupFolderUri: uri });
    return true;
  }, [onPatch]);

  const selectTarget = useCallback(
    async (next: BackupTarget) => {
      if (next === 'folder') {
        await chooseFolder();
        return;
      }
      if (next === 'drive') {
        if (!driveConfigured) {
          Alert.alert('Google Drive غير مهيأ', 'يحتاج هذا الخيار إلى إعداد من المطور. جرّب "مجلد على الجهاز".');
          return;
        }
        const ok = await withDrive(async () => true);
        if (!ok) return;
      }
      if (target === 'drive' && next !== 'drive') await signOut().catch(() => {});
      onPatch({ backupTarget: next, ...(next === 'none' ? { backupFolderUri: null } : {}) });
    },
    [chooseFolder, driveConfigured, withDrive, target, onPatch],
  );

  // Unattended backup after a burst of edits settles.
  useEffect(() => {
    if (!ready || !state.autoBackup) return;
    if (!AUTOMATIC_TARGETS.includes(target)) return;
    if (target === 'folder' && !backupFolderUri) return;
    if (target === 'drive' && !driveConnected) return;

    if (autoTimer.current) clearTimeout(autoTimer.current);
    autoTimer.current = setTimeout(() => {
      write(serialize(state))
        .then(done => done && onPatch({ lastBackup: timeLabel() }))
        .catch(() => setFolderOk(false));
    }, 5000);
    return () => {
      if (autoTimer.current) clearTimeout(autoTimer.current);
    };
    // Only ledger edits should trigger a re-upload, not the timestamp written back.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.tx, state.people, state.autoBackup, target, backupFolderUri, driveConnected, ready]);

  const view: BackupView = {
    target,
    title: TARGET_LABELS[target],
    status: describe(),
    dot: working ? 'busy' : target === 'none' ? 'off' : healthy() ? 'ok' : 'warn',
    working,
    supportsAuto: AUTOMATIC_TARGETS.includes(target),
    primaryLabel: target === 'file' ? 'تصدير' : 'نسخ الآن',
    secondaryLabel: target === 'file' ? 'استيراد' : 'استعادة',
    driveConfigured,
    folderLabel: folderLabel(backupFolderUri),
  };

  return { backup: view, backupNow, restore, chooseFolder, selectTarget };

  function healthy(): boolean {
    if (target === 'folder') return folderOk && !!backupFolderUri;
    if (target === 'drive') return driveConnected;
    return true;
  }

  function describe(): string {
    if (working) return 'جارٍ الحفظ…';
    if (target === 'none') return 'اضغط للإعداد';
    if (target === 'folder') {
      if (!backupFolderUri) return 'لم يتم اختيار مجلد';
      if (!folderOk) return 'المجلد غير متاح — اختر مجلداً آخر';
      return state.lastBackup ? 'آخر نسخة: ' + state.lastBackup : folderLabel(backupFolderUri);
    }
    if (target === 'file') return 'تصدير واستيراد يدوي';
    if (!driveConnected) return 'غير متصل';
    return state.lastBackup ? 'آخر نسخة: ' + state.lastBackup : 'لم يتم النسخ بعد';
  }
}
