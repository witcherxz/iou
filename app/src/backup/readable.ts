import { toCents } from '../money';
import { BackupPayload, InvalidBackupError, parseBackup } from './types';

/** Reports repeat the ledger in tables and spreadsheet links, so permit expansion. */
export const MAX_PORTABLE_BYTES = 80 * 1024 * 1024;
export const REPORT_FILENAME = 'iou-ledger.html';
export const REPORT_DATA_ID = 'iou-backup-data';
export interface ReadableFile { name: string; text: string; mime: string }
type Cell = string | number;
interface Table { name: string; title: string; headers: string[]; rows: Cell[][]; displayOrder: number[] }

export const escapeHtml = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));

/** CSV text must never be evaluated as a spreadsheet formula. Numbers stay numeric. */
export function csvCell(value: Cell): string {
  let text = String(value);
  if (typeof value === 'string' && (/^[\s\u0000-\u001f]*[=+\-@]/u.test(text) || /^[\t\r\n]/u.test(text))) text = "'" + text;
  return '"' + text.replace(/"/g, '""') + '"';
}
export const csv = (rows: Cell[][]): string => '\ufeff' + rows.map(row => row.map(csvCell).join(',')).join('\r\n') + '\r\n';
export const embeddedJson = (value: unknown): string => JSON.stringify(value).replace(/[<>&\u2028\u2029]/g,
  c => '\\u' + c.charCodeAt(0).toString(16).padStart(4, '0'));

function tables(data: BackupPayload): Table[] {
  const names = new Map(data.people.map(p => [p.id, p.name]));
  const txById = new Map(data.tx.map(t => [t.id, t]));
  const paid = new Map<string, number>();
  for (const t of data.tx) if (t.dir === 'settle' && !t.voidedAt) {
    paid.set(t.debtId!, (paid.get(t.debtId!) ?? 0) + toCents(t.amount));
  }
  const remaining = (t: typeof data.tx[number]) => t.voidedAt || t.dir === 'settle' ? 0 :
    Math.max(0, toCents(t.amount) - (paid.get(t.id) ?? 0));
  const kind = (t: typeof data.tx[number]) => t.dir === 'me' ? 'دين لي' : t.dir === 'owe' ? 'دين عليّ' :
    txById.get(t.debtId!)?.dir === 'me' ? 'سداد مستلم' : 'سداد مدفوع';
  const money = (cents: number) => Number((cents / 100).toFixed(2));
  return [
    { name: 'iou-balances.csv', title: 'أرصدة الأشخاص',
      displayOrder: [1, 2, 3, 4, 0],
      headers: ['معرّف الشخص', 'الشخص', 'المتبقي لي (ر.س)', 'المتبقي عليّ (ر.س)', 'الصافي لي (ر.س)'],
      rows: data.people.map(p => {
        const debts = data.tx.filter(t => t.personId === p.id && !t.voidedAt && t.dir !== 'settle');
        const me = debts.filter(t => t.dir === 'me').reduce((sum, t) => sum + remaining(t), 0);
        const owe = debts.filter(t => t.dir === 'owe').reduce((sum, t) => sum + remaining(t), 0);
        return [p.id, p.name, money(me), money(owe), money(me - owe)];
      }) },
    { name: 'iou-transactions.csv', title: 'العمليات والسداد',
      displayOrder: [2, 3, 4, 5, 8, 12, 10, 7, 6, 11, 9, 0, 1],
      headers: ['معرّف العملية', 'معرّف الشخص', 'الشخص', 'النوع', 'المبلغ (ر.س)', 'تاريخ العملية', 'وقت التسجيل', 'تاريخ الاستحقاق', 'الملاحظة', 'معرّف الدين المسدد', 'الحالة', 'وقت الإلغاء', 'المتبقي (ر.س)'],
      rows: data.tx.map(t => [t.id, t.personId, names.get(t.personId) ?? '', kind(t), t.amount, t.createdAt,
        t.recordedAt ?? t.createdAt, t.dueAt ?? '', t.note ?? '', t.debtId ?? '', t.voidedAt ? 'ملغاة' : 'سارية', t.voidedAt ?? '', money(remaining(t))]) },
    { name: 'iou-installments.csv', title: 'الأقساط',
      displayOrder: [1, 2, 3, 4, 5, 6, 0],
      headers: ['معرّف الدين', 'الشخص', 'القسط', 'المبلغ (ر.س)', 'تاريخ الاستحقاق', 'المتبقي من القسط (ر.س)', 'حالة الدين'],
      rows: data.tx.flatMap(t => {
        let covered = paid.get(t.id) ?? 0;
        return (t.installments ?? []).map(i => {
          const left = Math.max(0, toCents(i.amount) - covered);
          covered = Math.max(0, covered - toCents(i.amount));
          return [t.id, names.get(t.personId) ?? '', i.label, i.amount, i.dueAt, t.voidedAt ? 0 : money(left), t.voidedAt ? 'ملغاة' : 'سارية'];
        });
      }) },
    { name: 'iou-history.csv', title: 'سجل التصحيحات',
      displayOrder: [5, 3, 2, 6, 7, 8, 9, 10, 11, 0, 1, 4, 12, 13],
      headers: ['معرّف التصحيح', 'معرّف العملية', 'وقت التصحيح', 'التغيير', 'الشخص قبل', 'الشخص بعد', 'المبلغ قبل (ر.س)', 'المبلغ بعد (ر.س)', 'تاريخ العملية قبل', 'تاريخ العملية بعد', 'الملاحظة قبل', 'الملاحظة بعد', 'السجل الكامل قبل', 'السجل الكامل بعد'],
      rows: (data.changes ?? []).map(change => [change.id, change.txId, change.at,
        change.kind === 'edit' ? 'تعديل' : change.kind === 'void' ? 'إلغاء' : 'تراجع عن إلغاء',
        names.get(change.before.personId) ?? '', names.get(change.after.personId) ?? '', change.before.amount, change.after.amount,
        change.before.createdAt, change.after.createdAt, change.before.note ?? '', change.after.note ?? '',
        JSON.stringify(change.before), JSON.stringify(change.after)]) },
  ];
}

/** Complete standalone report: no remote fonts, network calls or executable ledger content. */
export function readableFiles(text: string): ReadableFile[] {
  const data = parseBackup(text);
  const sections = tables(data);
  const sheets = sections.map(t => ({ name: t.name, text: csv([t.headers, ...t.rows]), mime: 'text/csv' }));
  const downloads = sheets.map(f => `<a download="${f.name}" href="data:text/csv;charset=utf-8,${encodeURIComponent(f.text)}">${escapeHtml(sections.find(t => t.name === f.name)!.title)} CSV</a>`).join(' ');
  const report = `<!doctype html>
<html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(data.profileName)} — دفتر الديون</title>
<style>body{font-family:system-ui,sans-serif;background:#faf8fc;color:#1d1b20;margin:0;padding:24px;line-height:1.65}main{max-width:1200px;margin:auto}h1{font-size:28px;font-weight:500}h2{font-size:22px;font-weight:500}p{max-width:75ch}nav{display:flex;gap:12px;flex-wrap:wrap}a{color:#385784;display:inline-block;padding:12px 16px;border:1px solid #777680;border-radius:24px;text-decoration:none;overflow-wrap:anywhere}section{margin-top:32px}.table{overflow:auto;border:1px solid #cbc5d0;border-radius:12px;background:white}table{border-collapse:collapse;width:100%}th,td{padding:12px;text-align:right;border-bottom:1px solid #e5dfe8;vertical-align:top;min-width:110px;max-width:360px;overflow-wrap:anywhere;white-space:pre-wrap}th{background:#e8e7f0;font-weight:600}td.num{direction:ltr;text-align:right;font-variant-numeric:tabular-nums}footer{margin-top:32px;color:#49454f}@media print{body{padding:0;background:white}nav{display:none}.table{overflow:visible}th,td{font-size:9px;padding:4px;min-width:0}a{border:0}}</style></head>
<body><main><h1>${escapeHtml(data.profileName)} — دفتر الديون</h1><p>وقت النسخة: <bdi>${escapeHtml(data.backedUpAt)}</bdi></p>
<p>تقرير مستقل يمكن فتحه دون التطبيق. المبالغ بالريال السعودي، والأرقام 0–9. الصافي الموجب لصاحب الدفتر والسالب عليه. العمليات الملغاة ظاهرة للمراجعة ولا تدخل في الأرصدة.</p>
<p>تاريخ العملية هو التاريخ الفعلي؛ وقت التسجيل هو وقت إضافتها. التواريخ بالتقويم الميلادي، والأوقات المنتهية بحرف Z بتوقيت UTC. يتم توزيع السداد على الأقساط بالترتيب.</p>
<nav aria-label="تنزيل جداول للقراءة في برنامج جداول">${downloads}<a download="iou-backup.json" href="data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(data))}">نسخة الاستعادة JSON</a></nav>
${sections.map(t => `<section><h2>${t.title}</h2>${t.rows.length ? `<p>اسحب الجدول أفقياً لعرض بقية التفاصيل عند الحاجة.</p><div class="table"><table><thead><tr>${t.displayOrder.map(index => `<th scope="col">${escapeHtml(t.headers[index])}</th>`).join('')}</tr></thead><tbody>${t.rows.map(row => `<tr>${t.displayOrder.map(index => row[index]).map(cell => `<td${typeof cell === 'number' ? ' class="num"' : ''}>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>لا توجد سجلات.</p>'}</section>`).join('')}
<footer>يمكن استعادة هذا الملف HTML أو ملف JSON داخل IoU. ملفات CSV للقراءة والتحليل فقط. تحمي علامة الاقتباس المفردة في بعض خلايا CSV من تفسير النص كمعادلة. النسخة تحتوي على بيانات خاصة؛ شاركها فقط مع من تختاره.</footer>
<script id="${REPORT_DATA_ID}" type="application/json">${embeddedJson(data)}</script></main></body></html>`;
  return [{ name: REPORT_FILENAME, text: report, mime: 'text/html' }, ...sheets];
}

/** Extract data without rendering, executing, or trusting imported HTML. */
export function embeddedBackup(text: string, id = REPORT_DATA_ID): string {
  if (text.length > MAX_PORTABLE_BYTES) throw new InvalidBackupError();
  if (!text.trimStart().startsWith('<')) return text;
  const pattern = new RegExp(`<script id="${id}" type="application/json">([\\s\\S]*?)<\\/script>`, 'g');
  const matches = [...text.matchAll(pattern)];
  if (matches.length !== 1) throw new InvalidBackupError();
  return matches[0][1];
}
export const parseReadableBackup = (text: string): BackupPayload => parseBackup(embeddedBackup(text));
