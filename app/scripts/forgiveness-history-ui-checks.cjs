/**
 * Full Expo web history/creation checks in fresh contexts with synthetic ledgers.
 * IOU_TEST_URL=http://localhost:8147 PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/forgiveness-history-ui-checks.cjs
 * No fixture is imported by the app; screenshots/results stay outside the repository.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.IOU_TEST_URL || 'http://localhost:8147';
const artifacts = process.env.IOU_UI_ARTIFACTS || '/tmp/iou-forgiveness-history-ui';
const key = 'iou.state.v1';
const checks = [], browserErrors = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const personButton = page => page.getByRole('button', { name: /^ش شخص اختبار السجل / });
const mainDebt = value => value.tx.find(row => row.id === 'history-debt');
const longNote = 'ملاحظة توضيحية طويلة لا تغيّر نوع العملية المسجل، حتى إذا ذكر النص دفعة أو إعفاء. '.repeat(5);

function fixture({ dir = 'me', dark = false, cash = 550, waiver = 200, voided = false, notes = 'normal', otherDebt = false } = {}) {
  const tx = [{ id: 'history-debt', personId: 'history-person', dir, amount: 750,
    createdAt: '2026-08-01', dueAt: null, note: 'الدين الرئيسي للاختبار' }];
  if (otherDebt) tx.push({ id: 'history-other-debt', personId: 'history-person', dir: dir === 'me' ? 'owe' : 'me', amount: 750,
    createdAt: '2026-08-01', dueAt: null, note: 'دين الاتجاه الآخر' });
  if (cash) tx.push({ id: 'history-cash', personId: 'history-person', debtId: 'history-debt', dir: 'settle', amount: cash,
    createdAt: '2026-08-02', note: notes === 'empty' ? '' : notes === 'long' ? longNote : 'دفعة نقدية مستقلة' });
  if (waiver) tx.push({ id: 'history-waiver', personId: 'history-person', debtId: 'history-debt', dir: 'forgive', amount: waiver,
    createdAt: '2026-08-03', note: notes === 'empty' ? '' : notes === 'long' ? longNote : 'إعفاء باتفاق الطرفين',
    ...(voided ? { voidedAt: '2026-08-04T10:00:00.000Z' } : {}) });
  return { version: 3, onboarded: true, profileName: 'اختبار السجل',
    people: [{ id: 'history-person', name: 'شخص اختبار السجل', hue: 170 }], tx, changes: [], reminderPrefs: {},
    reminderSettings: { hour: 20, minute: 0, leadDays: 0, weeklyDay: 5, overdueRepeatDays: 0,
      privateNotifications: false, snoozedUntil: {} }, weekly: false, autoBackup: false,
    backupTarget: 'none', backupFolderUri: null, dark, accent: '#2f5fb0', lastBackup: null };
}

async function openDebt(page) {
  await page.getByRole('button', { name: /^تفاصيل الدين: الدين الرئيسي للاختبار،/ }).click();
  await page.getByRole('heading', { name: 'تفاصيل الدين', exact: true }).waitFor();
}
const personRow = (page, kind, voided = false) => page.getByRole('button', {
  name: voided ? /^عملية ملغاة.*إعفاء:/ : kind === 'forgive' ? /^تعديل إعفاء:/ : /^تعديل دفعة:/,
});
const debtRow = (page, kind, voided = false) => page.getByRole('button', {
  name: kind === 'forgive' ? voided ? /^إعفاء ملغى:/ : /^إعفاء · تعديل:/ : /^دفعة · تعديل:/,
});

async function rowChecks(page, row, { dir, kind, amount, note = '', voided = false }) {
  const title = kind === 'forgive' ? dir === 'me' ? 'إعفاء للشخص' : 'إعفاء من الشخص'
    : dir === 'me' ? 'دفعة مستلمة' : 'دفعة مدفوعة';
  await row.getByText(title, { exact: true }).waitFor();
  await row.getByText(kind === 'forgive' ? 'مبلغ الإعفاء' : 'مبلغ الدفعة', { exact: true }).waitFor();
  const amountText = row.getByText(`${amount} ر.س`, { exact: true });
  await amountText.waitFor();
  assert.ok(Number(await amountText.evaluate(node => parseFloat(getComputedStyle(node).fontSize))) >= 20);
  const label = await row.getAttribute('aria-label');
  assert.ok(label.includes(`${amount} ريال سعودي`), 'Accessible amount must identify the same record');
  assert.ok(label.includes(kind === 'forgive' ? 'إعفاء' : 'دفعة'), 'Accessible name must retain the entry kind, including canceled rows');
  if (note) assert.equal(await row.getByText(`${kind === 'forgive' ? 'السبب' : 'ملاحظة'}: ${note}`, { exact: true }).count(), 1);
  if (voided) {
    await row.getByText('عملية ملغاة · لا تُحتسب في الرصيد', { exact: true }).waitFor();
    assert.ok((await amountText.evaluate(node => getComputedStyle(node).textDecorationLine)).includes('line-through'));
  }
  await row.scrollIntoViewIfNeeded();
  for (const item of [row, amountText, row.getByText(title, { exact: true })]) {
    const box = await item.boundingBox();
    assert.ok(box && box.x >= -1 && box.width > 10 && box.x + box.width <= page.viewportSize().width + 1, 'History content must fit the viewport');
  }
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  assert.equal(await amountText.evaluate(node => /[٠-٩۰-۹]/.test(node.textContent)), false);
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  let activeCase = '';
  const scenario = async (name, seed, width, run) => {
    activeCase = name;
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Riyadh' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => browserErrors.push(`${name}: ${error.message}`));
    await context.addInitScript(({ key, seed }) => {
      if (!sessionStorage.getItem('iou.history.test.seeded')) {
        localStorage.setItem(key, JSON.stringify(seed));
        sessionStorage.setItem('iou.history.test.seeded', 'yes');
      }
    }, { key, seed });
    try {
      await page.goto(url);
      await personButton(page).click();
      await run(page, await state(page));
      checks.push(name); console.log('PASS', name);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  };
  try {
    for (const dir of ['me', 'owe']) for (const dark of [false, true]) for (const width of [320, 390]) {
      const seed = fixture({ dir, dark, notes: width === 320 ? 'long' : 'empty' });
      await scenario(`${dir}/${dark ? 'dark' : 'light'}/${width}: payment550 and waiver200 stay distinct in both history screens`, seed, width, async (page, before) => {
        const cash = before.tx.find(row => row.dir === 'settle'), waiver = before.tx.find(row => row.dir === 'forgive');
        await rowChecks(page, personRow(page, 'settle'), { dir, kind: 'settle', amount: 550, note: cash.note });
        await rowChecks(page, personRow(page, 'forgive'), { dir, kind: 'forgive', amount: 200, note: waiver.note });
        const cashColor = await personRow(page, 'settle').getByText(dir === 'me' ? 'دفعة مستلمة' : 'دفعة مدفوعة', { exact: true }).evaluate(node => getComputedStyle(node).color);
        const waiverColor = await personRow(page, 'forgive').getByText(dir === 'me' ? 'إعفاء للشخص' : 'إعفاء من الشخص', { exact: true }).evaluate(node => getComputedStyle(node).color);
        assert.notEqual(cashColor, waiverColor);
        await page.getByText('مغلق بسداد وإعفاء', { exact: true }).waitFor();
        assert.equal(await page.getByText('مسدد', { exact: true }).count(), 0);
        if (dir === 'me' && width === 390 && !dark) {
          await page.getByRole('heading', { name: 'السجل', exact: true }).evaluate(node => node.scrollIntoView({ block: 'start' }));
          await page.screenshot({ path: path.join(artifacts, 'person-history-390-light.png') });
        }
        await openDebt(page);
        await page.getByText('المسدد: 550 ر.س', { exact: true }).waitFor();
        await page.getByText('المعفى منه: 200 ر.س', { exact: true }).waitFor();
        assert.equal(await page.getByText('مسدد', { exact: true }).count(), 0);
        await rowChecks(page, debtRow(page, 'settle'), { dir, kind: 'settle', amount: 550, note: cash.note });
        await rowChecks(page, debtRow(page, 'forgive'), { dir, kind: 'forgive', amount: 200, note: waiver.note });
        await debtRow(page, 'forgive').click();
        await page.getByRole('heading', { name: 'تعديل إعفاء', exact: true }).waitFor();
        assert.equal(await field(page, 'مبلغ الإعفاء بالريال السعودي').inputValue(), '200');
        await button(page, 'رجوع').click();
        await personRow(page, 'settle').click();
        await page.getByRole('heading', { name: 'تعديل دفعة', exact: true }).waitFor();
        assert.equal(await field(page, 'مبلغ الدفعة بالريال السعودي').inputValue(), '550');
        assert.deepEqual(await state(page), before);
      });
    }

    for (const dir of ['me', 'owe']) for (const mode of ['full', 'partial', 'voided']) {
      const seed = fixture({ dir, cash: mode === 'voided' ? 550 : 0, waiver: mode === 'full' ? 750 : 200,
        voided: mode === 'voided', notes: 'empty', dark: mode === 'voided' });
      await scenario(`${dir}/${mode}: forgiveness amount, status and cancellation stay explicit`, seed, 320, async (page, before) => {
        const amount = mode === 'full' ? 750 : 200;
        await rowChecks(page, personRow(page, 'forgive', mode === 'voided'), { dir, kind: 'forgive', amount, voided: mode === 'voided' });
        if (mode !== 'voided') {
          await page.getByText(mode === 'full' ? 'معفى بالكامل' : 'إعفاء جزئي', { exact: true }).waitFor();
          assert.equal(await page.getByText('مسدد', { exact: true }).count(), 0);
        }
        await openDebt(page);
        await rowChecks(page, debtRow(page, 'forgive', mode === 'voided'), { dir, kind: 'forgive', amount, voided: mode === 'voided' });
        if (mode === 'voided') {
          assert.equal(await page.getByText('المعفى منه: 200 ر.س', { exact: true }).count(), 0);
          assert.equal(await button(page, 'الدين مغلق').count(), 0);
          await button(page, 'إعفاء من الدين').waitFor();
          await debtRow(page, 'forgive', true).click();
          await page.getByRole('heading', { name: 'عملية ملغاة', exact: true }).waitFor();
        } else {
          await page.getByText(`المعفى منه: ${amount} ر.س`, { exact: true }).waitFor();
          await page.getByText('المسدد: 0 ر.س', { exact: true }).waitFor();
          assert.equal(await page.getByText('مسدد', { exact: true }).count(), 0);
        }
        assert.deepEqual(await state(page), before);
      });
    }

    for (const dir of ['me', 'owe']) for (const route of ['person', 'debt']) {
      const seed = fixture({ dir, cash: 0, waiver: 0, otherDebt: route === 'person' });
      await scenario(`${dir}/${route}: real entry flow stores cash550 then waiver200 without changing the opposite debt`, seed, 390, async (page, before) => {
        for (const kind of ['settle', 'forgive']) {
          if (route === 'debt') { await openDebt(page); await button(page, kind === 'settle' ? 'تسجيل دفعة' : 'إعفاء من الدين').click(); }
          else {
            await button(page, 'تسجيل دفعة أو إعفاء').click();
            if (kind === 'forgive') await button(page, 'إعفاء من الدين').click();
            const direction = kind === 'forgive' ? dir === 'me' ? 'أعفيته' : 'أعفاني' : dir === 'me' ? 'استلمت منه' : 'دفعت له';
            await button(page, direction).click();
          }
          if (kind === 'settle') {
            await button(page, 'جزء من المبلغ').click();
            await field(page, 'مبلغ الدفعة بالريال السعودي').fill('550');
          } else {
            assert.equal(await button(page, 'إعفاء من الدين').getAttribute('aria-pressed'), 'true');
            assert.equal(await field(page, 'مبلغ الإعفاء بالريال السعودي').inputValue(), '200');
          }
          await field(page, kind === 'forgive' ? 'تاريخ الإعفاء' : 'تاريخ الدفعة').fill(kind === 'forgive' ? '2026-08-03' : '2026-08-02');
          await field(page, kind === 'forgive' ? 'سبب الإعفاء' : 'ملاحظة الدفعة').fill(kind === 'forgive' ? 'تنازل مستقل عن النقد' : 'نقد فعلي للاختبار');
          await button(page, kind === 'forgive' ? 'تأكيد تسجيل الإعفاء' : 'تأكيد تسجيل الدفعة').click();
          await page.getByRole('heading', { name: kind === 'forgive' ? 'تم تسجيل الإعفاء' : 'تم تسجيل الدفعة', exact: true }).waitFor();
          const count = before.tx.length + (kind === 'settle' ? 1 : 2);
          await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).tx.length === count, { key, count });
          const saved = await state(page), added = saved.tx[saved.tx.length - 1];
          assert.equal(added.dir, kind); assert.equal(added.debtId, 'history-debt');
          assert.equal(added.amount, kind === 'settle' ? 550 : 200);
          assert.equal(added.createdAt, kind === 'settle' ? '2026-08-02' : '2026-08-03');
          assert.deepEqual(saved.tx.slice(0, before.tx.length), before.tx);
          await button(page, 'العودة للرئيسية').click();
          await personButton(page).click();
        }
        await rowChecks(page, personRow(page, 'settle'), { dir, kind: 'settle', amount: 550 });
        await rowChecks(page, personRow(page, 'forgive'), { dir, kind: 'forgive', amount: 200 });
        await page.getByText('مغلق بسداد وإعفاء', { exact: true }).waitFor();
        await page.reload(); await personButton(page).click();
        assert.equal((await state(page)).tx.filter(row => row.dir === 'forgive').length, 1);
        assert.equal((await state(page)).tx.filter(row => row.dir === 'settle').length, 1);
      });
    }

    await scenario('Real PIN lock/unlock preserves a partial waiver draft and its saved receipt without duplicate entries',
      fixture({ dir: 'owe', cash: 0, waiver: 0, otherDebt: true }), 390, async (page, before) => {
        const syntheticPin = '482915';
        const note = 'إعفاء جزئي يبقى بعد قفل التطبيق';
        // Enroll through the actual settings/controller/crypto/storage path.
        await button(page, 'رجوع').click();
        await page.getByRole('tab', { name: 'الإعدادات', exact: true }).click();
        await button(page, 'قفل التطبيق').click();
        await button(page, 'تفعيل القفل').click();
        await field(page, 'الرمز الجديد').fill(syntheticPin);
        await field(page, 'تأكيد الرمز').fill(syntheticPin);
        await button(page, 'حفظ وتفعيل القفل').click();
        await page.getByText('تم تفعيل قفل التطبيق.', { exact: true }).waitFor();
        await button(page, 'رجوع').click();
        await page.getByRole('tab', { name: 'الرئيسية', exact: true }).click();
        await personButton(page).click();
        await button(page, 'تسجيل دفعة أو إعفاء').click();
        assert.equal(await button(page, 'دفعة مالية').getAttribute('aria-pressed'), 'true');
        await button(page, 'إعفاء من الدين').click();
        await button(page, 'أعفاني').click();
        await button(page, 'جزء من المبلغ').click();
        await field(page, 'مبلغ الإعفاء بالريال السعودي').fill('125.50');
        await field(page, 'تاريخ الإعفاء').fill('2026-08-05');
        await field(page, 'سبب الإعفاء').fill(note);
        const draftFields = async () => {
          assert.equal(await button(page, 'إعفاء من الدين').getAttribute('aria-pressed'), 'true');
          assert.equal(await button(page, 'أعفاني').getAttribute('aria-pressed'), 'true');
          assert.equal(await button(page, 'جزء من المبلغ').getAttribute('aria-pressed'), 'true');
          assert.equal(await field(page, 'مبلغ الإعفاء بالريال السعودي').inputValue(), '125.50');
          assert.equal(await field(page, 'تاريخ الإعفاء').inputValue(), '2026-08-05');
          assert.equal(await field(page, 'سبب الإعفاء').inputValue(), note);
        };
        const visibility = visible => page.evaluate(visible => {
          // Dispatch the browser lifecycle event consumed by the real Provider;
          // do not replace the privacy controller, adapter, gate or app wiring.
          Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
          Object.defineProperty(document, 'hidden', { configurable: true, value: !visible });
          document.dispatchEvent(new Event('visibilitychange'));
        }, visible);
        const unlock = async () => {
          await visibility(true);
          await page.getByRole('heading', { name: 'دفترك مقفل', exact: true }).waitFor();
          await field(page, 'رمز القفل').fill(syntheticPin);
          await button(page, 'فتح بالرمز').click();
        };
        await draftFields();
        await visibility(false);
        await field(page, 'سبب الإعفاء').waitFor({ state: 'detached' });
        assert.deepEqual((await state(page)).tx, before.tx);
        await unlock();
        await field(page, 'سبب الإعفاء').waitFor();
        await draftFields();
        assert.deepEqual((await state(page)).tx, before.tx);
        await button(page, 'تأكيد تسجيل الإعفاء').click();
        const receipt = page.getByRole('heading', { name: 'تم تسجيل الإعفاء', exact: true });
        await receipt.waitFor();
        await page.waitForFunction(({ key, count }) => JSON.parse(localStorage.getItem(key)).tx.length === count,
          { key, count: before.tx.length + 1 });
        const saved = await state(page), added = saved.tx.at(-1);
        assert.equal(added.dir, 'forgive'); assert.equal(added.debtId, 'history-debt');
        assert.equal(added.amount, 125.5); assert.equal(added.createdAt, '2026-08-05'); assert.equal(added.note, note);
        assert.deepEqual(saved.tx.slice(0, before.tx.length), before.tx);
        await visibility(false);
        await receipt.waitFor({ state: 'detached' });
        await unlock();
        await receipt.waitFor();
        assert.equal(await button(page, 'تأكيد تسجيل الإعفاء').count(), 0);
        assert.equal(await button(page, 'تأكيد تسجيل الدفعة').count(), 0);
        assert.deepEqual((await state(page)).tx, saved.tx);
        await button(page, 'العودة للرئيسية').click();
        await personButton(page).click();
        assert.equal(await personRow(page, 'forgive').count(), 1);
        assert.equal(await personRow(page, 'settle').count(), 0);
        assert.deepEqual((await state(page)).tx, saved.tx);
      });
    assert.deepEqual(browserErrors, []);
    const result = { passed: checks.length, checks, browserErrors, url };
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks, activeCase, browserErrors, error: error.message }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
