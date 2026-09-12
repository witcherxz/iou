/**
 * Person-name regression through the real Expo app, using fresh synthetic ledgers.
 * IOU_TEST_URL=http://localhost:8147 PLAYWRIGHT_MODULE=/path/to/playwright-core node scripts/person-name-ui-checks.cjs
 * No fixtures enter the runtime graph; downloads, screenshots, and results stay in /tmp.
 */
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || '@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const url = process.env.IOU_TEST_URL || 'http://localhost:8147';
const artifacts = process.env.IOU_UI_ARTIFACTS || '/tmp/iou-person-name-ui';
const key = 'iou.state.v1';
const personId = 'rename-person';
const oldName = 'أحمد قبل التعديل';
const newName = 'أحمد Ahmed بعد التعديل';
const checks = [], browserErrors = [];
const button = (page, name) => page.getByRole('button', { name, exact: true });
const field = (page, name) => page.getByLabel(name, { exact: true });
const state = page => page.evaluate(key => JSON.parse(localStorage.getItem(key)), key);
const personCard = (page, name) => page.getByText(name, { exact: true }).locator('xpath=ancestor::*[@role="button"][1]');
const heading = (page, name) => page.getByRole('heading', { name, exact: true });
const writes = page => page.evaluate(() => window.__renameWrites.map(row => ({ ...row })));
const disk = page => page.evaluate(() => Object.fromEntries(Object.keys(localStorage)
  .filter(key => key.startsWith('iou.state')).sort().map(key => [key, localStorage.getItem(key)])));
const settleUI = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

function fixture({ dark = false, name = oldName } = {}) {
  const debt = { id: 'rename-debt-me', personId, dir: 'me', amount: 750, createdAt: '2026-08-01',
    recordedAt: '2026-08-01T10:00:00.000Z', note: 'الدين بعد التوضيح', dueAt: null,
    installments: [10, 11, 12].map((month, index) => ({ amount: 250, label: `القسط ${index + 1}`, dueAt: `2026-${month}-15` })), freq: 'month' };
  return { version: 3, onboarded: true, profileName: 'اختبار أسماء الأشخاص',
    people: [{ id: personId, name, hue: 170 }, { id: 'rename-other', name: 'Sara أحمد', hue: 250 }],
    tx: [debt,
      { id: 'rename-cash', personId, debtId: debt.id, dir: 'settle', amount: 550, createdAt: '2026-08-02', note: 'نقد فعلي' },
      { id: 'rename-waiver', personId, debtId: debt.id, dir: 'forgive', amount: 100, createdAt: '2026-08-03', note: 'إعفاء مستقل' },
      { id: 'rename-debt-owe', personId, dir: 'owe', amount: 400, createdAt: '2026-08-01', dueAt: null, note: 'دين الاتجاه الآخر' },
      { id: 'rename-paid', personId, debtId: 'rename-debt-owe', dir: 'settle', amount: 50, createdAt: '2026-08-03', note: 'دفعة للاتجاه الآخر' },
      { id: 'rename-other-debt', personId: 'rename-other', dir: 'me', amount: 30, createdAt: '2026-08-01', dueAt: null, note: 'دين شخص آخر' }],
    changes: [{ id: 'rename-existing-edit', txId: debt.id, at: '2026-08-04T10:00:00.000Z', kind: 'edit',
      before: { ...debt, note: 'الدين قبل التوضيح' }, after: { ...debt } }], reminderPrefs: {},
    reminderSettings: { hour: 20, minute: 0, leadDays: 0, weeklyDay: 5, overdueRepeatDays: 0,
      privateNotifications: false, snoozedUntil: {} }, weekly: false, autoBackup: false,
    backupTarget: 'none', backupFolderUri: null, dark, accent: '#2f5fb0', lastBackup: null };
}

async function editor(page, name = oldName) {
  await heading(page, name).waitFor();
  await button(page, 'تعديل اسم الشخص').click();
  await heading(page, 'تعديل اسم الشخص').waitFor();
  assert.equal(await field(page, 'اسم الشخص').inputValue(), name);
}
async function saveName(page, name) {
  await field(page, 'اسم الشخص').fill(name);
  await button(page, 'حفظ الاسم').click();
  await heading(page, name.trim()).waitFor();
  await page.waitForFunction(({ key, personId, name }) => JSON.parse(localStorage.getItem(key))
    .people.find(person => person.id === personId).name === name, { key, personId, name: name.trim() });
}
function renamed(before, name) {
  return { ...before, people: before.people.map(person => person.id === personId ? { ...person, name } : person) };
}
async function assertRename(page, before, name) {
  assert.deepEqual(await state(page), renamed(before, name), 'Rename must only change the selected person name');
  const recorded = (await writes(page)).filter(row => row.key === key && JSON.parse(row.value).people.find(person => person.id === personId).name === name);
  assert.equal(recorded.length, 1, 'A successful name edit must write the canonical ledger once');
}
async function exportTools(page) {
  await button(page, 'رجوع').click();
  await page.getByRole('tab', { name: 'الإعدادات', exact: true }).click();
  await button(page, 'النسخ السابقة والتصدير للجداول').click();
  await heading(page, 'النسخ والاستعادة').waitFor();
}
async function download(page, label) {
  const pending = page.waitForEvent('download');
  await button(page, label).click();
  const result = await pending;
  return { name: result.suggestedFilename(), text: fs.readFileSync(await result.path(), 'utf8') };
}
function parseCSV(text) {
  const rows = []; let row = [], cell = '', quoted = false;
  text = text.replace(/^\ufeff/, '');
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted;
    } else if (!quoted && char === ',') { row.push(cell); cell = ''; }
    else if (!quoted && char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  assert.equal(quoted, false); return rows;
}
async function fits(page, locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  assert.ok(box && box.width > 10 && box.x >= -1 && box.x + box.width <= page.viewportSize().width + 1);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}

async function main() {
  fs.mkdirSync(artifacts, { recursive: true });
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox'] });
  let activeCase = '';
  const scenario = async (name, seed, width, run) => {
    activeCase = name;
    const context = await browser.newContext({ viewport: { width, height: 844 }, timezoneId: 'Asia/Riyadh', acceptDownloads: true });
    const page = await context.newPage(); page.setDefaultTimeout(15_000);
    page.on('pageerror', error => browserErrors.push(`${name}: ${error.message}`));
    await context.addInitScript(({ key, seed }) => {
      if (!sessionStorage.getItem('iou.rename.test.seeded')) {
        localStorage.setItem(key, JSON.stringify(seed));
        sessionStorage.setItem('iou.rename.test.seeded', 'yes');
      }
      window.__renameWrites = [];
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (this === localStorage && String(key).startsWith('iou.state')) window.__renameWrites.push({ key: String(key), value: String(value) });
        return original.call(this, key, value);
      };
    }, { key, seed });
    try {
      await page.goto(url); await personCard(page, seed.people[0].name).click();
      await heading(page, seed.people[0].name).waitFor();
      await run(page, await state(page));
      checks.push(name); console.log('PASS', name);
    } catch (error) {
      await page.screenshot({ path: path.join(artifacts, 'failure.png'), fullPage: true }).catch(() => {});
      throw error;
    } finally { await context.close(); }
  };
  try {
    await scenario('Rename preserves mixed balances, cash, waiver, installment dates and audit IDs; all screens and reload use the new name', fixture(), 390, async (page, before) => {
      await page.getByText('100 ر.س', { exact: true }).first().waitFor();
      await page.getByText('350 ر.س', { exact: true }).waitFor();
      await editor(page); await saveName(page, `  ${newName}  `); await assertRename(page, before, newName);
      await page.getByText('100 ر.س', { exact: true }).first().waitFor();
      await page.getByText('350 ر.س', { exact: true }).waitFor();
      for (const note of ['الدين بعد التوضيح', 'دين الاتجاه الآخر']) {
        await page.getByRole('button', { name: new RegExp(`^تفاصيل الدين: ${note}،`) }).click();
        await heading(page, 'تفاصيل الدين').waitFor(); await page.getByText(newName, { exact: true }).waitFor();
        assert.equal(await page.getByText(oldName, { exact: true }).count(), 0);
        await button(page, 'رجوع').click();
      }
      await button(page, '+ إضافة').click(); await heading(page, 'دين جديد').waitFor();
      assert.equal(await button(page, newName).getAttribute('aria-pressed'), 'true');
      assert.equal(await button(page, oldName).count(), 0); await button(page, 'إغلاق').click();
      await button(page, 'رجوع').click(); await personCard(page, newName).waitFor();
      assert.equal(await personCard(page, oldName).count(), 0);
      await page.reload(); await personCard(page, newName).click();
      await heading(page, newName).waitFor(); assert.deepEqual(await state(page), renamed(before, newName));
      await editor(page, newName); assert.equal(await button(page, 'حفظ الاسم').isDisabled(), true);
    });

    await scenario('HTML and all four CSV exports use the renamed identity and preserve linked records, balances and audit data', fixture(), 390, async (page, before) => {
      await editor(page); await saveName(page, newName); await exportTools(page);
      const report = await download(page, 'تصدير التقرير الكامل');
      assert.equal(report.name, 'iou-ledger.html');
      const embedded = /<script id="iou-backup-data" type="application\/json">([\s\S]*?)<\/script>/.exec(report.text);
      assert.ok(embedded, 'The standalone report must retain its complete recovery data');
      const payload = JSON.parse(embedded[1]);
      assert.deepEqual(payload.people, renamed(before, newName).people);
      assert.deepEqual(payload.tx, before.tx); assert.deepEqual(payload.changes, before.changes);
      assert.equal(report.text.includes(oldName), false);
      for (const [label, name] of [['الأرصدة', 'balances'], ['العمليات', 'transactions'], ['الأقساط', 'installments'], ['التصحيحات', 'history']]) {
        await button(page, label).click(); const file = await download(page, 'تصدير جدول CSV');
        assert.equal(file.name, `iou-${name}.csv`); assert.equal(file.text.includes(oldName), false);
        const rows = parseCSV(file.text).slice(1);
        if (name === 'balances') assert.deepEqual(rows.find(row => row[0] === personId), [personId, newName, '100', '350', '-250']);
        if (name === 'transactions') {
          assert.deepEqual(rows.map(row => row[0]), before.tx.map(row => row.id));
          assert.ok(rows.filter(row => row[1] === personId).every(row => row[2] === newName));
          assert.equal(rows.find(row => row[0] === 'rename-waiver')[3], 'إعفاء للشخص');
          assert.equal(rows.find(row => row[0] === 'rename-cash')[3], 'سداد مستلم');
        }
        if (name === 'installments') { assert.equal(rows.length, 3); assert.ok(rows.every(row => row[1] === newName)); }
        if (name === 'history') {
          assert.equal(rows.length, 1); assert.equal(rows[0][0], before.changes[0].id);
          assert.equal(rows[0][4], newName); assert.equal(rows[0][5], newName);
          assert.deepEqual(JSON.parse(rows[0][12]), before.changes[0].before);
          assert.deepEqual(JSON.parse(rows[0][13]), before.changes[0].after);
        }
      }
      await assertRename(page, before, newName);
    });

    await scenario('Unchanged, whitespace-only and duplicate names cannot save or rotate recovery history; Cancel and Back discard drafts', fixture(), 320, async (page, before) => {
      const initialDisk = await disk(page), initialWrites = await writes(page);
      await editor(page);
      for (const name of [oldName, `  ${oldName}  `, '', '   ', '  sArA أحمد  ']) {
        await field(page, 'اسم الشخص').fill(name);
        assert.equal(await button(page, 'حفظ الاسم').isDisabled(), true);
        if (!name.trim()) await page.getByText('أدخل اسم الشخص.', { exact: true }).waitFor();
        if (name.includes('sArA')) await page.getByText('يوجد شخص آخر بهذا الاسم. استخدم اسماً يميّزه.', { exact: true }).waitFor();
        await field(page, 'اسم الشخص').press('Enter');
        await heading(page, 'تعديل اسم الشخص').waitFor(); await settleUI(page);
        assert.deepEqual(await state(page), before); assert.deepEqual(await disk(page), initialDisk);
        assert.deepEqual(await writes(page), initialWrites);
      }
      for (const exit of ['إلغاء', 'رجوع']) {
        await field(page, 'اسم الشخص').fill('مسودة لا تحفظ'); assert.equal(await button(page, 'حفظ الاسم').isEnabled(), true);
        await button(page, exit).click(); await heading(page, oldName).waitFor();
        await editor(page); assert.equal(await field(page, 'اسم الشخص').inputValue(), oldName);
      }
      await settleUI(page); assert.deepEqual(await disk(page), initialDisk); assert.deepEqual(await writes(page), initialWrites);
    });

    await scenario('Name field limits input to 100 characters and accepts a one-character identity without merging people', fixture(), 390, async (page, before) => {
      await editor(page); const input = field(page, 'اسم الشخص');
      assert.equal(await input.getAttribute('maxlength'), '100');
      await input.fill('أ'.repeat(101)); assert.equal((await input.inputValue()).length, 100);
      await input.fill('أ'); await button(page, 'حفظ الاسم').click(); await heading(page, 'أ').waitFor();
      await page.waitForFunction(key => JSON.parse(localStorage.getItem(key)).people[0].name === 'أ', key);
      await assertRename(page, before, 'أ');
    });

    await scenario('Real PIN background lock preserves the controlled name draft; unlock saves once and later locks cannot resubmit it', fixture(), 390, async (page) => {
      const syntheticPin = '482915';
      await button(page, 'رجوع').click(); await page.getByRole('tab', { name: 'الإعدادات', exact: true }).click();
      await button(page, 'قفل التطبيق').click(); await button(page, 'تفعيل القفل').click();
      await field(page, 'الرمز الجديد').fill(syntheticPin); await field(page, 'تأكيد الرمز').fill(syntheticPin);
      await button(page, 'حفظ وتفعيل القفل').click(); await page.getByText('تم تفعيل قفل التطبيق.', { exact: true }).waitFor();
      await button(page, 'رجوع').click(); await page.getByRole('tab', { name: 'الرئيسية', exact: true }).click();
      await personCard(page, oldName).click(); const before = await state(page), diskBefore = await disk(page);
      await editor(page); await field(page, 'اسم الشخص').fill(` ${newName} `);
      const visibility = visible => page.evaluate(visible => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, value: visible ? 'visible' : 'hidden' });
        Object.defineProperty(document, 'hidden', { configurable: true, value: !visible });
        document.dispatchEvent(new Event('visibilitychange'));
      }, visible);
      const unlock = async () => {
        await visibility(true); await heading(page, 'دفترك مقفل').waitFor();
        await field(page, 'رمز القفل').fill(syntheticPin); await button(page, 'فتح بالرمز').click();
      };
      await visibility(false); await field(page, 'اسم الشخص').waitFor({ state: 'detached' });
      assert.deepEqual(await disk(page), diskBefore); await unlock(); await heading(page, 'تعديل اسم الشخص').waitFor();
      assert.equal(await field(page, 'اسم الشخص').inputValue(), ` ${newName} `);
      await button(page, 'حفظ الاسم').click(); await heading(page, newName).waitFor();
      await page.waitForFunction(({ key, newName }) => JSON.parse(localStorage.getItem(key)).people[0].name === newName, { key, newName });
      await assertRename(page, before, newName);
      await visibility(false); await heading(page, newName).waitFor({ state: 'detached' }); await unlock();
      await heading(page, newName).waitFor(); await assertRename(page, before, newName);
      await editor(page, newName); assert.equal(await button(page, 'حفظ الاسم').isDisabled(), true);
    });

    for (const dark of [false, true]) for (const width of [320, 390]) {
      await scenario(`${dark ? 'dark' : 'light'}/${width}: long Arabic and mixed names stay accessible and fit Home, editor and history`, fixture({ dark }), width, async (page, before) => {
        const longName = dark ? 'فريق Ahmed Team 12 للمحاسبة والمتابعة والاتفاقات المشتركة' : 'عبدالرحمن أحمد عبدالله للمحاسبة والمتابعة والاتفاقات المشتركة';
        await fits(page, button(page, 'تعديل اسم الشخص')); await editor(page);
        await field(page, 'اسم الشخص').fill(longName);
        for (const item of [heading(page, 'تعديل اسم الشخص'), field(page, 'اسم الشخص'), button(page, 'حفظ الاسم'), button(page, 'إلغاء')]) await fits(page, item);
        assert.equal(await field(page, 'اسم الشخص').evaluate(node => getComputedStyle(node).textAlign), 'right');
        await page.screenshot({ path: path.join(artifacts, `editor-${width}-${dark ? 'dark' : 'light'}.png`) });
        // A reduced browser viewport checks scrolling when a native keyboard occupies space.
        await page.setViewportSize({ width, height: 460 }); await field(page, 'اسم الشخص').focus(); await fits(page, button(page, 'حفظ الاسم'));
        await button(page, 'حفظ الاسم').click(); await heading(page, longName).waitFor();
        await page.setViewportSize({ width, height: 844 }); await fits(page, heading(page, longName));
        await fits(page, button(page, 'تعديل اسم الشخص'));
        await page.screenshot({ path: path.join(artifacts, `history-${width}-${dark ? 'dark' : 'light'}.png`) });
        await button(page, 'رجوع').click(); const card = personCard(page, longName); await fits(page, card);
        assert.equal(await card.getByText(longName, { exact: true }).evaluate(node => getComputedStyle(node).textAlign), 'right');
        await page.screenshot({ path: path.join(artifacts, `home-${width}-${dark ? 'dark' : 'light'}.png`) });
        await assertRename(page, before, longName);
      });
    }
    assert.deepEqual(browserErrors, []);
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks, browserErrors }, null, 2));
    console.log(`${checks.length} person-name UI scenarios passed; no browser errors. Artifacts: ${artifacts}`);
  } catch (error) {
    fs.writeFileSync(path.join(artifacts, 'results.json'), JSON.stringify({ passed: checks.length, checks, browserErrors, failed: activeCase, error: String(error) }, null, 2));
    throw error;
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
