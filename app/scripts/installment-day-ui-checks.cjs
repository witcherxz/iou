/**
 * Full Expo web regression, with isolated browser contexts and synthetic ledgers.
 * IOU_TEST_URL=http://localhost:8147 PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/installment-day-ui-checks.cjs
 * Browser checks verify keyboard hints; actual Android keyboard rendering needs native QA.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const testURL = process.env.IOU_TEST_URL || 'http://localhost:8147';
const artifacts = process.env.IOU_UI_ARTIFACTS || '/tmp/iou-installment-day-ui';
const stateKey = 'iou.state.v1';
const checks = [], browserErrors = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const dayField = page => field(page, 'اليوم من الشهر');
const applyButton = page => button(page, 'تطبيق على الأقساط المتبقية');
const homePerson = page => page.getByRole('button', { name: /^ش شخص اختبار الأقساط / });
const ledger = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), stateKey);
const debt = state => state.tx.find(row => row.id === 'ui-debt');
const reductions = state => state.tx.filter(row => row.id !== 'ui-debt');
const displayedDate = value => value.slice(0, 10);

function fixture({ dir = 'me', dates = ['2026-01-20T12:00:00.000Z', '2026-02-20T12:00:00.000Z', '2026-03-20', '2026-04-20'],
  actualDate = '2026-01-01T12:00:00.000Z', payments = [] } = {}) {
  const tx = [{ id: 'ui-debt', personId: 'ui-person', dir, amount: dates.length * 100,
    createdAt: actualDate, recordedAt: '2026-01-01T12:01:00.000Z', note: 'جدول اختبار يوم القسط',
    dueAt: dates[0], freq: 'month', installments: dates.map((dueAt, index) => ({ dueAt, amount: 100, label: `قسط ${index + 1}` })) },
  ...payments.map(([kind, amount], index) => ({ id: `ui-reduction-${index}`, personId: 'ui-person',
    dir: kind, amount, debtId: 'ui-debt', createdAt: `2026-01-${String(index + 2).padStart(2, '0')}`,
    note: kind === 'forgive' ? 'إعفاء للاختبار' : 'دفعة للاختبار' }))];
  return { version: 3, onboarded: true, profileName: 'اختبار يوم القسط',
    people: [{ id: 'ui-person', name: 'شخص اختبار الأقساط', hue: 170 }], tx, changes: [], reminderPrefs: {},
    reminderSettings: { hour: 20, minute: 0, leadDays: 0, weeklyDay: 5, overdueRepeatDays: 0,
      privateNotifications: false, snoozedUntil: {} }, weekly: false, autoBackup: false,
    backupTarget: 'none', backupFolderUri: null, dark: false, accent: '#2f5fb0', lastBackup: null };
}

async function openFromPerson(page) {
  await page.getByRole('button', { name: /^تفاصيل الدين: جدول اختبار يوم القسط/ }).click();
  await button(page, 'تعديل الدين أو إلغاؤه').click();
  await page.getByRole('heading', { name: 'تعديل دين', exact: true }).waitFor();
}
async function editorDates(page, length) {
  return Promise.all(Array.from({ length }, (_, index) => field(page, `موعد القسط ${index + 1}`).inputValue()));
}
async function apply(page, day) { await dayField(page).fill(day); await applyButton(page).click(); }
async function unchanged(page, before) { assert.deepEqual(await ledger(page), before); }
async function disabled(locator, value = true) {
  assert.equal(await locator.getAttribute('aria-disabled') === 'true', value);
}
async function audited(page, length) {
  await page.waitForFunction(({ key, length }) => JSON.parse(localStorage.getItem(key)).changes.length === length, { key: stateKey, length });
  return ledger(page);
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox'] });
  let activeCase = '';
  const check = async (name, action) => { activeCase = name; await action(); checks.push(name); console.log('PASS', name); };
  const scenario = async (name, seed, action, viewport = { width: 390, height: 844 }) => {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Riyadh' });
    const page = await context.newPage();
    page.setDefaultTimeout(15_000);
    page.on('pageerror', error => browserErrors.push(`${name}: ${error.message}`));
    await context.addInitScript(({ seed, key }) => {
      if (!sessionStorage.getItem('iou.test.seeded')) {
        localStorage.setItem(key, JSON.stringify(seed));
        sessionStorage.setItem('iou.test.seeded', 'yes');
      }
    }, { seed, key: stateKey });
    try {
      await page.goto(testURL);
      await homePerson(page).click();
      await openFromPerson(page);
      await action(page, await ledger(page));
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, `${name}-failure.png`), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  };
  try {
    for (const dir of ['me', 'owe']) {
      const seed = fixture({ dir, payments: [['settle', 100], ['forgive', 100], ['settle', 40]] });
      await scenario(`direction-${dir}`, seed, async (page, before) => {
        const expectedDates = ['2026-01-20', '2026-02-20', '2026-03-15', '2026-04-15'];
        await check(`${dir}: preview moves partial/open overdue installments while preserving cash-paid and forgiven rows`, async () => {
          await apply(page, '15');
          assert.deepEqual(await editorDates(page, 4), expectedDates);
          await page.getByText(/حُدّثت مواعيد 2 أقساط في المسودة/).waitFor();
          assert.equal(await page.getByText(/^الموعد السابق:/).count(), 2);
          assert.equal(await field(page, 'مبلغ القسط 3').inputValue(), '100');
          await unchanged(page, before);
        });
        await check(`${dir}: leaving the editor discards the preview with no ledger or audit mutation`, async () => {
          await button(page, 'رجوع').click();
          await openFromPerson(page);
          assert.deepEqual(await editorDates(page, 4), debt(before).installments.map(row => displayedDate(row.dueAt)));
          await unchanged(page, before);
        });
        await check(`${dir}: Save creates one exact audited edit and preserves all reduction records and legacy timestamps`, async () => {
          await apply(page, '15');
          await button(page, 'حفظ التعديل').click();
          const after = await audited(page, 1);
          const expected = { ...debt(before), installments: debt(before).installments.map((row, index) =>
            index < 2 ? row : { ...row, dueAt: expectedDates[index] }) };
          assert.deepEqual(debt(after), expected);
          assert.deepEqual(reductions(after), reductions(before));
          assert.equal(after.tx.length, before.tx.length);
          assert.equal(after.changes[0].kind, 'edit');
          assert.equal(after.changes[0].txId, 'ui-debt');
          assert.deepEqual(after.changes[0].before, debt(before));
          assert.deepEqual(after.changes[0].after, expected);
        });
        await check(`${dir}: Undo restores the complete original schedule and records the reversal`, async () => {
          await openFromPerson(page);
          await button(page, 'التراجع عن آخر تعديل').click();
          await button(page, 'تراجع').click();
          const restored = await audited(page, 2);
          assert.deepEqual(restored.tx, before.tx);
          assert.deepEqual(restored.changes[1].after, debt(before));
          await page.reload();
          await homePerson(page).waitFor();
          assert.deepEqual((await ledger(page)).tx, before.tx);
        });
      });
    }

    await scenario('month-end', fixture({ dates: ['2026-01-10', '2026-02-10', '2026-03-10', '2026-04-10'] }), async (page, before) => {
      await check('Day31 clamps February and April without moving any installment to another month', async () => {
        await apply(page, '31');
        assert.deepEqual(await editorDates(page, 4), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
        await unchanged(page, before);
        await button(page, 'حفظ التعديل').click();
        const after = await audited(page, 1);
        assert.equal(debt(after).dueAt, '2026-01-31');
        assert.deepEqual(debt(after).installments.map(row => row.dueAt), ['2026-01-31', '2026-02-28', '2026-03-31', '2026-04-30']);
      });
    });
    await scenario('leap-year', fixture({ dates: ['2028-02-10', '2028-03-10'] }), async (page, before) => {
      await check('Leap-year February keeps February29 for day31', async () => {
        await apply(page, '31');
        assert.deepEqual(await editorDates(page, 2), ['2028-02-29', '2028-03-31']);
        await unchanged(page, before);
      });
    });
    for (const completedFirst of [false, true]) {
      await scenario(`collision-${completedFirst}`, fixture({ dates: ['2026-02-20', '2026-02-25'],
        payments: completedFirst ? [['settle', 100]] : [] }), async (page, before) => {
        await check(`${completedFirst ? 'Completed-row ordering' : 'Duplicate-date'} collision blocks the bulk change without touching the draft`, async () => {
          await apply(page, '15');
          await page.getByRole('alert').filter({ hasText: 'ستتكرر المواعيد أو يتغير ترتيبها' }).waitFor();
          assert.deepEqual(await editorDates(page, 2), ['2026-02-20', '2026-02-25']);
          await unchanged(page, before);
        });
      });
    }
    await scenario('before-debt', fixture({ actualDate: '2026-01-20', dates: ['2026-01-25', '2026-02-25'] }), async (page, before) => {
      await check('A new date before the debt date is rejected without changing the draft or ledger', async () => {
        await apply(page, '1');
        await page.getByRole('alert').filter({ hasText: 'قبل تاريخ الدين' }).waitFor();
        assert.deepEqual(await editorDates(page, 2), ['2026-01-25', '2026-02-25']);
        await unchanged(page, before);
      });
    });
    await scenario('input-and-layout', fixture(), async (page, before) => {
      await check('Invalid day input disables applying; Arabic/Persian input normalizes to0–9 with numeric OS keyboard hints', async () => {
        assert.equal(await dayField(page).getAttribute('inputmode'), 'numeric');
        assert.equal(await dayField(page).getAttribute('maxlength'), '2');
        assert.equal(await field(page, 'المبلغ بالريال السعودي').getAttribute('inputmode'), 'decimal');
        for (const value of ['', '0', '32', '-1', 'a', '1.']) {
          await dayField(page).fill(value); await disabled(applyButton(page));
        }
        for (const value of ['٢٥', '۲۵']) {
          await dayField(page).fill(value);
          assert.equal(await dayField(page).inputValue(), '25'); await disabled(applyButton(page), false);
        }
        assert.equal(await button(page, 'حذف آخر رقم').count(), 0);
        for (const digit of '0123456789') assert.equal(await button(page, digit).count(), 0);
        await unchanged(page, before);
      });
      await check('Unsaved debt/row amount changes block bulk scheduling until original amounts are restored', async () => {
        await field(page, 'المبلغ بالريال السعودي').fill('401'); await disabled(applyButton(page));
        await page.getByText('احفظ تغييرات المبالغ أولاً لتحديد الأقساط المتبقية بدقة.').waitFor();
        await field(page, 'المبلغ بالريال السعودي').fill('400');
        await field(page, 'مبلغ القسط 2').fill('101'); await disabled(applyButton(page));
        await field(page, 'مبلغ القسط 2').fill('100'); await disabled(applyButton(page), false);
        await unchanged(page, before);
      });
      await check('At320px and a reduced viewport, the day field and preview remain readable without horizontal overflow', async () => {
        await page.setViewportSize({ width: 320, height: 420 });
        await dayField(page).focus(); await applyButton(page).scrollIntoViewIfNeeded();
        await applyButton(page).click();
        assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
        for (const locator of [dayField(page), applyButton(page), field(page, 'موعد القسط 4'), button(page, 'حفظ التعديل')]) {
          await locator.scrollIntoViewIfNeeded();
          const box = await locator.boundingBox();
          assert.ok(box && box.x >= -1 && box.width > 20 && box.x + box.width <= 321);
        }
        assert.equal(await page.locator('input').evaluateAll(inputs => inputs.every(input => !/[٠-٩۰-۹]/.test(input.value))), true);
        await applyButton(page).scrollIntoViewIfNeeded();
        await page.screenshot({ path: path.join(artifacts, 'day-preview-320px.png') });
        await unchanged(page, before);
      });
    });
    await scenario('mixed-completion', fixture({ payments: [['settle', 60], ['forgive', 40], ['settle', 30]] }), async (page, before) => {
      await check('A row completed by mixed payment/forgiveness stays fixed while the partially paid next row moves', async () => {
        await apply(page, '15');
        assert.deepEqual(await editorDates(page, 4), ['2026-01-20', '2026-02-15', '2026-03-15', '2026-04-15']);
        await button(page, 'حفظ التعديل').click();
        const after = await audited(page, 1);
        assert.deepEqual(debt(after).installments[0], debt(before).installments[0]);
        assert.deepEqual(reductions(after), reductions(before));
      });
    });
    await scenario('fully-completed', fixture({ dates: ['2026-01-20', '2026-02-20'], payments: [['settle', 100], ['forgive', 100]] }), async (page, before) => {
      await check('A completely paid/forgiven schedule has no bulk-date action', async () => {
        assert.equal(await dayField(page).count(), 0); assert.equal(await applyButton(page).count(), 0);
        await page.getByText('اكتملت جميع الأقساط؛ لا توجد مواعيد متبقية لتغييرها.').waitFor();
        await unchanged(page, before);
      });
    });
    assert.deepEqual(browserErrors, []);
    const result = { passed: checks.length, checks, browserErrors, testURL };
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify(result, null, 2));
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks, activeCase, browserErrors, error: error.message }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
