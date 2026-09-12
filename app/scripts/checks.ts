const { isDeepStrictEqual } = require('node:util');
import { fmt, arDate, daysUntil, addDays, addMonths, todayISO, dueLabelFor, localDate, isCalendarDate } from '../src/format';
import { makeColors, avatarColors } from '../src/theme';
import { peopleView, allDebts, remaining, balance } from '../src/selectors';
import { emptyState } from '../src/initialState';
import { seedState } from './fixtures/ledger';
import { applyKey, normalizeAmountInput, isValidAmountInput } from '../src/components/Keypad';

import { createDebt, createSettlements } from '../src/ledger';
import { isMoneyAmount, toCents } from '../src/money';
import { validateState } from '../src/validation';
import { planReminders } from '../src/reminderPlan';
import { createWriteQueue, readInitialLedger, readStoredLedger } from '../src/store/persistence';
import { STORAGE_KEY, STORAGE_RECOVERY_KEY } from '../src/config/app';
import { Tx } from '../src/types';

async function main() {
const out: string[] = [];
const eq = (label: string, got: unknown, want: unknown) =>
  out.push(`${got === want ? 'PASS' : 'FAIL'} ${label}: got ${String(got)}${got === want ? '' : ` want ${String(want)}`}`);

eq('fmt 3000', fmt(3000), '3,000');
eq('fmt 120', fmt(120), '120');
eq('fmt 12.5', fmt(12.5), '12.5');
eq('fmt 0', fmt(0), '0');
eq('fmt 1234567.891', fmt(1234567.891), '1,234,567.89');
eq('fmt neg', fmt(-45), '−45');

const t = todayISO();
eq('daysUntil +3', daysUntil(addDays(t, 3)), 3);
eq('daysUntil null', daysUntil(null), Infinity);
eq('dueLabel overdue', dueLabelFor(-3, false), 'متأخر 3 يوم');
eq('dueLabel today', dueLabelFor(0, false), 'يستحق اليوم');
eq('dueLabel paid', dueLabelFor(5, true), 'مكتمل');

eq('keypad seq', ['1','2','.','5','⌫'].reduce(applyKey, ''), '12.');
eq('keypad leading zero', applyKey('0', '5'), '5');
eq('keypad dot first', applyKey('', '.'), '0.');
eq('keypad max whole digits', applyKey('123456789', '0'), '123456789');
eq('keypad cents limit', applyKey('12.34', '5'), '12.34');
eq('Arabic and Persian amount input', normalizeAmountInput('۱۲٫٥٠'), '12.50');
eq('reject fractional halalas', isValidAmountInput('1.234'), false);

const c = makeColors(false);
const s = seedState();
const people = peopleView(s.people, s.tx, c, false);
const debts = allDebts(s.tx, people, c);

// t2 is 60 with a 40 payment -> 20 remaining
eq('remaining t2', remaining(s.tx, s.tx.find(x => x.id === 't2')!), 20);
// sarah: 120 + 20 = 140 owed to me
eq('balance sarah', balance(s.tx, 'p1'), 140);
// t7 fully paid
eq('t7 paid', debts.find(d => d.id === 't7')!.paid, true);
eq('t7 badge', debts.find(d => d.id === 't7')!.badge, 'مسدد');
// t5 overdue
eq('t5 overdue', debts.find(d => d.id === 't5')!.over, true);
// t9 instalments: 1000 paid of 3000 -> first instalment paid, pct 33%
const t9 = debts.find(d => d.id === 't9')!;
eq('t9 rem', t9.rem, 2000);
eq('t9 pct', t9.pct, '33%');
eq('t9 sched paid[0]', t9.schedule![0].paid, true);
eq('t9 sched paid[1]', t9.schedule![1].paid, false);
eq('t9 dueIn from next unpaid', t9.dueIn, 5);
eq('t2 partial badge', debts.find(d => d.id === 't2')!.badge, 'مسدد جزئياً');

// Integrity is checked before ledger data can reach either persistence or restore.
const throws = (label: string, action: () => unknown) => {
  let rejected = false;
  try { action(); } catch { rejected = true; }
  eq(label, rejected, true);
};
eq('test-only ledger fixture validates', validateState(s).tx.length, 10);
eq('empty ledger validates', validateState(emptyState()).tx.length, 0);
eq('legacy backup display timestamp migrates', validateState({ ...s, lastBackup: 'اليوم، ٨:٣٠ م' }).lastBackup, null);
eq('unknown payload fields discarded', 'unexpected' in validateState({ ...s, unexpected: true }), false);
throws('unsupported state version rejected', () => validateState({ ...s, version: 4 }));
throws('missing transaction list rejected', () => validateState({ ...s, tx: undefined }));
throws('empty person name rejected', () => validateState({ ...s, people: [{ ...s.people[0], name: ' ' }] }));
throws('duplicate transaction ids rejected', () => validateState({ ...s, tx: [...s.tx, s.tx[0]] }));
throws('nonfinite amount rejected', () => validateState({ ...s, tx: [{ ...s.tx[0], amount: NaN }] }));
throws('fractional cents rejected', () => validateState({ ...s, tx: [{ ...s.tx[0], amount: 1.005 }] }));
throws('invalid date rejected', () => validateState({ ...s, tx: [{ ...s.tx[0], dueAt: '2026-02-30' }] }));
throws('orphan debt rejected', () => validateState({ ...s, tx: [{ ...s.tx[0], personId: 'missing' }] }));
throws('orphan settlement rejected', () => validateState({ ...s, tx: [{ ...s.tx[2], debtId: 'missing' }] }));
throws('other person settlement rejected', () => validateState({ ...s, tx: s.tx.map(x => x.id === 't3' ? { ...x, personId: 'p2' } : x) }));
throws('overpaid ledger rejected', () => validateState({ ...s, tx: s.tx.map(x => x.id === 't3' ? { ...x, amount: 60.01 } : x) }));
throws('installment remainder mismatch rejected', () => validateState({ ...s, tx: s.tx.map(x => x.id === 't9' ? { ...x, amount: 3000.01 } : x) }));
eq('zero cannot be money input', isMoneyAmount(0), false);
eq('floating addition noise accepted', isMoneyAmount(0.1 + 0.2), true);
eq('negative money rejected', isMoneyAmount(-2), false);
eq('unsafe integer cents rejected', isMoneyAmount(Number.MAX_SAFE_INTEGER), false);

const debtInput = { personId: 'p1', dir: 'me' as const, amount: 100, note: '', dueInDays: null, installmentCount: 3 };
const monthly = createDebt(s, debtInput, 'monthly', '2026-01-31')!;
eq('calendar month clamps February', monthly.installments![0].dueAt, '2026-02-28');
eq('calendar month retains original 31st', monthly.installments![1].dueAt, '2026-03-31');
eq('last installment receives exact remainder', monthly.installments![2].amount, 33.34);
eq('installments sum to original cents', monthly.installments!.reduce((total, x) => total + toCents(x.amount), 0), 10000);
eq('preset sets first installment due date', createDebt(s, { ...debtInput, dueInDays: 7 }, 'preset', '2026-01-31')!.installments![0].dueAt, '2026-02-07');
eq('custom date overrides day preset', createDebt(s, { ...debtInput, dueAt: '2026-03-15', dueInDays: 7 }, 'custom', '2026-01-31')!.dueAt, '2026-03-15');
eq('tiny installment plan rejected', createDebt(s, { ...debtInput, amount: 0.02 }, 'tiny'), null);
eq('noninteger installments rejected', createDebt(s, { ...debtInput, installmentCount: 2.5 }, 'bad'), null);
eq('unknown person debt rejected', createDebt(s, { ...debtInput, personId: 'missing' }, 'bad'), null);
eq('invalid custom calendar date rejected', createDebt(s, { ...debtInput, dueAt: '2026-02-30' }, 'bad'), null);
eq('leap-year February clamp', addMonths('2024-01-31', 1), '2024-02-29');
eq('year rollover', addMonths('2026-12-31', 1), '2027-01-31');
eq('invalid leap date', isCalendarDate('2025-02-29'), false);
const originalTimezone = process.env.TZ;
for (const timezone of ['UTC', 'Asia/Riyadh', 'America/Los_Angeles']) {
  process.env.TZ = timezone;
  eq(`calendar date in ${timezone}`, localDate('2026-01-31').getDate(), 31);
  eq(`monthly schedule in ${timezone}`, addMonths('2026-01-31', 1), '2026-02-28');
}
if (originalTimezone === undefined) delete process.env.TZ;
else process.env.TZ = originalTimezone;

let sequence = 0;
const makeId = () => `payment-${++sequence}`;
const mixed: Tx[] = [
  { id: 'new', personId: 'p1', dir: 'me', amount: 0.2, createdAt: '2026-02-01' },
  { id: 'old', personId: 'p1', dir: 'me', amount: 0.1, createdAt: '2026-01-01' },
  { id: 'opposite', personId: 'p1', dir: 'owe', amount: 0.3, createdAt: '2026-01-01' },
];
eq('both sides remain open at net zero', balance(mixed, 'p1'), 0);
eq('ambiguous person settlement rejected', createSettlements(mixed, 'p1', 0.1, makeId).length, 0);
const paid = createSettlements(mixed, 'p1', 0.3, makeId, null, 'me');
eq('directional settlement allocates two debts', paid.length, 2);
eq('oldest recorded debt paid first', paid[0].debtId, 'old');
eq('cent allocation has no remainder', remaining([...mixed, ...paid], mixed[0]), 0);
eq('opposite direction left untouched', remaining([...mixed, ...paid], mixed[2]), 0.3);
eq('overpayment rejected wholly', createSettlements(mixed, 'p1', 0.31, makeId, null, 'me').length, 0);
eq('cross-person target rejected', createSettlements(mixed, 'p2', 0.1, makeId, 'old').length, 0);
eq('wrong direction target rejected', createSettlements(mixed, 'p1', 0.1, makeId, 'old', 'owe').length, 0);
eq('negative settlement rejected', createSettlements(mixed, 'p1', -1, makeId, 'old').length, 0);
eq('duplicate payment against closed debt rejected', createSettlements([...mixed, ...paid], 'p1', 0.1, makeId, 'old').length, 0);
eq('unrelated settlement cannot reduce debt', remaining([...mixed, { id: 'bad', personId: 'p2', dir: 'settle', amount: 0.1, createdAt: '2026-01-01', debtId: 'old' }], mixed[1]), 0.1);

const scheduleDebt = createDebt(s, { ...debtInput, amount: 3, dueAt: '2027-01-31' }, 'schedule', '2026-01-31')!;
const shortPayment: Tx = { id: 'one-cent-short', personId: 'p1', dir: 'settle', amount: 0.99, debtId: scheduleDebt.id, createdAt: '2026-01-31' };
const scheduleTx = [scheduleDebt, shortPayment];
const scheduleView = allDebts(scheduleTx, peopleView(s.people, scheduleTx, c, false), c)[0];
eq('one cent short installment stays unpaid', scheduleView.schedule![0].paid, false);
eq('partial installment remaining cents shown', scheduleView.schedule![0].remainingAmount, 0.01);
eq('next due date comes from unpaid installment', scheduleView.nextDueAt, '2027-01-31');
const plan = planReminders([scheduleView], {}, Date.parse('2026-01-01'));
eq('all future installments scheduled', plan.length, 3);
eq('partial installment reminder amount', plan[0].amount, 0.01);
eq('reminder is at local 8pm', plan[0].when.getHours(), 20);
eq('disabled reminders omitted', planReminders([scheduleView], { schedule: false }, Date.parse('2026-01-01')).length, 0);
eq('passed reminders omitted', planReminders([scheduleView], {}, Date.parse('2028-01-01')).length, 0);
const fullyPaidTx = [scheduleDebt, { ...shortPayment, amount: 3 }];
const fullyPaid = allDebts(fullyPaidTx, peopleView(s.people, fullyPaidTx, c, false), c)[0];
eq('paid debt has no reminders', planReminders([fullyPaid], {}, Date.parse('2026-01-01')).length, 0);
const afterFirstTx = [scheduleDebt, { ...shortPayment, amount: 1 }];
const afterFirst = allDebts(afterFirstTx, peopleView(s.people, afterFirstTx, c, false), c)[0];
eq('next due advances after installment paid', afterFirst.nextDueAt, '2027-02-28');

// Exercise ordering and failed-read recovery without a native storage dependency.
const values = new Map([[STORAGE_KEY, JSON.stringify(s)]]);
const storage = { getItem: async (key: string) => values.get(key) ?? null };
eq('valid primary read', (await readStoredLedger(storage)).state!.tx.length, 10);
values.set(STORAGE_RECOVERY_KEY, JSON.stringify(emptyState()));
values.set(STORAGE_KEY, '{damaged');
eq('damaged primary falls back to recovery', (await readStoredLedger(storage)).recovered, true);
eq('read preserves original damaged bytes', values.get(STORAGE_KEY), '{damaged');
values.delete(STORAGE_KEY);
eq('missing primary recovers previous copy', (await readStoredLedger(storage)).recovered, true);
values.delete(STORAGE_RECOVERY_KEY);
eq('only a truly new install starts empty', (await readStoredLedger(storage)).state, null);
const initial = await readInitialLedger(storage);
eq('new install is recognized only after empty storage reads', initial.isNew, true);
eq('new install has no people', initial.state.people.length, 0);
eq('new install has no transactions', initial.state.tx.length, 0);
eq('new install has no change history', initial.state.changes.length, 0);
eq('new install has no selected reminders', Object.keys(initial.state.reminderPrefs).length, 0);
eq('new install begins with onboarding', initial.state.onboarded, false);
eq('new install uses neutral notebook title', initial.state.profileName, 'دفتري');
eq('initialization does not write storage', values.size, 0);
initial.state.people.push({ id: 'fresh-person', name: 'اسم يختاره المستخدم', hue: 90 });
eq('new install state is not shared with later initializations', (await readInitialLedger(storage)).state.people.length, 0);
const saved = { ...s, onboarded: true, profileName: 'دفتر المستخدم' };
const savedJSON = JSON.stringify(saved);
values.set(STORAGE_KEY, savedJSON);
const existing = await readInitialLedger(storage);
eq('existing installation is not treated as new', existing.isNew, false);
eq('existing people and transactions are preserved', isDeepStrictEqual(existing.state, validateState(saved)), true);
eq('initialization leaves existing stored bytes untouched', values.get(STORAGE_KEY) === savedJSON, true);
const legacy = { ...saved, version: 1, changes: undefined, reminderSettings: undefined };
values.set(STORAGE_KEY, JSON.stringify(legacy));
const migrated = await readInitialLedger(storage);
eq('existing v1 ledgers migrate without removing people', isDeepStrictEqual(migrated.state.people, saved.people), true);
eq('existing v1 ledgers migrate without removing transactions', isDeepStrictEqual(migrated.state.tx, saved.tx), true);
values.set(STORAGE_KEY, '{damaged');
values.set(STORAGE_RECOVERY_KEY, savedJSON);
const recoveredInitial = await readInitialLedger(storage);
eq('startup recovers existing data instead of using empty defaults', recoveredInitial.recovered && !recoveredInitial.isNew, true);
eq('startup preserves recovered entries', isDeepStrictEqual(recoveredInitial.state.tx, saved.tx), true);
values.clear();
let readFailed = false;
try { await readInitialLedger({ getItem: async () => { throw new Error('unavailable'); } }); } catch { readFailed = true; }
eq('unread storage rejects instead of returning defaults', readFailed, true);
values.set(STORAGE_KEY, '{damaged');
let invalidFailed = false;
try { await readInitialLedger(storage); } catch { invalidFailed = true; }
eq('invalid state without recovery rejects', invalidFailed, true);

const write = createWriteQueue();
const events: string[] = [];
let release!: () => void;
const gate = new Promise<void>(resolve => { release = resolve; });
const firstWrite = write(async () => { events.push('old-start'); await gate; events.push('old-end'); });
const secondWrite = write(async () => { events.push('new'); });
await Promise.resolve();
eq('newer write waits for old write', events.join(','), 'old-start');
release();
await Promise.all([firstWrite, secondWrite]);
eq('older write cannot finish after newer one', events.join(','), 'old-start,old-end,new');
await write(async () => { throw new Error('disk full'); }).catch(() => {});
await write(async () => { events.push('retry'); });
eq('write rejection does not poison retries', events.at(-1), 'retry');

const av = avatarColors(150, false);
out.push(`INFO avatar hue150 light = ${av.bg} / ${av.fg}`);
out.push(`INFO today = ${arDate(t)}`);

console.log(out.join('\n'));
const failed = out.some(l => l.startsWith('FAIL'));
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
if (failed) process.exit(1);

}
void main().catch(error => { console.error(error); process.exit(1); });
