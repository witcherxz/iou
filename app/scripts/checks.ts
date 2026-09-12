import { fmt, arDate, daysUntil, addDays, todayISO, dueLabelFor } from '../src/format';
import { makeColors, avatarColors } from '../src/theme';
import { peopleView, allDebts, remaining, balance } from '../src/selectors';
import { seedState } from '../src/seed';
import { applyKey } from '../src/components/Keypad';

const out: string[] = [];
const eq = (label: string, got: unknown, want: unknown) =>
  out.push(`${got === want ? 'PASS' : 'FAIL'} ${label}: got ${String(got)}${got === want ? '' : ` want ${String(want)}`}`);

eq('fmt 3000', fmt(3000), '٣٬٠٠٠');
eq('fmt 120', fmt(120), '١٢٠');
eq('fmt 12.5', fmt(12.5), '١٢٫٥');
eq('fmt 0', fmt(0), '٠');
eq('fmt 1234567.891', fmt(1234567.891), '١٬٢٣٤٬٥٦٧٫٨٩');
eq('fmt neg', fmt(-45), '−٤٥');

const t = todayISO();
eq('daysUntil +3', daysUntil(addDays(t, 3)), 3);
eq('daysUntil null', daysUntil(null), Infinity);
eq('dueLabel overdue', dueLabelFor(-3, false), 'متأخر ٣ يوم');
eq('dueLabel today', dueLabelFor(0, false), 'يستحق اليوم');
eq('dueLabel paid', dueLabelFor(5, true), 'مكتمل');

eq('keypad seq', ['1','2','.','5','⌫'].reduce(applyKey, ''), '12.');
eq('keypad leading zero', applyKey('0', '5'), '5');
eq('keypad dot first', applyKey('', '.'), '0.');
eq('keypad max len', applyKey('1234567', '8'), '1234567');

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

const av = avatarColors(150, false);
out.push(`INFO avatar hue150 light = ${av.bg} / ${av.fg}`);
out.push(`INFO today = ${arDate(t)}`);

console.log(out.join('\n'));
const failed = out.some(l => l.startsWith('FAIL'));
console.log(failed ? '\nSOME CHECKS FAILED' : '\nALL CHECKS PASSED');
if (failed) process.exit(1);
