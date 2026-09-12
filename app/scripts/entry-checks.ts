import { addDays, calendarISO, todayISO } from '../src/format';
import { createDebt, createSettlements, editEntry, remainingCents, restoreEntry, undoEntryEdit, voidEntry } from '../src/ledger';
import { defaultReminderSettings } from '../src/reminderSettings';
import { emptyState } from '../src/initialState';
import { allDebts, balance, peopleView } from '../src/selectors';
import { makeColors } from '../src/theme';
import { PersistedState, Tx } from '../src/types';
import { validateState } from '../src/validation';
import { STORAGE_KEY, STORAGE_RECOVERY_KEY } from '../src/config/app';
import { availableLocalHistory, keepLocalSnapshot, LOCAL_HISTORY_KEY, LOCAL_HISTORY_LIMIT, LOCAL_HISTORY_QUARANTINE_KEY, readLocalHistory } from '../src/store/history';
import { createWriteQueue, readStoredLedger } from '../src/store/persistence';

declare const process: { exit(code: number): never };
let checks = 0, sequence = 0;
const id = () => `test-${++sequence}`;
const at = '2026-09-12T12:00:00.000Z';
function eq(label: string, actual: unknown, expected: unknown) {
  checks++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
}
function rejects(label: string, action: () => unknown) {
  let rejected = false; try { action(); } catch { rejected = true; } eq(label, rejected, true);
}
async function rejectsAsync(label: string, action: () => Promise<unknown>) {
  let rejected = false; try { await action(); } catch { rejected = true; } eq(label, rejected, true);
}
const debt = (patch: Partial<Tx> = {}): Tx => ({ id: 'd1', personId: 'p1', dir: 'me', amount: 100, createdAt: '2026-01-10', dueAt: null, ...patch });
const payment = (patch: Partial<Tx> = {}): Tx => ({ id: 'pay1', personId: 'p1', dir: 'settle', debtId: 'd1', amount: 40, createdAt: '2026-01-12', ...patch });
const state = (tx: Tx[] = [debt()]): PersistedState => validateState({ ...emptyState(), people: [{ id: 'p1', name: 'أحمد', hue: 90 }, { id: 'p2', name: 'سارة', hue: 180 }], tx });
const getTx = (s: PersistedState, txId = 'd1') => s.tx.find(t => t.id === txId)!;
const snapshot = (s: PersistedState, n: number) => ({ id: `snapshot-${n}`, createdAt: `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`, state: s });

async function main() {
  const original = state();
  const legacy = { ...original, version: 1, changes: undefined, reminderSettings: undefined };
  eq('v1 ledger migrates to v2', validateState(legacy).version, 2);
  eq('v1 migration adds empty correction log', validateState(legacy).changes, []);
  eq('v1 migration preserves reminder behavior', validateState(legacy).reminderSettings, defaultReminderSettings());
  rejects('v2 correction history required', () => validateState({ ...original, changes: undefined }));
  rejects('v2 reminder settings required', () => validateState({ ...original, reminderSettings: undefined }));
  rejects('unknown future schema rejected', () => validateState({ ...original, version: 3 }));
  const legacyQuirk = { ...legacy, tx: [debt(), payment({ createdAt: '2026-01-09' })] };
  eq('legacy historical chronology remains importable', validateState(legacyQuirk).tx.length, 2);

  const edited = editEntry(original, 'd1', { amount: 150, note: 'تصحيح', dueAt: '2026-02-10' }, id(), at);
  eq('amount edit changes balance', remainingCents(edited.tx, getTx(edited)), 15000);
  eq('edit does not mutate source', getTx(original), debt());
  eq('edit records exact before snapshot', edited.changes[0].before, getTx(original));
  eq('edit records matching after snapshot', edited.changes[0].after, getTx(edited));
  eq('edit records original action date', edited.changes[0].at, at);
  const undone = undoEntryEdit(edited, 'd1', id(), at);
  eq('undo restores the complete original entry', getTx(undone), getTx(original));
  eq('undo removes newly added optional note', 'note' in getTx(undone), false);
  eq('undo itself stays visible in correction log', undone.changes.length, 2);
  eq('unchanged edit produces no history noise', editEntry(original, 'd1', { amount: 100 }, id(), at), original);

  const installments = editEntry(original, 'd1', { installments: [{ amount: 50, label: '1', dueAt: '2026-02-10' }, { amount: 50, label: '2', dueAt: '2026-03-10' }], freq: 'month', dueAt: '2026-02-10' }, id(), at);
  const noSchedule = undoEntryEdit(installments, 'd1', id(), at);
  eq('undo removes newly added installment schedule', 'installments' in getTx(noSchedule), false);
  eq('undo removes newly added frequency', 'freq' in getTx(noSchedule), false);
  eq('undo restores original due date', getTx(noSchedule).dueAt, null);
  rejects('installment correction must preserve sum', () => editEntry(installments, 'd1', { amount: 99 }, id(), at));
  rejects('installment correction requires increasing dates', () => editEntry(installments, 'd1', { installments: [{ amount: 50, label: '1', dueAt: '2026-03-10' }, { amount: 50, label: '2', dueAt: '2026-02-10' }] }, id(), at));
  for (const amount of [0, -1, 0.001, NaN, Infinity]) rejects(`invalid edited amount ${amount}`, () => editEntry(original, 'd1', { amount }, id(), at));
  rejects('debt cannot become a settlement', () => editEntry(original, 'd1', { dir: 'settle', debtId: 'd2' }, id(), at));
  rejects('entry cannot move to unknown person', () => editEntry(original, 'd1', { personId: 'missing' }, id(), at));
  rejects('new date cannot be invalid', () => editEntry(original, 'd1', { createdAt: '2026-02-30' }, id(), at));
  rejects('new date cannot be future', () => editEntry(original, 'd1', { createdAt: addDays(todayISO(), 1) }, id(), at));
  rejects('explicit date edits use calendar input', () => editEntry(original, 'd1', { createdAt: '2026-01-11T12:00:00.000Z' }, id(), at));
  rejects('new due date cannot precede transaction', () => editEntry(original, 'd1', { dueAt: '2026-01-09' }, id(), at));
  const legacyEarlyDue = state([debt({ dueAt: '2026-01-01' })]);
  eq('unchanged legacy early due date stays editable', getTx(editEntry(legacyEarlyDue, 'd1', { note: 'توضيح' }, id(), at)).dueAt, '2026-01-01');
  const futureDue = state([debt({ dueAt: '2026-01-20' })]);
  rejects('transaction date cannot move after existing due date', () => editEntry(futureDue, 'd1', { createdAt: '2026-01-21' }, id(), at));
  const legacyStamp = state([debt({ createdAt: '2026-01-10T12:00:00.000Z', recordedAt: '2026-01-10T12:01:00.000Z' })]);
  const legacyNote = editEntry(legacyStamp, 'd1', { note: 'ملاحظة فقط' }, id(), at);
  eq('note edit works with a legacy timestamp date', getTx(legacyNote).createdAt, '2026-01-10T12:00:00.000Z');
  const dated = editEntry(legacyStamp, 'd1', { createdAt: '2026-01-09' }, id(), at);
  const datedUndo = undoEntryEdit(dated, 'd1', id(), at);
  eq('undo restores exact legacy timestamp', getTx(datedUndo).createdAt, getTx(legacyStamp).createdAt);
  eq('editing date preserves original recording timestamp', getTx(dated).recordedAt, getTx(legacyStamp).recordedAt);

  const paid = state([debt(), payment()]);
  rejects('debt cannot shrink below active payments', () => editEntry(paid, 'd1', { amount: 39.99 }, id(), at));
  rejects('active payment prevents person change', () => editEntry(paid, 'd1', { personId: 'p2' }, id(), at));
  rejects('active payment prevents direction change', () => editEntry(paid, 'd1', { dir: 'owe' }, id(), at));
  rejects('debt date cannot move after active payment', () => editEntry(paid, 'd1', { createdAt: '2026-01-13' }, id(), at));
  rejects('payment date cannot move before debt', () => editEntry(paid, 'pay1', { createdAt: '2026-01-09' }, id(), at));
  rejects('payment edit cannot overpay debt', () => editEntry(paid, 'pay1', { amount: 100.01 }, id(), at));
  rejects('payment cannot become a debt', () => editEntry(paid, 'pay1', { dir: 'me', debtId: undefined }, id(), at));
  const fullPayment = editEntry(paid, 'pay1', { amount: 100, note: 'وصل' }, id(), at);
  eq('edited payment recalculates exact remaining balance', remainingCents(fullPayment.tx, getTx(fullPayment)), 0);
  const smaller = undoEntryEdit(fullPayment, 'pay1', id(), at);
  eq('undo payment returns original remaining balance', remainingCents(smaller.tx, getTx(smaller)), 6000);
  eq('undo payment deletes its new note', 'note' in getTx(smaller, 'pay1'), false);

  const quiet = validateState({ ...original, reminderPrefs: { d1: false, stale: true }, reminderSettings: { ...original.reminderSettings, snoozedUntil: { d1: '2027-01-01T12:00:00.000Z' } } });
  const quietVoided = voidEntry(quiet, 'd1', id(), at);
  eq('voided debt retains notification opt-out', quietVoided.reminderPrefs.d1, false);
  eq('voided debt clears old pending snooze', quietVoided.reminderSettings.snoozedUntil, {});
  eq('restoring debt preserves notification opt-out', restoreEntry(quietVoided, 'd1', id(), at).reminderPrefs.d1, false);
  eq('stale reminder preferences still pruned', 'stale' in quietVoided.reminderPrefs, false);

  rejects('debt with active payments cannot be voided', () => voidEntry(paid, 'd1', id(), at));
  const voidedPayment = voidEntry(paid, 'pay1', id(), at);
  eq('voiding payment restores outstanding amount', remainingCents(voidedPayment.tx, getTx(voidedPayment)), 10000);
  eq('voiding preserves payment for review', voidedPayment.tx.length, 2);
  eq('voiding records timestamp', getTx(voidedPayment, 'pay1').voidedAt, at);
  rejects('voided payment cannot be edited', () => editEntry(voidedPayment, 'pay1', { amount: 20 }, id(), at));
  rejects('already voided payment cannot be voided twice', () => voidEntry(voidedPayment, 'pay1', id(), at));
  const voidedDebt = voidEntry(voidedPayment, 'd1', id(), at);
  eq('voided debt is excluded from remaining amount', remainingCents(voidedDebt.tx, getTx(voidedDebt)), 0);
  eq('voided debt is excluded from person balance', balance(voidedDebt.tx, 'p1'), 0);
  const c = makeColors(false, '#2f5fb0');
  eq('voided debt excluded from visible active debt list', allDebts(voidedDebt.tx, peopleView(voidedDebt.people, voidedDebt.tx, c, false), c).length, 0);
  rejects('payment cannot be restored while debt voided', () => restoreEntry(voidedDebt, 'pay1', id(), at));
  const restoredDebt = restoreEntry(voidedDebt, 'd1', id(), at);
  eq('restoring debt leaves historical payment voided', remainingCents(restoredDebt.tx, getTx(restoredDebt)), 10000);
  const restoredPayment = restoreEntry(restoredDebt, 'pay1', id(), at);
  eq('restoring payment re-applies its amount once', remainingCents(restoredPayment.tx, getTx(restoredPayment)), 6000);
  rejects('active entry cannot be restored twice', () => restoreEntry(restoredPayment, 'pay1', id(), at));
  eq('complete void and restore history retained', restoredPayment.changes.map(change => change.kind), ['void', 'void', 'restore', 'restore']);
  const moved = editEntry(voidedPayment, 'd1', { personId: 'p2', dir: 'owe' }, id(), at);
  eq('voided historical payment permits debt correction', [getTx(moved).personId, getTx(moved).dir], ['p2', 'owe']);
  eq('voided payment retains original person', getTx(moved, 'pay1').personId, 'p1');
  rejects('historical payment cannot restore onto different person', () => restoreEntry(moved, 'pay1', id(), at));
  const dateMoved = editEntry(voidedPayment, 'd1', { createdAt: '2026-01-13' }, id(), at);
  rejects('restore cannot revive payment before corrected debt date', () => restoreEntry(dateMoved, 'pay1', id(), at));
  const reduced = editEntry(voidedPayment, 'd1', { amount: 20 }, id(), at);
  rejects('restoring payment rechecks overpayment after debt correction', () => restoreEntry(reduced, 'pay1', id(), at));
  const increased = editEntry(original, 'd1', { amount: 200 }, id(), at);
  const laterPaid = validateState({ ...increased, tx: [...increased.tx, payment({ amount: 150 })] });
  rejects('undo cannot shrink balance below payments added later', () => undoEntryEdit(laterPaid, 'd1', id(), at));

  for (const patch of [
    { changes: [...edited.changes, edited.changes[0]] },
    { changes: [{ ...edited.changes[0], txId: 'missing' }] },
    { changes: [{ ...edited.changes[0], before: { ...edited.changes[0].before, id: 'other' } }] },
    { changes: [{ ...edited.changes[0], after: { ...edited.changes[0].after, amount: 123 } }] },
    { changes: [{ ...edited.changes[0], kind: 'void' }] },
    { changes: [{ ...edited.changes[0], after: { ...edited.changes[0].after, recordedAt: at } }] },
  ]) rejects('tampered correction history rejected', () => validateState({ ...edited, ...patch }));
  rejects('disconnected correction chain rejected', () => validateState({ ...undone, changes: [undone.changes[0], { ...undone.changes[1], before: debt() }] }));
  rejects('void action cannot hide an amount change', () => validateState({ ...voidedPayment, tx: voidedPayment.tx.map(t => t.id === 'pay1' ? { ...t, amount: 20 } : t), changes: [{ ...voidedPayment.changes[0], after: { ...voidedPayment.changes[0].after, amount: 20 } }] }));
  eq('snapshot fields whitelisted', 'secret' in validateState({ ...edited, changes: [{ ...edited.changes[0], before: { ...edited.changes[0].before, secret: 'discard' } }] }).changes[0].before, false);

  const input = { personId: 'p1', dir: 'me' as const, amount: 10.01, note: 'قديم', dueInDays: 7, transactionDate: '2026-01-31' };
  const backdated = createDebt(original, input, 'new', '2026-09-12')!;
  eq('backdated debt stores actual transaction day', backdated.createdAt, '2026-01-31');
  eq('relative due date anchors to actual transaction day', backdated.dueAt, '2026-02-07');
  eq('backdated entry retains independent recording time', typeof backdated.recordedAt, 'string');
  eq('invalid transaction date rejects creation', createDebt(original, { ...input, transactionDate: '2026-02-30' }, 'new', '2026-09-12'), null);
  eq('future transaction date rejects creation', createDebt(original, { ...input, transactionDate: '2026-09-13' }, 'new', '2026-09-12'), null);
  eq('new custom due date cannot precede transaction', createDebt(original, { ...input, dueAt: '2026-01-30' }, 'new', '2026-09-12'), null);
  eq('new relative due date cannot precede transaction', createDebt(original, { ...input, dueInDays: -1 }, 'new', '2026-09-12'), null);
  eq('new installment start cannot precede transaction', createDebt(original, { ...input, dueAt: '2026-01-30', installmentCount: 3 }, 'new', '2026-09-12'), null);
  const monthly = createDebt(original, { ...input, dueInDays: null, installmentCount: 3 }, 'monthly', '2026-09-12')!;
  eq('backdated installments retain month-end anchor', monthly.installments!.map(row => row.dueAt), ['2026-02-28', '2026-03-31', '2026-04-30']);
  eq('backdated installments preserve cents', monthly.installments!.map(row => row.amount), [3.33, 3.33, 3.35]);
  const payDate = createSettlements([debt()], 'p1', 25.25, id, 'd1', 'me', '2026-01-11', '  تحويل  ');
  eq('backdated payment stores actual date', payDate[0].createdAt, '2026-01-11');
  eq('payment note trimmed', payDate[0].note, 'تحويل');
  eq('payment creation cannot precede debt', createSettlements([debt()], 'p1', 25, id, 'd1', 'me', '2026-01-09').length, 0);
  eq('payment creation cannot be future', createSettlements([debt()], 'p1', 25, id, 'd1', 'me', addDays(todayISO(), 1)).length, 0);
  const mixed = [debt(), debt({ id: 'later', createdAt: '2026-01-20' }), debt({ id: 'opposite', dir: 'owe' })];
  eq('historical payment ignores debts not yet created', createSettlements(mixed, 'p1', 150, id, undefined, 'me', '2026-01-15').length, 0);
  eq('historical payment selects eligible oldest debt', createSettlements(mixed, 'p1', 100, id, undefined, 'me', '2026-01-15')[0].debtId, 'd1');
  eq('historical ambiguous payment requires direction', createSettlements(mixed, 'p1', 50, id, undefined, undefined, '2026-01-15').length, 0);

  const values = new Map<string, string>();
  const writes: string[] = [];
  const storage = { getItem: async (key: string) => values.get(key) ?? null, setItem: async (key: string, value: string) => { writes.push(key); values.set(key, value); } };
  const before = JSON.stringify(original), after = JSON.stringify(edited);
  await keepLocalSnapshot(storage, before, after, at);
  eq('local recovery captures exact previous ledger', (await readLocalHistory(storage))[0].state, original);
  eq('local recovery reads back persisted bytes', values.has(LOCAL_HISTORY_KEY), true);
  const countWrites = writes.length;
  await keepLocalSnapshot(storage, before, JSON.stringify({ ...original, dark: true }), at);
  eq('appearance changes do not consume recovery history', writes.length, countWrites);
  await rejectsAsync('invalid replacement cannot rotate history', () => keepLocalSnapshot(storage, before, '{broken', at));
  eq('invalid replacement leaves history unchanged', writes.length, countWrites);
  for (let n = 1; n <= 12; n++) await keepLocalSnapshot(storage, JSON.stringify(state([debt({ amount: n })])), JSON.stringify(state([debt({ amount: n + 1 })])), `2026-09-${String(n).padStart(2, '0')}T12:00:00.000Z`);
  eq('local history retention bounded', (await readLocalHistory(storage)).length, LOCAL_HISTORY_LIMIT);
  eq('latest recovery point sorts first', (await readLocalHistory(storage))[0].state.tx[0].amount, 12);
  await keepLocalSnapshot(storage, JSON.stringify(state([debt({ amount: 12 })])), after, '2026-09-13T12:00:00.000Z');
  eq('identical financial snapshots deduplicated', (await readLocalHistory(storage)).filter(s => s.state.tx[0].amount === 12).length, 1);
  values.set(LOCAL_HISTORY_KEY, JSON.stringify([snapshot(original, 1), { id: 'bad', createdAt: at, state: { broken: true } }, snapshot(edited, 2)]));
  eq('one broken snapshot cannot hide readable ones', (await readLocalHistory(storage)).length, 2);
  values.set(STORAGE_RECOVERY_KEY, before);
  eq('previous copy deduplicated against dated history', (await availableLocalHistory(storage)).length, 2);
  values.set(LOCAL_HISTORY_KEY, '{broken history');
  eq('broken dated history still exposes valid previous copy', (await availableLocalHistory(storage))[0].state, original);
  await keepLocalSnapshot(storage, before, after, at);
  eq('history repair retains original damaged bytes', values.get(LOCAL_HISTORY_QUARANTINE_KEY), '{broken history');
  eq('history repair creates readable point from verified primary', (await readLocalHistory(storage))[0].state, original);
  values.set(LOCAL_HISTORY_KEY, '{another failure');
  await keepLocalSnapshot(storage, before, after, at);
  eq('later history failure does not overwrite earlier quarantined bytes', values.get(LOCAL_HISTORY_QUARANTINE_KEY), '{broken history');
  eq('later corrupted history also preserved', [...values.entries()].some(([key, value]) => key.startsWith(`${LOCAL_HISTORY_QUARANTINE_KEY}.`) && value === '{another failure'), true);
  values.set(LOCAL_HISTORY_KEY, JSON.stringify([snapshot(edited, 2)])); values.set(STORAGE_RECOVERY_KEY, '{broken previous');
  eq('broken previous copy cannot hide dated history', (await availableLocalHistory(storage))[0].state, edited);
  values.set(STORAGE_KEY, '{broken primary');
  const recovered = await readStoredLedger(storage);
  eq('both newer corrupt copies fall back to dated history', [recovered.recovered, recovered.state?.tx[0].amount], [true, 150]);
  eq('recovery reader preserves damaged primary bytes', values.get(STORAGE_KEY), '{broken primary');
  const partialReader = { getItem: async (key: string) => { if (key === STORAGE_KEY || key === STORAGE_RECOVERY_KEY) throw new Error('key unavailable'); return storage.getItem(key); } };
  eq('one unavailable key does not hide readable dated history', (await readStoredLedger(partialReader)).state?.tx[0].amount, 150);
  eq('unavailable previous key does not hide recovery list', (await availableLocalHistory(partialReader))[0].state.tx[0].amount, 150);
  values.set(STORAGE_KEY, before);
  eq('valid primary takes precedence over all recovery copies', (await readStoredLedger(storage)).recovered, false);
  values.clear();
  eq('successful empty reads identify a new install', await readStoredLedger(storage), { state: null, recovered: false });
  await rejectsAsync('read failure cannot initialize empty ledger', () => readStoredLedger({ getItem: async () => { throw new Error('unavailable'); } }));
  await rejectsAsync('history read failure cannot masquerade as empty install', () => readStoredLedger({ getItem: async key => { if (key === LOCAL_HISTORY_KEY) throw new Error('unavailable'); return null; } }));
  values.set(LOCAL_HISTORY_KEY, '{broken');
  await rejectsAsync('corrupt history alone cannot initialize empty ledger', () => readStoredLedger(storage));
  const failedWrites = { ...storage, setItem: async () => { throw new Error('full'); } };
  await rejectsAsync('failed quarantine aborts history repair', () => keepLocalSnapshot(failedWrites, before, after, at));
  eq('failed quarantine preserves existing damaged bytes', values.get(LOCAL_HISTORY_KEY), '{broken');
  const lyingStorage = { ...storage, setItem: async () => {} };
  await rejectsAsync('quarantine read-back verification required', () => keepLocalSnapshot(lyingStorage, before, after, at));
  values.delete(LOCAL_HISTORY_KEY);
  await rejectsAsync('new snapshot read-back verification required', () => keepLocalSnapshot(lyingStorage, before, after, at));

  const queue = createWriteQueue(); let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; }); const events: string[] = [];
  const one = queue(async () => { events.push('first-start'); await gate; events.push('first-end'); });
  const two = queue(async () => { events.push('second'); });
  await Promise.resolve(); eq('financial persistence serialized before next write', events, ['first-start']);
  release(); await Promise.all([one, two]); eq('financial write ordering retained', events, ['first-start', 'first-end', 'second']);
  await queue(async () => { throw new Error('failure'); }).catch(() => {});
  await queue(async () => { events.push('retry'); }); eq('failed persistence does not poison retry queue', events.at(-1), 'retry');
  console.log(`${checks} entry correction, transaction date, and recovery checks passed.`);
}
main().catch(error => { console.error(error); process.exit(1); });
