import { arDate, daysUntil, dueLabelFor, fmt } from './format';
import { avatarColors, Colors } from './theme';
import { Installment, Person, Tx } from './types';
import { installmentAllocations, isDebt, reductionAmounts, remainingCents } from './ledger';
import { fromCents, toCents } from './money';

export interface ScheduleRow {
  index: number;
  n: string;
  total: string;
  amount: number;
  amountLabel: string;
  remainingAmount: number;
  remainingLabel: string;
  label: string;
  dueAt: string;
  dueIn: number;
  dueLabel: string;
  /** Fully closed by money exchanged, with no forgiveness. */
  paid: boolean;
  closed: boolean;
  paidAmount: number;
  forgivenAmount: number;
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
  /** Fully closed by money exchanged, with no forgiveness. */
  paid: boolean;
  closed: boolean;
  paidAmount: number;
  forgivenAmount: number;
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
  nextDueAt: string | null;
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

/** Amount still outstanding after cash payments and forgiveness. */
export function remaining(tx: Tx[], debt: Tx): number {
  return fromCents(remainingCents(tx, debt));
}

export const round2 = (n: number) => fromCents(toCents(n));

/** Net balance with one person: positive = they owe me. */
export function balance(tx: Tx[], personId: string): number {
  return fromCents(
    tx
      .filter(t => !t.voidedAt && t.personId === personId && isDebt(t))
      .reduce((s, t) => s + (t.dir === 'me' ? 1 : -1) * remainingCents(tx, t), 0),
  );
}

function closedLabel(paidAmount: number, forgivenAmount: number): string {
  return forgivenAmount === 0 ? 'مسدد' : paidAmount === 0 ? 'معفى بالكامل' : 'مغلق بسداد وإعفاء';
}

function buildSchedule(debt: Tx, installments: Installment[], tx: Tx[], c: Colors): ScheduleRow[] {
  const allocations = installmentAllocations(tx, debt);
  return installments.map((ins, i) => {
    const { paidAmount, forgivenAmount, remainingAmount } = allocations[i];
    const closed = remainingAmount === 0;
    const paid = closed && forgivenAmount === 0;
    const dueIn = daysUntil(ins.dueAt);
    const closedColor = paid ? c.green : c.primary;
    return {
      index: i,
      n: fmt(i + 1, 0),
      total: fmt(installments.length, 0),
      amount: ins.amount,
      amountLabel: fmt(ins.amount),
      paidAmount,
      forgivenAmount,
      remainingAmount,
      remainingLabel: fmt(remainingAmount),
      label: ins.label,
      dueAt: ins.dueAt,
      dueIn,
      dueLabel: closed ? closedLabel(paidAmount, forgivenAmount) : forgivenAmount > 0 ? 'إعفاء جزئي' : dueLabelFor(dueIn, false),
      paid,
      closed,
      dotColor: closed ? closedColor : dueIn < 0 ? c.red : c.border,
      dotFill: closed ? closedColor : 'transparent',
      check: paid ? '✓' : closed ? '−' : '',
      opacity: closed ? 0.6 : 1,
    };
  });
}

export function debtView(debt: Tx, tx: Tx[], people: PersonView[], c: Colors): DebtView {
  const p = people.find(x => x.id === debt.personId);
  const { paidAmount, forgivenAmount, remainingAmount: rem } = reductionAmounts(tx, debt);
  const closed = rem === 0;
  const paid = closed && forgivenAmount === 0;
  const partial = !closed && rem < debt.amount;

  let dueIn = daysUntil(debt.dueAt);
  let nextDueAt = debt.dueAt ?? null;
  let schedule: ScheduleRow[] | null = null;
  if (debt.installments?.length) {
    schedule = buildSchedule(debt, debt.installments, tx, c);
    const nextOpen = schedule.find(x => !x.closed);
    nextDueAt = nextOpen?.dueAt ?? null;
    dueIn = nextOpen ? nextOpen.dueIn : schedule[schedule.length - 1].dueIn;
  }

  const over = !closed && dueIn < 0;
  const color = debt.dir === 'me' ? c.green : c.red;
  const badge: [string, string, string] = closed
    ? [closedLabel(paidAmount, forgivenAmount), paid ? c.greenBg : c.primaryBg, paid ? c.green : c.primary]
    : forgivenAmount > 0
      ? ['إعفاء جزئي', c.warnBg, c.warnFg]
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
    paidAmount,
    forgivenAmount,
    closed,
    paid,
    partial,
    over,
    color,
    dueIn,
    badge: badge[0],
    badgeBg: badge[1],
    badgeFg: badge[2],
    border: over ? c.red + '66' : 'transparent',
    dueLabel: closed ? closedLabel(paidAmount, forgivenAmount) : dueLabelFor(dueIn, false),
    dueColor: over ? c.red : c.muted,
    dateLabel: arDate(debt.createdAt),
    nextDueAt,
    dueDateLabel: arDate(nextDueAt),
    remainingLabel: fmt(rem),
    amountLabel: fmt(debt.amount),
    pct: `${Math.round((1 - rem / debt.amount) * 100)}%` as `${number}%`,
    dirLong: debt.dir === 'me' ? 'يدين لي' : 'أدين له',
    heroBg: debt.dir === 'me' ? c.greenBg : c.redBg,
    payBg: closed ? c.track : c.primary,
    hasSchedule: !!schedule,
    schedule,
    scheduleFreqLabel: 'شهري',
  };
}

/** People sorted by total exposure, richest context first — as in the design. */
export function peopleView(people: Person[], tx: Tx[], c: Colors, dark: boolean): PersonView[] {
  return people
    .map(p => {
      const own = tx.filter(t => !t.voidedAt && t.personId === p.id && isDebt(t));
      const iouAmt = fromCents(own.filter(t => t.dir === 'me').reduce((x, t) => x + remainingCents(tx, t), 0));
      const uomeAmt = fromCents(own.filter(t => t.dir === 'owe').reduce((x, t) => x + remainingCents(tx, t), 0));
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
        sub: fmt(tx.filter(t => !t.voidedAt && t.personId === p.id).length, 0) + ' عمليات',
        heroBg: bal > 0 ? c.greenBg : bal < 0 ? c.redBg : c.card,
      };
    })
    .sort((a, b) => b.iouAmt + b.uomeAmt - (a.iouAmt + a.uomeAmt));
}

export function allDebts(tx: Tx[], people: PersonView[], c: Colors): DebtView[] {
  return tx.filter(t => !t.voidedAt && isDebt(t)).map(d => debtView(d, tx, people, c));
}
