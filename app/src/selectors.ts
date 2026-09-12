import { arDate, daysUntil, dueLabelFor, fmt } from './format';
import { avatarColors, Colors } from './theme';
import { Installment, Person, Tx } from './types';

export interface ScheduleRow {
  index: number;
  n: string;
  total: string;
  amount: number;
  amountLabel: string;
  label: string;
  dueAt: string;
  dueIn: number;
  dueLabel: string;
  paid: boolean;
  dotColor: string;
  dotFill: string;
  check: string;
  opacity: number;
}

export interface PersonView extends Person {
  initial: string;
  avatarBg: string;
  avatarFg: string;
  bal: number;
  color: string;
  iouAmt: number;
  uomeAmt: number;
  hasIou: boolean;
  hasUome: boolean;
  iouLabel: string;
  uomeLabel: string;
  amountLabel: string;
  dirLong: string;
  sub: string;
  heroBg: string;
}

export interface DebtView extends Tx {
  personName: string;
  initial: string;
  avatarBg: string;
  avatarFg: string;
  rem: number;
  paid: boolean;
  partial: boolean;
  over: boolean;
  color: string;
  dueIn: number;
  badge: string;
  badgeBg: string;
  badgeFg: string;
  border: string;
  dueLabel: string;
  dueColor: string;
  dateLabel: string;
  dueDateLabel: string;
  remainingLabel: string;
  amountLabel: string;
  pct: `${number}%`;
  dirLong: string;
  heroBg: string;
  payBg: string;
  hasSchedule: boolean;
  schedule: ScheduleRow[] | null;
  scheduleFreqLabel: string;
}

/** Amount still outstanding on a debt after its settlements. */
export function remaining(tx: Tx[], debt: Tx): number {
  const paid = tx.filter(t => t.debtId === debt.id).reduce((s, t) => s + t.amount, 0);
  return Math.max(0, round2(debt.amount - paid));
}

export const round2 = (n: number) => Math.round(n * 100) / 100;

/** Net balance with one person: positive = they owe me. */
export function balance(tx: Tx[], personId: string): number {
  return round2(
    tx
      .filter(t => t.personId === personId && t.dir !== 'settle')
      .reduce((s, t) => s + (t.dir === 'me' ? 1 : -1) * remaining(tx, t), 0),
  );
}

function buildSchedule(
  debt: Tx,
  installments: Installment[],
  rem: number,
  c: Colors,
): ScheduleRow[] {
  const paidTotal = debt.amount - rem;
  let cum = 0;
  return installments.map((ins, i) => {
    cum += ins.amount;
    const paid = paidTotal >= cum - 0.01;
    const dueIn = daysUntil(ins.dueAt);
    return {
      index: i,
      n: fmt(i + 1, 0),
      total: fmt(installments.length, 0),
      amount: ins.amount,
      amountLabel: fmt(ins.amount),
      label: ins.label,
      dueAt: ins.dueAt,
      dueIn,
      dueLabel: paid ? 'مسدد' : dueLabelFor(dueIn, false),
      paid,
      dotColor: paid ? c.green : dueIn < 0 ? c.red : c.border,
      dotFill: paid ? c.green : 'transparent',
      check: paid ? '✓' : '',
      opacity: paid ? 0.6 : 1,
    };
  });
}

export function debtView(debt: Tx, tx: Tx[], people: PersonView[], c: Colors): DebtView {
  const p = people.find(x => x.id === debt.personId);
  const rem = remaining(tx, debt);
  const paid = rem === 0;
  const partial = !paid && rem < debt.amount;

  let dueIn = daysUntil(debt.dueAt);
  let schedule: ScheduleRow[] | null = null;
  if (debt.installments?.length) {
    schedule = buildSchedule(debt, debt.installments, rem, c);
    const nextUnpaid = schedule.find(x => !x.paid);
    dueIn = nextUnpaid ? nextUnpaid.dueIn : schedule[schedule.length - 1].dueIn;
  }

  const over = !paid && dueIn < 0;
  const color = debt.dir === 'me' ? c.green : c.red;
  const badge: [string, string, string] = paid
    ? ['مسدد', c.greenBg, c.green]
    : over
      ? ['متأخر', c.redBg, c.red]
      : partial
        ? ['مسدد جزئياً', c.warnBg, c.warnFg]
        : ['معلق', c.cardHover, c.muted];

  return {
    ...debt,
    personName: p?.name ?? '',
    initial: p?.initial ?? '',
    avatarBg: p?.avatarBg ?? c.card,
    avatarFg: p?.avatarFg ?? c.text,
    rem,
    paid,
    partial,
    over,
    color,
    dueIn,
    badge: badge[0],
    badgeBg: badge[1],
    badgeFg: badge[2],
    border: over ? c.red + '66' : 'transparent',
    dueLabel: dueLabelFor(dueIn, paid),
    dueColor: over ? c.red : c.muted,
    dateLabel: arDate(debt.createdAt),
    dueDateLabel: arDate(debt.dueAt),
    remainingLabel: fmt(rem),
    amountLabel: fmt(debt.amount),
    pct: `${Math.round((1 - rem / debt.amount) * 100)}%` as `${number}%`,
    dirLong: debt.dir === 'me' ? 'يدين لي' : 'أدين له',
    heroBg: debt.dir === 'me' ? c.greenBg : c.redBg,
    payBg: paid ? c.track : c.primary,
    hasSchedule: !!schedule,
    schedule,
    scheduleFreqLabel: 'شهري',
  };
}

/** People sorted by total exposure, richest context first — as in the design. */
export function peopleView(people: Person[], tx: Tx[], c: Colors, dark: boolean): PersonView[] {
  return people
    .map(p => {
      const own = tx.filter(t => t.personId === p.id && t.dir !== 'settle');
      const iouAmt = round2(own.filter(t => t.dir === 'me').reduce((x, t) => x + remaining(tx, t), 0));
      const uomeAmt = round2(own.filter(t => t.dir === 'owe').reduce((x, t) => x + remaining(tx, t), 0));
      const bal = round2(iouAmt - uomeAmt);
      const a = avatarColors(p.hue, dark);
      return {
        ...p,
        initial: p.name.trim()[0] ?? '؟',
        avatarBg: a.bg,
        avatarFg: a.fg,
        bal,
        color: bal > 0 ? c.green : bal < 0 ? c.red : c.muted,
        iouAmt,
        uomeAmt,
        hasIou: iouAmt > 0,
        hasUome: uomeAmt > 0,
        iouLabel: fmt(iouAmt),
        uomeLabel: fmt(uomeAmt),
        amountLabel: fmt(Math.abs(bal)),
        dirLong: bal > 0 ? 'يدين لي بـ' : bal < 0 ? 'أدين له بـ' : 'لا يوجد رصيد',
        sub: fmt(tx.filter(t => t.personId === p.id).length, 0) + ' عمليات',
        heroBg: bal > 0 ? c.greenBg : bal < 0 ? c.redBg : c.card,
      };
    })
    .sort((a, b) => b.iouAmt + b.uomeAmt - (a.iouAmt + a.uomeAmt));
}

export function allDebts(tx: Tx[], people: PersonView[], c: Colors): DebtView[] {
  return tx.filter(t => t.dir !== 'settle').map(d => debtView(d, tx, people, c));
}
