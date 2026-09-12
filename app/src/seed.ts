import { addDays, todayISO } from './format';
import { PersistedState, Person, Tx } from './types';
import { DEFAULT_ACCENT } from './theme';

// The prototype pinned "today" to ٤ سبتمبر and stored day offsets. Here the same
// ledger is anchored to the real current date so the due labels stay truthful.

const PEOPLE: Person[] = [
  { id: 'p1', name: 'سارة', hue: 150 },
  { id: 'p2', name: 'فهد', hue: 30 },
  { id: 'p3', name: 'خالد', hue: 260 },
  { id: 'p4', name: 'نورة', hue: 340 },
  { id: 'p5', name: 'محمد', hue: 200 },
];

export function seedState(): PersistedState {
  const t = todayISO();
  const d = (offset: number) => addDays(t, offset);

  const tx: Tx[] = [
    { id: 't1', personId: 'p1', dir: 'me', amount: 120, note: 'غداء', createdAt: d(-2), dueAt: d(3) },
    { id: 't2', personId: 'p1', dir: 'me', amount: 60, note: 'قهوة ومواصلات', createdAt: d(-7), dueAt: d(0) },
    { id: 't3', personId: 'p1', dir: 'settle', amount: 40, debtId: 't2', createdAt: d(-5) },
    { id: 't4', personId: 'p2', dir: 'owe', amount: 450, note: 'سلفة', createdAt: d(-3), dueAt: d(27) },
    { id: 't5', personId: 'p3', dir: 'me', amount: 80, note: 'تذاكر', createdAt: d(-10), dueAt: d(-3) },
    { id: 't6', personId: 'p4', dir: 'owe', amount: 35, note: 'توصيل', createdAt: d(-5), dueAt: d(2) },
    { id: 't7', personId: 'p5', dir: 'me', amount: 200, note: 'حصة الإيجار', createdAt: d(-6), dueAt: d(-1) },
    { id: 't8', personId: 'p5', dir: 'settle', amount: 200, debtId: 't7', createdAt: d(-1) },
    {
      id: 't9', personId: 'p2', dir: 'me', amount: 3000, note: 'سلفة سيارة',
      createdAt: d(-20), dueAt: d(5), freq: 'month',
      installments: [
        { amount: 1000, label: 'دفعة ١', dueAt: d(-20) },
        { amount: 1000, label: 'دفعة ٢', dueAt: d(5) },
        { amount: 1000, label: 'دفعة ٣', dueAt: d(35) },
      ],
    },
    { id: 't10', personId: 'p2', dir: 'settle', amount: 1000, debtId: 't9', createdAt: d(-19) },
  ];

  return {
    version: 1,
    onboarded: false,
    profileName: 'عبدالله',
    people: PEOPLE,
    tx,
    // Matches the design: سارة and فهد on, خالد off.
    reminderPrefs: { t1: true, t4: true, t5: false },
    weekly: true,
    autoBackup: true,
    backupTarget: 'none',
    backupFolderUri: null,
    dark: null,
    accent: DEFAULT_ACCENT,
    lastBackup: null,
  };
}

export function emptyState(): PersistedState {
  return {
    version: 1,
    onboarded: false,
    profileName: 'دفتري',
    people: [],
    tx: [],
    reminderPrefs: {},
    weekly: true,
    autoBackup: true,
    backupTarget: 'none',
    backupFolderUri: null,
    dark: null,
    accent: DEFAULT_ACCENT,
    lastBackup: null,
  };
}
