// Weight-specific subpaths: importing the package root would bundle all seven
// faces (~1.6 MB) instead of the four the design actually uses.
import { IBMPlexSansArabic_400Regular } from '@expo-google-fonts/ibm-plex-sans-arabic/400Regular';
import { IBMPlexSansArabic_500Medium } from '@expo-google-fonts/ibm-plex-sans-arabic/500Medium';
import { IBMPlexSansArabic_600SemiBold } from '@expo-google-fonts/ibm-plex-sans-arabic/600SemiBold';
import { IBMPlexSansArabic_700Bold } from '@expo-google-fonts/ibm-plex-sans-arabic/700Bold';
import { useFonts } from 'expo-font';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, BackHandler, I18nManager, useColorScheme, View } from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import { BottomNav, Tab } from './src/components/BottomNav';
import { Fab, Snackbar } from './src/components/Overlays';
import { fmt } from './src/format';
import { syncReminders } from './src/reminders';
import { allDebts, peopleView } from './src/selectors';
import { AddDebt } from './src/screens/AddDebt';
import { DebtDetail } from './src/screens/DebtDetail';
import { DebtList, StatusFilter } from './src/screens/DebtList';
import { Home, PeopleFilter } from './src/screens/Home';
import { Onboarding } from './src/screens/Onboarding';
import { PersonDetail } from './src/screens/PersonDetail';
import { Reminders } from './src/screens/Reminders';
import { Settings } from './src/screens/Settings';
import { BackupSetup } from './src/screens/BackupSetup';
import { Settle } from './src/screens/Settle';
import { StoreProvider, useStore } from './src/store/store';
import { makeColors } from './src/theme';
import { useBackup } from './src/useBackup';

// The whole UI is Arabic. Rather than forcing a global RTL flip (which needs an
// app restart to take effect) the root view declares its own direction.
I18nManager.allowRTL(false);

type Screen = 'main' | 'person' | 'debt' | 'add' | 'settle' | 'backup';

export default function App() {
  return (
    <SafeAreaProvider>
      <StoreProvider>
        <Root />
      </StoreProvider>
    </SafeAreaProvider>
  );
}

function Root() {
  const { state, ready, toast, showToast, set, replaceAll, addPerson, addDebt, settle, markPaid, toggleReminder } =
    useStore();

  const [fontsLoaded] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  const systemScheme = useColorScheme();
  const dark = state.dark ?? systemScheme === 'dark';
  const c = useMemo(() => makeColors(dark, state.accent), [dark, state.accent]);

  const [screen, setScreen] = useState<Screen>('main');
  const [tab, setTab] = useState<Tab>('home');
  const [personId, setPersonId] = useState<string | null>(null);
  const [debtId, setDebtId] = useState<string | null>(null);
  const [cameFrom, setCameFrom] = useState<Screen>('main');
  const [peopleFilter, setPeopleFilter] = useState<PeopleFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('open');
  const [addDir, setAddDir] = useState<'me' | 'owe'>('me');
  const [addPersonId, setAddPersonId] = useState<string | null>(null);
  const [settleDebtId, setSettleDebtId] = useState<string | null>(null);
  const [settleMode, setSettleMode] = useState<'full' | 'partial'>('full');
  const [settleSeed, setSettleSeed] = useState('');
  // Remounts the settle screen so its local "done" state resets between visits.
  const [settleKey, setSettleKey] = useState(0);

  const people = useMemo(() => peopleView(state.people, state.tx, c, dark), [state.people, state.tx, c, dark]);
  const debts = useMemo(() => allDebts(state.tx, people, c), [state.tx, people, c]);

  const person = people.find(p => p.id === personId) ?? people[0] ?? null;
  const debt = debts.find(d => d.id === debtId) ?? null;

  const { backup, backupNow, restore, chooseFolder, selectTarget } = useBackup({
    state,
    ready,
    onRestored: replaceAll,
    onToast: showToast,
    onPatch: set,
  });

  // Keep the OS notification schedule in step with the ledger.
  useEffect(() => {
    if (!ready || !state.onboarded) return;
    syncReminders(debts, state.reminderPrefs, state.weekly);
  }, [ready, state.onboarded, debts, state.reminderPrefs, state.weekly]);

  const goHome = useCallback(() => {
    setScreen('main');
    setTab('home');
  }, []);

  const back = useCallback((): boolean => {
    if (screen === 'debt') {
      setScreen(cameFrom === 'person' ? 'person' : 'main');
      return true;
    }
    if (screen === 'person' || screen === 'add') {
      setScreen(screen === 'add' && personId && addPersonId ? 'person' : 'main');
      return true;
    }
    if (screen === 'settle') {
      setScreen('person');
      return true;
    }
    if (screen === 'backup') {
      setScreen('main');
      return true;
    }
    if (tab !== 'home') {
      setTab('home');
      return true;
    }
    return false; // let Android close the app
  }, [screen, tab, cameFrom, personId, addPersonId]);

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

  const openSettle = useCallback((forDebtId: string | null, mode: 'full' | 'partial', seed = '') => {
    setSettleDebtId(forDebtId);
    setSettleMode(mode);
    setSettleSeed(seed);
    setSettleKey(k => k + 1);
    setScreen('settle');
  }, []);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={c.primary} />
      </View>
    );
  }

  const showNav = screen === 'main';
  const showFab = screen === 'main' && (tab === 'home' || tab === 'iou' || tab === 'uome');

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: screen === 'main' ? c.nav : c.bg }} edges={['top', 'bottom']}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <View style={{ flex: 1, direction: 'rtl', backgroundColor: c.bg }}>
        {!state.onboarded ? (
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
                      filter={peopleFilter}
                      onFilter={setPeopleFilter}
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
                      onToggle={toggleReminder}
                      onToggleWeekly={() => set({ weekly: !state.weekly })}
                    />
                  )}
                  {tab === 'settings' && (
                    <Settings
                      c={c}
                      dark={dark}
                      profileName={state.profileName}
                      onRename={name => set({ profileName: name })}
                      backup={backup}
                      autoBackup={state.autoBackup}
                      onToggleAuto={() => set({ autoBackup: !state.autoBackup })}
                      onToggleDark={() => set({ dark: !dark })}
                      onBackupNow={backupNow}
                      onRestore={restore}
                      onOpenBackupSetup={() => setScreen('backup')}
                    />
                  )}
                </View>
                {showFab && <Fab c={c} onPress={() => openAdd(null, tab === 'uome' ? 'owe' : 'me')} />}
                {showNav && <BottomNav c={c} tab={tab} onTab={setTab} />}
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
              />
            )}

            {screen === 'debt' && debt && (
              <DebtDetail
                c={c}
                debt={debt}
                payments={state.tx.filter(t => t.debtId === debt.id)}
                onBack={() => setScreen(cameFrom === 'person' ? 'person' : 'main')}
                onPay={() => { setPersonId(debt.personId); openSettle(debt.id, 'partial'); }}
                onMarkPaid={() => { markPaid(debt.id); showToast('تم تحديد الدين كمسدد'); }}
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
                  addDebt(input);
                  const name = state.people.find(p => p.id === input.personId)?.name ?? '';
                  showToast(
                    input.installmentCount
                      ? `تم تسجيل ${fmt(input.amount)} ر.س مع ${name} على ${fmt(input.installmentCount, 0)} دفعات`
                      : `تم تسجيل ${fmt(input.amount)} ر.س مع ${name}`,
                  );
                  goHome();
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

            {screen === 'settle' && person && (
              <Settle
                key={settleKey}
                c={c}
                person={person}
                targetDebt={settleDebtId ? debts.find(d => d.id === settleDebtId) ?? null : null}
                initialMode={settleMode}
                initialAmount={settleSeed}
                onBack={() => setScreen('person')}
                onConfirm={amount => settle(person.id, amount, settleDebtId)}
                onHome={goHome}
              />
            )}
          </>
        )}

        {toast && <Snackbar c={c} message={toast} />}
      </View>
    </SafeAreaView>
  );
}
