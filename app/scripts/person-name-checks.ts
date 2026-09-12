import { backupFingerprint, parseBackup, serialize } from '../src/backup/types';
import { parseReadableBackup, readableFiles } from '../src/backup/readable';
import { emptyState } from '../src/initialState';
import { editEntry, installmentAllocations, isDebt, reductionAmounts } from '../src/ledger';
import { personNameError, renamePerson } from '../src/people';
import { allDebts, peopleView } from '../src/selectors';
import { makeColors } from '../src/theme';
import { PersistedState } from '../src/types';
import { validateState } from '../src/validation';

let checks = 0;
function check(label: string, condition: boolean) {
  checks++;
  if (!condition) throw new Error(label);
}
function eq(label: string, actual: unknown, expected: unknown) {
  check(label, JSON.stringify(actual) === JSON.stringify(expected));
}
function freeze(value: unknown) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return;
  Object.freeze(value);
  Object.values(value).forEach(freeze);
}

const initial = validateState({ ...emptyState(), onboarded: true,
  people: [{ id: 'p1', name: 'اسم قديم للاختبار', hue: 90 }, { id: 'p2', name: 'Alice', hue: 180 }],
  tx: [
    { id: 'd1', personId: 'p1', dir: 'me', amount: 750, createdAt: '2026-01-01', dueAt: '2026-02-01',
      freq: 'month', installments: [{ amount: 375, label: 'الأول', dueAt: '2026-02-01' }, { amount: 375, label: 'الثاني', dueAt: '2026-03-01' }] },
    { id: 'cash1', personId: 'p1', debtId: 'd1', dir: 'settle', amount: 550, createdAt: '2026-01-02' },
    { id: 'waiver1', personId: 'p1', debtId: 'd1', dir: 'forgive', amount: 100, createdAt: '2026-01-03' },
    { id: 'd2', personId: 'p1', dir: 'owe', amount: 300, createdAt: '2026-01-01', dueAt: null },
    { id: 'cash2', personId: 'p1', debtId: 'd2', dir: 'settle', amount: 50, createdAt: '2026-01-02' },
    { id: 'waiver2', personId: 'p1', debtId: 'd2', dir: 'forgive', amount: 25, createdAt: '2026-01-03' },
    { id: 'cancelled', personId: 'p1', debtId: 'd2', dir: 'forgive', amount: 40, createdAt: '2026-01-03', voidedAt: '2026-01-04' },
    { id: 'other', personId: 'p2', dir: 'me', amount: 55, createdAt: '2026-01-01', dueAt: null },
  ],
  reminderPrefs: { d1: true, d2: false }, autoBackup: true, backupTarget: 'folder',
  backupFolderUri: 'content://synthetic/tree/backup', lastBackup: '2026-01-04T12:00:00.000Z', dark: true,
});
const original = editEntry(initial, 'd1', { note: 'ملاحظة مصححة للاختبار' }, 'change1', '2026-01-05T12:00:00.000Z');
const savedOriginal = JSON.stringify(original);
freeze(original);

for (const raw of ['', '   ', '\n\t']) {
  eq('empty or whitespace-only name explains rejection', personNameError(original.people, 'p1', raw), 'أدخل اسم الشخص.');
  eq('empty or whitespace-only name cannot change the ledger', renamePerson(original, 'p1', raw), null);
}
eq('missing person has a useful error', personNameError(original.people, 'missing', 'اسم جديد'), 'هذا الشخص غير موجود في الدفتر.');
eq('missing person cannot create a new identity', renamePerson(original, 'missing', 'اسم جديد'), null);
eq('101-character name is rejected', personNameError(original.people, 'p1', 'س'.repeat(101)), 'استخدم اسماً من 100 حرف أو أقل.');
eq('100-character trimmed name is allowed', personNameError(original.people, 'p1', `  ${'س'.repeat(100)}  `), null);
eq('100-character boundary is stored without surrounding spaces', renamePerson(original, 'p1', `  ${'س'.repeat(100)}  `)!.people[0].name.length, 100);
for (const raw of ['Alice', ' ALICE ', '\t alice\n']) {
  eq('another name is rejected regardless of case or outer whitespace', personNameError(original.people, 'p1', raw), 'يوجد شخص آخر بهذا الاسم. استخدم اسماً يميّزه.');
  eq('duplicate name never merges records', renamePerson(original, 'p1', raw), null);
}
check('own unchanged name returns original state reference', renamePerson(original, 'p1', original.people[0].name) === original);
check('trimmed unchanged name does not cause a write', renamePerson(original, 'p1', `  ${original.people[0].name}\n`) === original);
eq('changing own capitalization is valid without a duplicate', renamePerson(original, 'p2', 'ALICE')!.people[1].name, 'ALICE');
eq('Arabic duplicate name is rejected', personNameError(original.people, 'p2', original.people[0].name), 'يوجد شخص آخر بهذا الاسم. استخدم اسماً يميّزه.');
const importedDuplicates = validateState({ ...original, people: original.people.map(person => ({ ...person, name: 'اسم مستورد' })) });
check('imported duplicate name remains a no-op for the first person', renamePerson(importedDuplicates, 'p1', 'اسم مستورد') === importedDuplicates);
check('imported duplicate name remains a no-op for the second person', renamePerson(importedDuplicates, 'p2', ' اسم مستورد ') === importedDuplicates);
eq('one imported duplicate can be distinguished without merging', renamePerson(importedDuplicates, 'p2', 'اسم مستورد آخر')!.people.map(person => [person.id, person.name]),
  [['p1', 'اسم مستورد'], ['p2', 'اسم مستورد آخر']]);

const name = 'محمد 123';
const next = renamePerson(original, 'p1', `  ${name}\n`)!;
check('rename creates a new state and people list', next !== original && next.people !== original.people);
eq('only the targeted display name changes', next.people, [{ ...original.people[0], name }, original.people[1]]);
check('unrelated person retains the same object', next.people[1] === original.people[1]);
const unchangedKeys = Object.keys(original).filter(key => key !== 'people') as (keyof PersistedState)[];
check('all other state fields retain the same values and references', unchangedKeys.every(key => next[key] === original[key]));
eq('original ledger was never mutated', JSON.stringify(original), savedOriginal);
eq('renamed ledger passes existing schema validation', validateState(next), next);
eq('linked transactions and exact correction history are unchanged', [next.tx, next.changes], [original.tx, original.changes]);

for (const debt of original.tx.filter(isDebt)) {
  eq(`${debt.id}: payment, forgiveness and remaining amounts stay unchanged`, reductionAmounts(next.tx, debt), reductionAmounts(original.tx, debt));
  eq(`${debt.id}: installment allocations stay unchanged`, installmentAllocations(next.tx, debt), installmentAllocations(original.tx, debt));
}
const c = makeColors(false, original.accent);
const oldPeople = peopleView(original.people, original.tx, c, false);
const newPeople = peopleView(next.people, next.tx, c, false);
const person = newPeople.find(item => item.id === 'p1')!;
eq('person card uses the new name and initial', [person.name, person.initial], [name, 'م']);
eq('people balances and transaction counts remain identical', newPeople.map(item => [item.id, item.iouAmt, item.uomeAmt, item.bal, item.sub]),
  oldPeople.map(item => [item.id, item.iouAmt, item.uomeAmt, item.bal, item.sub]));
eq('both debt directions immediately use the new person name', allDebts(next.tx, newPeople, c).filter(item => item.personId === 'p1').map(item => [item.dir, item.personName]),
  [['me', name], ['owe', name]]);

const files = readableFiles(serialize(next));
for (const file of files) {
  check(`${file.name}: renamed person appears in the readable export`, file.text.includes(name));
  check(`${file.name}: old name is no longer presented`, !file.text.includes(original.people[0].name));
}
const restoredReport = parseReadableBackup(files[0].text);
eq('standalone report recovery preserves the new name and all ledger links', [restoredReport.people, restoredReport.tx, restoredReport.changes], [next.people, next.tx, next.changes]);
eq('previous backup remains independently restorable with its original name', parseBackup(serialize(original)).people[0].name, original.people[0].name);
check('name edit is detected by automatic backup fingerprinting', backupFingerprint(next) !== backupFingerprint(original));
const legacy = { ...emptyState(), version: 1, changes: undefined, reminderSettings: undefined, people: original.people,
  tx: [{ id: 'legacy-debt', personId: 'p1', dir: 'me', amount: 80, createdAt: '2026-01-01', dueAt: null }] };
const migrated = validateState(legacy);
eq('old ledger needs no new schema to rename a person', renamePerson(migrated, 'p1', name)!.version, 3);
eq('old ledger retains its original person ID and debt link', renamePerson(migrated, 'p1', name)!.tx, migrated.tx);
const literalName = '<b>اسم</b>';
const escapedReport = readableFiles(serialize(renamePerson(original, 'p1', literalName)!))[0].text;
check('edited name is displayed as text in standalone HTML', escapedReport.includes('&lt;b&gt;اسم&lt;/b&gt;') && !escapedReport.includes(literalName));

console.log(`${checks} person-name checks passed`);
