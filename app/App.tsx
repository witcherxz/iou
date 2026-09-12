// Weight-specific subpaths: importing the package root would bundle all seven
// faces (~1.6 MB) instead of the four the design actually uses.
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, AppState, BackHandler, I18nManager, ScrollView, useColorScheme, useWindowDimensions, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav, Tab } from './src/components/BottomNav';
import { Fab, Snackbar } from './src/components/Overlays';
import { fmt, todayISO } from './src/format';
import { PrimaryButton, OutlineButton, T } from './src/components/ui';
import { confirmAction } from './src/confirm';
import { ConfirmationDialog } from './src/components/ConfirmationDialog';
import { exportToFile } from './src/backup/fileShare';
import { portableData, serialize } from './src/backup/types';
import { BackupPasswordDialog } from './src/backup/BackupPasswordDialog';
import { BackupTools } from './src/screens/BackupTools';
import { EntryEditor } from './src/screens/EntryEditor';
import { LocalRecovery } from './src/screens/LocalRecovery';
import { PrivacyProvider, usePrivacy } from './src/privacy/PrivacyProvider';
import { PrivacyGate } from './src/privacy/PrivacyGate';
import { PrivacySettings } from './src/privacy/PrivacySettings';
import { PersistedState } from './src/types';
import { ensurePermission, ReminderStatus, syncReminders } from './src/reminders';
import { allDebts, peopleView } from './src/selectors';
import { AddDebt } from './src/screens/AddDebt';
import { DebtDetail } from './src/screens/DebtDetail';
import { DebtList, StatusFilter } from './src/screens/DebtList';
import { Home } from './src/screens/Home';
import { Onboarding } from './src/screens/Onboarding';
import { PersonDetail } from './src/screens/PersonDetail';
import { Reminders } from './src/screens/Reminders';
import { Settings } from './src/screens/Settings';
import { BackupSetup } from './src/screens/BackupSetup';
import { Settle } from './src/screens/Settle';
import { StoreProvider, useStore } from './src/store/store';
import { makeColors, M3 } from './src/theme';
import { useBackup } from './src/useBackup';

// The whole UI is Arabic. Rather than forcing a global RTL flip (which needs an
// app restart to take effect) the root view declares its own direction.
I18nManager.allowRTL(false);

type Screen = 'main' | 'person' | 'debt' | 'add' | 'settle' | 'backup' | 'entry' | 'privacy' | 'backupTools' | 'localRecovery';

export default function App() {
  return (
    <SafeAreaProvider>
      <PrivacyProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
      </PrivacyProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { state, ready, storageError, recoveryNotice, retryLoad, toast, showToast, set, replaceAll, addPerson, addDebt, settle, markPaid, toggleReminder,
    updateEntry, cancelEntry, reinstateEntry, revertEntryEdit, listRecoverySnapshots } =
    useStore();
  const privacy = usePrivacy();

  const [fontsLoaded, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
    MaterialSymbolsRounded: require('./assets/fonts/MaterialSymbolsRounded.ttf'),
    MaterialSymbolsRoundedSelected: require('./assets/fonts/MaterialSymbolsRoundedSelected.ttf'),
  });

  const { width } = useWindowDimensions();
  const wide = width >= M3.layout.railBreakpoint;
  const [navHeight, setNavHeight] = useState(80);
  const systemScheme = useColorScheme();
  const dark = state.dark ?? systemScheme === 'dark';
  const c = useMemo(() => makeColors(dark, state.accent), [dark, state.accent]);

  const [screen, setScreen] = useState<Screen>('main');
  const [tab, setTab] = useState<Tab>('home');
  const [personId, setPersonId] = useState<string | null>(null);
  const [debtId, setDebtId] = useState<string | null>(null);
  const [entryId, setEntryId] = useState<string | null>(null);
  const [cameFrom, setCameFrom] = useState<Screen>('main');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [addDir, setAddDir] = useState<'me' | 'owe'>('me');
  const [addPersonId, setAddPersonId] = useState<string | null>(null);
  const [settleDebtId, setSettleDebtId] = useState<string | null>(null);
  const [settleMode, setSettleMode] = useState<'full' | 'partial'>('full');
  const [settleSeed, setSettleSeed] = useState('');
  const [settleFrom, setSettleFrom] = useState<'person' | 'debt'>('person');
  const [today, setToday] = useState(todayISO);
  const [recovering, setRecovering] = useState(false);
  const [notificationStatus, setNotificationStatus] = useState<ReminderStatus | 'checking'>('checking');
  const [foregroundRevision, setForegroundRevision] = useState(0);

  useEffect(() => {
    const refresh = () => setToday(todayISO());
    const timer = setInterval(refresh, 60_000);
    const sub = AppState.addEventListener('change', status => {
      if (status === 'active') { refresh(); setForegroundRevision(value => value + 1); }
    });
    return () => { clearInterval(timer); sub.remove(); };
  }, []);
  // Remounts the settle screen so its local "done" state resets between visits.
  const [settleKey, setSettleKey] = useState(0);

  const people = useMemo(() => peopleView(state.people, state.tx, c, dark), [state.people, state.tx, c, dark]);
  const debts = useMemo(() => allDebts(state.tx, people, c), [state.tx, people, c, today]);

  const person = people.find(p => p.id === personId) ?? null;
  const debt = debts.find(d => d.id === debtId) ?? null;
  const entry = state.tx.find(t => t.id === entryId) ?? null;

  const handleRestored = useCallback(async (next: PersistedState) => {
    const applied = privacy.enabled ? { ...next, reminderSettings: { ...next.reminderSettings, privateNotifications: true } } : next;
    await replaceAll(applied);
    setScreen('main');
    setTab('home');
    setPersonId(null);
    setDebtId(null);
    setEntryId(null);
    return applied;
  }, [replaceAll, privacy.enabled]);

  const { backup, backupNow, restore, restoreFile, chooseFolder, selectTarget,
    versions, historyError, refreshVersions, restoreVersion, exportPortable,
    passwordRequest, submitPassword, cancelPassword } = useBackup({
    state,
    ready: ready && !storageError,
    suspendAutomatic: !!recoveryNotice,
    onRestored: handleRestored,
    onToast: showToast,
    onPatch: set,
  });

  // Keep the OS notification schedule in step with the ledger.
  useEffect(() => {
    if (!ready || storageError || !state.onboarded) return;
    let active = true;
    setNotificationStatus('checking');
    syncReminders(debts, state.reminderPrefs, state.weekly, state.reminderSettings).then(status => { if (active) setNotificationStatus(status); });
    return () => { active = false; };
  }, [ready, storageError, state.onboarded, debts, state.reminderPrefs, state.weekly, state.reminderSettings, foregroundRevision]);

  const goHome = useCallback(() => {
    setScreen('main');
    setTab('home');
  }, []);

  const back = useCallback((): boolean => {
    if (!privacy.unlocked) return false;
    if (screen === 'entry') { setScreen('person'); return true; }
    if (screen === 'localRecovery') { setScreen('backupTools'); return true; }
    if (screen === 'debt') {
      setScreen(cameFrom === 'person' ? 'person' : 'main');
      return true;
    }
    if (screen === 'person' || screen === 'add') {
      setScreen(screen === 'add' && personId && addPersonId ? 'person' : 'main');
      return true;
    }
    if (screen === 'settle') {
      setScreen(settleFrom);
      return true;
    }
    if (screen === 'backup' || screen === 'backupTools' || screen === 'privacy') {
      setScreen('main');
      return true;
    }
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    return false; // let Android close the app
  }, [screen, tab, cameFrom, personId, addPersonId, settleFrom, privacy.unlocked]);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', back);
    return () => sub.remove();
  }, [back]);

  const openDebt = useCallback(
    (id: string) => {
      setDebtId(id);
      setCameFrom(screen);
      setScreen('debt');
    },
    [screen],
  );

  const openAdd = useCallback(
    (forPersonId: string | null, dir: 'me' | 'owe') => {
      setAddPersonId(forPersonId);
      setAddDir(dir);
      setScreen('add');
    },
    [],
  );

  const openEntry = useCallback((id: string) => {
    const selected = state.tx.find(t => t.id === id);
    if (!selected) return;
    setPersonId(selected.personId);
    setEntryId(id);
    setScreen('entry');
  }, [state.tx]);

  const openSettle = useCallback((forDebtId: string | null, mode: 'full' | 'partial', seed = '') => {
    setSettleFrom(screen === 'debt' ? 'debt' : 'person');
    setSettleDebtId(forDebtId);
    setSettleMode(mode);
    setSettleSeed(seed);
    setSettleKey(k => k + 1);
    setScreen('settle');
  }, [screen]);

  if (!ready || (!fontsLoaded && !fontError)) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const showNav = screen === 'main';
  const showFab = screen === 'main' && (tab === 'home' || tab === 'iou' || tab === 'uome');
  const rail = wide && state.onboarded && !storageError && showNav;
  const toastBottom = !state.onboarded || storageError || screen !== 'main' ? 16
    : showFab ? (wide ? 96 : navHeight + 88) : (wide ? 16 : navHeight + 16);

  return (
    <PrivacyGate c={c}>
    <SafeAreaView style={{ flex: 1, backgroundColor: wide || screen !== 'main' ? c.surface : c.surfaceContainer }} edges={['top', 'bottom']}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, direction: 'rtl', backgroundColor: c.bg }}>
        {recoveryNotice && !storageError && (
          <View style={{ backgroundColor: c.warnBg, paddingHorizontal: 20, paddingVertical: 12 }}>
            <T accessibilityRole="alert" style={{ color: c.warnFg, fontSize: 13, lineHeight: 22 }}>{recoveryNotice}</T>
          </View>
        )}
        <View style={{ flex: 1, flexDirection: 'row' }}>
          {rail && <BottomNav c={c} tab={tab} onTab={setTab} rail />}
          <View style={{ flex: 1, minWidth: 0, maxWidth: wide ? (screen === 'main' && tab === 'home' ? M3.layout.maxContentWidth : 720) : undefined, marginHorizontal: 'auto' }}>
        {storageError ? (
          <ScrollView contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', padding: 24, gap: 18 }}>
            <T accessibilityRole="header" style={{ fontSize: 24, fontWeight: '700', color: c.text }}>تعذّر حفظ الدفتر أو فتحه</T>
            <T accessibilityRole="alert" style={{ fontSize: 15, lineHeight: 26, color: c.red }}>{storageError}</T>
            <T style={{ fontSize: 14, lineHeight: 24, color: c.muted }}>
              أوقفنا التعديلات لحماية بياناتك. يمكنك إعادة المحاولة أو استعادة نسخة من ملف.
            </T>
            <PrimaryButton c={c} label="إعادة المحاولة" loading={recovering} disabled={backup.working} onPress={async () => {
              setRecovering(true);
              try { await retryLoad(); } finally { setRecovering(false); }
            }} />
            <View><OutlineButton c={c} label="استيراد نسخة من ملف" disabled={recovering || backup.working} onPress={restoreFile} /></View>
            {state.tx.length > 0 && <View><OutlineButton c={c} label="تصدير البيانات المفتوحة" disabled={recovering || backup.working} onPress={async () => {
              setRecovering(true);
              try { await exportToFile(serialize(state)); showToast('تم فتح تصدير الملف'); }
              catch { showToast('تعذّر تصدير الملف'); }
              finally { setRecovering(false); }
            }} /></View>}
          </ScrollView>
        ) : !state.onboarded ? (
          <Onboarding c={c} onDone={() => set({ onboarded: true })} />
        ) : (
          <>
            {screen === 'main' && (
              <View style={{ flex: 1 }}>
                <View style={{ flex: 1 }}>
                  {tab === 'home' && (
                    <Home
                      c={c}
                      dark={dark}
                      people={people}
                      debts={debts}
                      onToggleDark={() => set({ dark: !dark })}
                      onOpenPerson={id => { setPersonId(id); setScreen('person'); }}
                      onOpenDebt={openDebt}
                      onGoIou={() => { setTab('iou'); setStatusFilter('open'); }}
                      onGoUome={() => { setTab('uome'); setStatusFilter('open'); }}
                    />
                  )}
                  {(tab === 'iou' || tab === 'uome') && (
                    <DebtList
                      c={c}
                      debts={debts}
                      dir={tab === 'iou' ? 'me' : 'owe'}
                      status={statusFilter}
                      onStatus={setStatusFilter}
                      onOpenDebt={openDebt}
                    />
                  )}
                  {tab === 'reminders' && (
                    <Reminders
                      c={c}
                      debts={debts}
                      prefs={state.reminderPrefs}
                      weekly={state.weekly}
                      settings={state.reminderSettings}
                      onChangeSettings={reminderSettings => set({ reminderSettings })}
                      notificationStatus={notificationStatus}
                      onEnable={async () => {
                        setNotificationStatus('checking');
                        const granted = await ensurePermission();
                        setNotificationStatus(await syncReminders(debts, state.reminderPrefs, state.weekly, state.reminderSettings));
                        if (!granted) showToast('يمكنك السماح بالإشعارات من إعدادات التطبيق على جهازك');
                      }}
                      onToggle={toggleReminder}
                      onToggleWeekly={() => set({ weekly: !state.weekly })}
                    />
                  )}
                  {tab === 'settings' && (
                    <Settings
                      c={c}
                      profileName={state.profileName}
                      onRename={name => set({ profileName: name })}
                      backup={backup}
                      autoBackup={state.autoBackup}
                      onToggleAuto={() => set({ autoBackup: !state.autoBackup })}
                      themeMode={state.dark === null ? 'system' : state.dark ? 'dark' : 'light'}
                      onThemeMode={mode => set({ dark: mode === 'system' ? null : mode === 'dark' })}
                      onBackupNow={backupNow}
                      onRestore={restore}
                      onImportFile={restoreFile}
                      onOpenBackupSetup={() => setScreen('backup')}
                      onOpenBackupTools={() => setScreen('backupTools')}
                      onOpenPrivacy={() => setScreen('privacy')}
                      privacyEnabled={privacy.enabled}
                    />
                  )}
                </View>
                {showFab && <Fab c={c} bottom={wide ? 24 : navHeight + 16} onPress={() => openAdd(null, tab === 'uome' ? 'owe' : 'me')} />}
                {showNav && !wide && <View onLayout={event => setNavHeight(event.nativeEvent.layout.height)}><BottomNav c={c} tab={tab} onTab={setTab} /></View>}
              </View>
            )}

            {screen === 'person' && person && (
              <PersonDetail
                c={c}
                person={person}
                tx={state.tx}
                debts={debts}
                onBack={goHome}
                onSettle={() => openSettle(null, 'full')}
                onAdd={() => openAdd(person.id, 'me')}
                onOpenDebt={openDebt}
                onOpenEntry={openEntry}
              />
            )}

            {screen === 'debt' && debt && (
              <DebtDetail
                c={c}
                debt={debt}
                payments={state.tx.filter(t => t.debtId === debt.id)}
                onEdit={() => openEntry(debt.id)}
                onOpenEntry={openEntry}
                onBack={() => setScreen(cameFrom === 'person' ? 'person' : 'main')}
                onPay={() => { setPersonId(debt.personId); openSettle(debt.id, 'partial'); }}
                onMarkPaid={async () => {
                  if (await confirmAction('تسجيل السداد الكامل', `سيتم تسجيل دفعة بقيمة ${debt.remainingLabel} ر.س لتسديد هذا الدين.`, 'تسجيل السداد')) {
                    if (markPaid(debt.id)) showToast('تم تسجيل السداد الكامل');
                  }
                }}
                onPayInstallment={amount => {
                  setPersonId(debt.personId);
                  openSettle(debt.id, 'partial', String(amount));
                }}
              />
            )}

            {screen === 'add' && (
              <AddDebt
                c={c}
                people={state.people}
                initialDir={addDir}
                initialPersonId={addPersonId}
                onClose={() => setScreen(personId && addPersonId ? 'person' : 'main')}
                onAddPerson={addPerson}
                onSave={input => {
                  if (!addDebt(input)) return false;
                  const name = state.people.find(p => p.id === input.personId)?.name ?? '';
                  showToast(
                    input.installmentCount
                      ? `تم تسجيل ${fmt(input.amount)} ر.س مع ${name} على ${fmt(input.installmentCount, 0)} دفعات`
                      : `تم تسجيل ${fmt(input.amount)} ر.س مع ${name}`,
                  );
                  goHome();
                  return true;
                }}
              />
            )}

            {screen === 'backup' && (
              <BackupSetup
                c={c}
                backup={backup}
                onBack={() => setScreen('main')}
                onSelect={selectTarget}
                onChooseFolder={chooseFolder}
              />
            )}

            {screen === 'backupTools' && <BackupTools c={c} backup={backup} versions={versions} historyError={historyError}
              onBack={() => setScreen('main')} onRefresh={refreshVersions} onRestoreVersion={restoreVersion}
              onRestoreFile={restoreFile} onExport={exportPortable} onOpenLocalHistory={() => setScreen('localRecovery')} />}

            {screen === 'localRecovery' && <LocalRecovery c={c} onBack={() => setScreen('backupTools')}
              onList={listRecoverySnapshots} onRestore={async snapshot => {
                await handleRestored({ ...state, ...portableData(snapshot), onboarded: true, lastBackup: null });
                showToast('تمت استعادة النسخة المحلية. راجع الدفتر قبل حفظ نسخة خارجية جديدة.');
              }} />}

            {screen === 'privacy' && <PrivacySettings c={c} onBack={() => setScreen('main')}
              onEnabled={() => set({ reminderSettings: { ...state.reminderSettings, privateNotifications: true } })} />}

            {screen === 'entry' && entry && <EntryEditor key={entry.id} c={c} entry={entry} people={state.people}
              transactions={state.tx} changes={state.changes} onBack={() => setScreen('person')}
              onSave={patch => {
                const saved = updateEntry(entry.id, patch);
                if (saved) { setPersonId(patch.personId ?? entry.personId); showToast('تم حفظ التعديل في السجل'); }
                return saved;
              }}
              onVoid={() => { const saved = cancelEntry(entry.id); if (saved) showToast('أُلغيت العملية ويمكن إعادتها من السجل'); return saved; }}
              onRestore={() => { const saved = reinstateEntry(entry.id); if (saved) showToast('أُعيدت العملية إلى الأرصدة'); return saved; }}
              onUndoEdit={() => {
                const previous = state.changes.filter(change => change.txId === entry.id).at(-1)?.before;
                const saved = revertEntryEdit(entry.id);
                if (saved) { setPersonId(previous?.personId ?? entry.personId); showToast('تم التراجع عن آخر تعديل'); }
                return saved;
              }} />}

            {screen === 'settle' && person && (
              <Settle
                key={settleKey}
                c={c}
                person={person}
                debts={debts}
                targetDebt={settleDebtId ? debts.find(d => d.id === settleDebtId) ?? null : null}
                initialMode={settleMode}
                initialAmount={settleSeed}
                onBack={() => setScreen(settleFrom)}
                onConfirm={(amount, dir, date, note) => settle(person.id, amount, settleDebtId, dir, date, note)}
                onHome={goHome}
              />
            )}
          </>
        )}

        {toast && <Snackbar c={c} message={toast} bottom={toastBottom} />}
          </View>
        </View>
        <ConfirmationDialog c={c} />
        <BackupPasswordDialog c={c} request={passwordRequest} onSubmit={submitPassword} onCancel={cancelPassword} />
      </View>
    </SafeAreaView>
    </PrivacyGate>
  );
}
