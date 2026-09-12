/**
 * Full Expo web regression: run the preview in a separate test server, then
 * IOU_TEST_URL=http://localhost:8147 PLAYWRIGHT_MODULE=/path/to/@playwright/test node scripts/add-debt-ui-checks.cjs
 * Uses a fresh browser context and synthetic data; never attaches to an owner session.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const testURL = process.env.IOU_TEST_URL || 'http://localhost:8147';
const field = (page, name) => page.getByLabel(name, { exact: true });
const button = (page, name) => page.getByRole('button', { name, exact: true });
const pressed = async (page, name) => assert.equal(await button(page, name).getAttribute('aria-pressed'), 'true');
const ledger = page => page.evaluate(() => JSON.parse(localStorage.getItem('iou.state.v1')));
const checks = [];
const browserErrors = [];

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome',
    headless: true, args: ['--no-sandbox'],
  });
  try {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    page.on('pageerror', error => browserErrors.push(error.message));
    const check = async (name, run) => { await run(); checks.push(name); console.log('PASS', name); };
    const fillDraft = async () => {
      await button(page, 'أدين له').click();
      await field(page, 'المبلغ بالريال السعودي').fill('456.78');
      await field(page, 'تاريخ الدين').fill('2026-08-11');
      await button(page, 'دفعات مقسّطة').click();
      await button(page, 'زيادة عدد الدفعات').click();
      await button(page, 'تاريخ آخر').click();
      await field(page, 'تاريخ أول دفعة، سنة ثم شهر ثم يوم').fill('2026-10-15');
      await field(page, 'ملاحظة عن الدين، اختياري').fill('مسودة اختبار');
    };
    const assertDraft = async () => {
      assert.equal(await field(page, 'المبلغ بالريال السعودي').inputValue(), '456.78');
      assert.equal(await field(page, 'ملاحظة عن الدين، اختياري').inputValue(), 'مسودة اختبار');
      assert.equal(await field(page, 'تاريخ الدين').inputValue(), '2026-08-11');
      assert.equal(await field(page, 'تاريخ أول دفعة، سنة ثم شهر ثم يوم').inputValue(), '2026-10-15');
      await pressed(page, 'أدين له'); await pressed(page, 'دفعات مقسّطة');
      await pressed(page, 'تاريخ آخر');
      await page.getByText(/4 دفعات شهرية/).waitFor();
    };
    const addName = async name => {
      await button(page, '+ شخص جديد').click();
      await field(page, 'اسم الشخص الجديد').fill(name);
      await button(page, 'إضافة').click();
    };
    await page.goto(testURL);
    for (const name of ['التالي', 'التالي', 'ابدأ']) await button(page, name).click();
    await button(page, 'إضافة دين').click();

    await check('Adding a new person preserves every filled record field and selects the new person', async () => {
      await fillDraft(); await addName('الشخص الأول للاختبار');
      await assertDraft(); await pressed(page, 'الشخص الأول للاختبار');
      assert.equal((await ledger(page)).tx.length, 0);
    });
    await check('Cancelling person creation keeps the record and its previous selected person', async () => {
      await button(page, '+ شخص جديد').click();
      await field(page, 'اسم الشخص الجديد').fill('اسم لن يضاف');
      assert.equal(await button(page, 'حفظ الدين').getAttribute('aria-disabled'), 'true');
      await button(page, 'إلغاء إضافة الشخص').click();
      await assertDraft(); await pressed(page, 'الشخص الأول للاختبار');
      assert.equal((await ledger(page)).people.length, 1);
    });
    await check('Reusing the same trimmed person name preserves fields without a duplicate person', async () => {
      await addName(' الشخص الأول للاختبار '); await assertDraft();
      await pressed(page, 'الشخص الأول للاختبار');
      assert.equal((await ledger(page)).people.length, 1);
    });
    await check('Saving commits the original amount, note, transaction date and four instalments to the selected person', async () => {
      await button(page, 'حفظ الدين').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('iou.state.v1')).tx.length === 1);
      const state = await ledger(page), tx = state.tx[0];
      assert.equal(tx.personId, state.people[0].id); assert.equal(tx.dir, 'owe');
      assert.equal(tx.amount, 456.78); assert.equal(tx.note, 'مسودة اختبار');
      assert.equal(tx.createdAt, '2026-08-11'); assert.equal(tx.dueAt, '2026-10-15');
      assert.equal(tx.installments.length, 4); assert.equal(tx.installments[0].dueAt, '2026-10-15');
    });
    await check('The next record starts clean after save, with no stale person or fields', async () => {
      await button(page, 'إضافة دين').click();
      assert.equal(await field(page, 'المبلغ بالريال السعودي').inputValue(), '');
      assert.equal(await field(page, 'ملاحظة عن الدين، اختياري').inputValue(), '');
      assert.equal(await button(page, 'الشخص الأول للاختبار').getAttribute('aria-pressed'), 'false');
      await pressed(page, 'يدين لي'); await pressed(page, 'دفعة واحدة'); await pressed(page, 'بعد أسبوع');
      assert.equal(await field(page, 'تاريخ أول دفعة، سنة ثم شهر ثم يوم').count(), 0);
    });
    await check('Cancelling the whole record discards its draft before the next opening', async () => {
      await fillDraft(); await addName('الشخص الثاني للاختبار');
      await button(page, 'إغلاق').click(); await button(page, 'إضافة دين').click();
      assert.equal(await field(page, 'المبلغ بالريال السعودي').inputValue(), '');
      assert.equal(await field(page, 'ملاحظة عن الدين، اختياري').inputValue(), '');
      assert.equal(await button(page, 'الشخص الثاني للاختبار').getAttribute('aria-pressed'), 'false');
      await pressed(page, 'دفعة واحدة');
      assert.equal((await ledger(page)).tx.length, 1);
    });
    await check('Single-payment drafts with no due date survive adding a person and remain readable at 320px', async () => {
      await page.setViewportSize({ width: 320, height: 720 });
      await field(page, 'المبلغ بالريال السعودي').fill('٨٨٫٢٥');
      await button(page, 'بدون').click(); await addName('الشخص الثالث للاختبار');
      assert.equal(await field(page, 'المبلغ بالريال السعودي').inputValue(), '88.25');
      await pressed(page, 'بدون'); await pressed(page, 'الشخص الثالث للاختبار');
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      await button(page, 'حفظ الدين').click();
      await page.waitForFunction(() => JSON.parse(localStorage.getItem('iou.state.v1')).tx.length === 2);
      const state = await ledger(page), tx = state.tx[1];
      assert.equal(tx.amount, 88.25); assert.equal(tx.dueAt, null); assert.equal(tx.installments, undefined);
      assert.equal(state.people.find(person => person.id === tx.personId).name, 'الشخص الثالث للاختبار');
    });
    await check('Opening a record from different person pages uses only that person and a clean draft', async () => {
      for (const name of ['الشخص الأول للاختبار', 'الشخص الثالث للاختبار']) {
        await page.getByText(name, { exact: true }).click();
        await button(page, '+ إضافة').click();
        await pressed(page, name);
        assert.equal(await field(page, 'المبلغ بالريال السعودي').inputValue(), '');
        assert.equal(await field(page, 'ملاحظة عن الدين، اختياري').inputValue(), '');
        await field(page, 'المبلغ بالريال السعودي').fill('77');
        await field(page, 'ملاحظة عن الدين، اختياري').fill('مسودة ستلغى');
        await button(page, 'إغلاق').click();
        await button(page, '+ إضافة').waitFor();
        await button(page, 'رجوع').click();
      }
      assert.equal((await ledger(page)).tx.length, 2);
    });
    assert.deepEqual(browserErrors, []);
    console.log(JSON.stringify({ passed: checks.length, checks, browserErrors }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
