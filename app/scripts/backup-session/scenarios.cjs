const assert = require('node:assert/strict');

module.exports = async function scenarios(browser, baseURL) {
  const checks = [];
  async function run(name, test) {
    const page = await browser.newPage();
    page.setDefaultTimeout(3000);
    try {
      await page.goto(baseURL);
      await page.waitForFunction(() => !!window.harness);
      await test(page);
      checks.push({ name, passed: true });
    } catch (e) {
      checks.push({ name, passed: false, error: e.message });
    } finally {
      await page.close();
    }
  }
  async function encrypted(page) {
    await page.evaluate(() => {
      const h = window.harness;
      h.bridge.encrypted = true;
      h.bridge.importValue = h.serialize({ ...h.emptyState(), profileName: 'Restored protected ledger' });
      window.pending = h.restoreFile();
    });
    await page.waitForFunction(() => !!window.harness.passwordRequest);
  }
  async function submitted(page) {
    await encrypted(page);
    await page.evaluate(() => window.harness.submitPassword('correct password'));
    await page.waitForFunction(() => window.harness.bridge.decryptCalls === 1);
  }
  async function lockThenUnlock(page) {
    await page.evaluate(() => window.harness.setUnlocked(false));
    await page.waitForTimeout(10);
    await page.evaluate(() => window.harness.setUnlocked(true));
    await page.waitForTimeout(10);
  }
  await run(
    'protected restore cancelled during correct-password verification never previews or restores after remount',
    async (p) => {
      await submitted(p);
      await lockThenUnlock(p);
      await p.evaluate(() => window.harness.bridge.resolveDecrypt());
      await p.waitForTimeout(80);
      const v = await p.evaluate(() => ({
        confirmations: window.harness.bridge.confirmations,
        restores: window.harness.bridge.restores.length,
        working: window.harness.backup.working,
        request: window.harness.passwordRequest,
      }));
      assert.deepEqual(v, { confirmations: 0, restores: 0, working: false, request: null });
    },
  );
  await run(
    'protected restore cancelled during wrong-password verification never opens another password prompt',
    async (p) => {
      await submitted(p);
      await lockThenUnlock(p);
      await p.evaluate(() => window.harness.bridge.rejectDecrypt());
      await p.waitForTimeout(80);
      const v = await p.evaluate(() => ({
        confirmations: window.harness.bridge.confirmations,
        working: window.harness.backup.working,
        request: window.harness.passwordRequest,
      }));
      assert.deepEqual(v, { confirmations: 0, working: false, request: null });
    },
  );
  await run(
    'wrong-password retry remains available while private host is mounted and succeeds once',
    async (p) => {
      await submitted(p);
      await p.evaluate(() => window.harness.bridge.rejectDecrypt());
      await p.waitForFunction(() => window.harness.passwordRequest?.verifying === false);
      await p.evaluate(() => window.harness.submitPassword('correct password'));
      await p.waitForFunction(() => window.harness.bridge.decryptCalls === 2);
      await p.evaluate(() => window.harness.bridge.resolveDecrypt());
      await p.waitForFunction(() => !window.harness.backup.working);
      assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 1);
      assert.equal(await p.evaluate(() => window.harness.state.profileName), 'Restored protected ledger');
    },
  );
  await run('cancel while waiting for password finishes without a restore', async (p) => {
    await encrypted(p);
    await p.evaluate(() => window.harness.cancelPassword());
    await p.waitForFunction(() => !window.harness.backup.working);
    assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
  });
  async function failedFolder(page) {
    await page.evaluate(() =>
      window.harness.setState((s) => ({
        ...s,
        backupTarget: 'folder',
        backupFolderUri: 'content://test/tree/root',
        autoBackup: true,
        lastBackup: '2026-09-12T12:00:00Z',
      })),
    );
    await page.waitForFunction(() => window.harness.backup.target === 'folder');
    await page.evaluate(() => {
      window.harness.bridge.folderError = { stage: 'report', snapshotSaved: true };
      window.harness.setState((s) => ({ ...s, profileName: 'new unsaved ledger' }));
    });
    await page.evaluate(() => window.harness.backupNow());
    assert.equal(await page.evaluate(() => window.harness.bridge.folderWrites), 1);
    await page.evaluate(() => (window.harness.bridge.folderError = null));
  }
  await run(
    'history and cancelled restore/export cannot resume automatic writes after partial failure',
    async (p) => {
      await failedFolder(p);
      await p.evaluate(() => window.harness.refreshVersions());
      await p.evaluate(() => window.harness.restoreFile());
      await p.evaluate(() => window.harness.exportPortable('report'));
      await p.evaluate(() =>
        window.harness.setState((s) => ({ ...s, profileName: 'edited after cancelled restore' })),
      );
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
      assert.equal(await p.evaluate(() => window.harness.state.lastBackup), '2026-09-12T12:00:00Z');
      assert.match(await p.evaluate(() => window.harness.backup.status), /التلقائي متوقف/);
    },
  );
  await run(
    'successful explicit retry clears failure pause and later edits back up automatically',
    async (p) => {
      await failedFolder(p);
      await p.evaluate(() => window.harness.backupNow());
      assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 2);
      await p.evaluate(() =>
        window.harness.setState((s) => ({ ...s, profileName: 'after successful retry' })),
      );
      await p.waitForTimeout(250);
      assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 3);
    },
  );
  await run('switching destinations never starts an automatic first overwrite', async (p) => {
    await failedFolder(p);
    await p.evaluate(() => window.harness.selectTarget('file'));
    await p.evaluate(() => window.harness.setState((s) => ({ ...s, profileName: 'other destination' })));
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
    assert.equal(await p.evaluate(() => window.harness.state.lastBackup), null);
  });
  await run('cold restart preserves the failure pause until successful explicit save', async (p) => {
    await failedFolder(p);
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('backup-qa')).backupWritePaused === true);
    await p.reload();
    await p.waitForFunction(() => !!window.harness);
    assert.match(await p.evaluate(() => window.harness.backup.status), /التلقائي متوقف/);
    await p.evaluate(() =>
      window.harness.setState((s) => ({ ...s, profileName: 'changed after cold restart' })),
    );
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 0);
    await p.evaluate(() => window.harness.backupNow());
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), false);
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('backup-qa')).backupWritePaused === false);
    await p.reload();
    await p.waitForFunction(() => !!window.harness);
    await p.evaluate(() =>
      window.harness.setState((s) => ({
        ...s,
        profileName: 'automatic after successful explicit save and restart',
      })),
    );
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
  });
  await run('persisted pause still requires review before replacing an existing backup', async (p) => {
    await failedFolder(p);
    await p.reload();
    await p.waitForFunction(() => !!window.harness);
    await p.evaluate(() => {
      window.harness.bridge.folderExists = true;
      window.harness.bridge.confirm = false;
    });
    await p.evaluate(() => window.harness.backupNow());
    assert.equal(await p.evaluate(() => window.harness.bridge.confirmations), 1);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 0);
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), true);
    await p.evaluate(() =>
      window.harness.setState((s) => ({ ...s, profileName: 'edited after declining overwrite' })),
    );
    await p.waitForTimeout(200);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 0);
    await p.evaluate(() => (window.harness.bridge.confirm = true));
    await p.evaluate(() => window.harness.backupNow());
    assert.equal(await p.evaluate(() => window.harness.bridge.confirmations), 2);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), false);
  });
  await run('explicit destination switch clears the durable failure pause', async (p) => {
    await failedFolder(p);
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), true);
    await p.evaluate(() => window.harness.selectTarget('file'));
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), false);
    await p.waitForFunction(() => JSON.parse(localStorage.getItem('backup-qa')).backupWritePaused === false);
    await p.reload();
    await p.waitForFunction(() => !!window.harness);
    assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), false);
    assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 0);
  });
  await run(
    'older local fallback stays read-only at hydration and persists its pause through edit and restart',
    async (p) => {
      await p.evaluate(() => {
        const old = {
          ...window.harness.emptyState(),
          profileName: 'older local copy',
          backupTarget: 'folder',
          backupFolderUri: 'content://test/tree/root',
          autoBackup: true,
          lastBackup: '2026-09-12T12:00:00Z',
        };
        localStorage.setItem('store:iou.state.v1', '{damaged-primary');
        localStorage.setItem('store:iou.state.v1.recovery', JSON.stringify(old));
      });
      await p.goto(baseURL + '?store=1');
      await p.waitForFunction(() => window.harness?.ready === true);
      assert.equal(await p.evaluate(() => window.harness.state.backupWritePaused), true);
      assert.ok(await p.evaluate(() => window.harness.recoveryNotice));
      assert.equal(await p.evaluate(() => window.harness.storageWrites.length), 0);
      assert.equal(await p.evaluate(() => localStorage.getItem('store:iou.state.v1')), '{damaged-primary');
      await p.evaluate(() => window.harness.set({ profileName: 'review edit after older recovery' }));
      await p.waitForFunction(
        () => JSON.parse(localStorage.getItem('store:iou.state.v1')).backupWritePaused === true,
      );
      await p.reload();
      await p.waitForFunction(() => window.harness?.ready === true);
      assert.equal(await p.evaluate(() => window.harness.recoveryNotice), null);
      assert.match(await p.evaluate(() => window.harness.backup.status), /التلقائي متوقف/);
      await p.evaluate(() => window.harness.set({ profileName: 'edit after second boot' }));
      await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 0);
      await p.evaluate(() => window.harness.backupNow());
      await p.waitForFunction(
        () => JSON.parse(localStorage.getItem('store:iou.state.v1')).backupWritePaused === false,
      );
      await p.reload();
      await p.waitForFunction(() => window.harness?.ready === true);
      await p.evaluate(() => window.harness.set({ profileName: 'normal edits after explicit backup' }));
      await p.waitForTimeout(200);
      assert.equal(await p.evaluate(() => window.harness.bridge.folderWrites), 1);
    },
  );
  async function externalPicker(p, encrypted = false) {
    await p.evaluate((encrypted) => {
      const h = window.harness;
      h.bridge.encrypted = encrypted;
      h.bridge.importHold = true;
      h.bridge.confirmHold = true;
      h.bridge.importValue = h.serialize({ ...h.emptyState(), profileName: 'Selected file ledger' });
      window.pending = h.restoreFile();
    }, encrypted);
    await p.waitForFunction(() => window.harness.bridge.importCalls === 1);
    await p.evaluate(() => window.harness.setUnlocked(false));
    await p.waitForFunction(() => !window.harness.bridge.hostMounted);
  }
  async function returnSelectedFile(p) {
    await p.evaluate(() => window.harness.bridge.releaseImport());
    await p.waitForTimeout(80);
  }
  async function unlockHost(p) {
    await p.evaluate(() => window.harness.setUnlocked(true));
    await p.waitForFunction(() => window.harness.bridge.hostMounted);
  }
  await run(
    'selected ordinary file waits through picker lock and requires fresh preview confirmation after unlock',
    async (p) => {
      await externalPicker(p);
      await returnSelectedFile(p);
      assert.deepEqual(
        await p.evaluate(() => ({
          working: window.harness.backup.working,
          confirms: window.harness.bridge.confirmations,
          restores: window.harness.bridge.restores.length,
        })),
        { working: true, confirms: 0, restores: 0 },
      );
      await unlockHost(p);
      await p.waitForFunction(() => window.harness.bridge.confirmations === 1);
      assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
      await p.evaluate(() => window.harness.bridge.answerConfirmation(true));
      await p.waitForFunction(() => !window.harness.backup.working);
      assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 1);
      assert.equal(await p.evaluate(() => window.harness.state.profileName), 'Selected file ledger');
    },
  );
  await run('cancelled native picker never queues a restore after unlock', async (p) => {
    await externalPicker(p);
    await p.evaluate(() => (window.harness.bridge.importValue = null));
    await returnSelectedFile(p);
    await unlockHost(p);
    await p.waitForFunction(() => !window.harness.backup.working);
    assert.equal(await p.evaluate(() => window.harness.bridge.confirmations), 0);
    assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
  });
  await run('selected encrypted file waits for private host before requesting password', async (p) => {
    await externalPicker(p, true);
    await returnSelectedFile(p);
    assert.equal(await p.evaluate(() => window.harness.passwordRequest), null);
    assert.equal(await p.evaluate(() => window.harness.bridge.decryptCalls), 0);
    await unlockHost(p);
    await p.waitForFunction(() => !!window.harness.passwordRequest);
    await p.evaluate(() => window.harness.submitPassword('synthetic password'));
    await p.waitForFunction(() => window.harness.bridge.decryptCalls === 1);
    await p.evaluate(() => window.harness.bridge.resolveDecrypt());
    await p.waitForFunction(() => window.harness.bridge.confirmations === 1);
    assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
    await p.evaluate(() => window.harness.bridge.answerConfirmation(true));
    await p.waitForFunction(() => !window.harness.backup.working);
    assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 1);
  });
  await run(
    'another lock after file preview cancels it without resuming or applying after unlock',
    async (p) => {
      await externalPicker(p);
      await returnSelectedFile(p);
      await unlockHost(p);
      await p.waitForFunction(() => window.harness.bridge.confirmations === 1);
      await p.evaluate(() => window.harness.setUnlocked(false));
      await p.waitForFunction(() => !window.harness.backup.working);
      await unlockHost(p);
      await p.waitForTimeout(80);
      assert.equal(await p.evaluate(() => window.harness.bridge.confirmations), 1);
      assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
    },
  );
  await run('another lock during imported-file verification cancels late decryption success', async (p) => {
    await externalPicker(p, true);
    await returnSelectedFile(p);
    await unlockHost(p);
    await p.waitForFunction(() => !!window.harness.passwordRequest);
    await p.evaluate(() => window.harness.submitPassword('synthetic password'));
    await p.waitForFunction(() => window.harness.bridge.decryptCalls === 1);
    await p.evaluate(() => window.harness.setUnlocked(false));
    await p.waitForFunction(() => !window.harness.bridge.hostMounted);
    await p.evaluate(() => window.harness.bridge.resolveDecrypt());
    await p.waitForFunction(() => !window.harness.backup.working);
    await unlockHost(p);
    assert.equal(await p.evaluate(() => window.harness.bridge.confirmations), 0);
    assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
    assert.equal(await p.evaluate(() => window.harness.passwordRequest), null);
  });
  await run(
    'ledger edit while selected file waits for unlock prevents applying its stale preview',
    async (p) => {
      await externalPicker(p);
      await returnSelectedFile(p);
      await p.evaluate(() => window.harness.setState((s) => ({ ...s, profileName: 'Edited while waiting' })));
      await unlockHost(p);
      await p.waitForFunction(() => window.harness.bridge.confirmations === 1);
      await p.evaluate(() => window.harness.bridge.answerConfirmation(true));
      await p.waitForFunction(() => !window.harness.backup.working);
      assert.equal(await p.evaluate(() => window.harness.bridge.restores.length), 0);
      assert.equal(await p.evaluate(() => window.harness.state.profileName), 'Edited while waiting');
      assert.ok(
        await p.evaluate(() => window.harness.bridge.toasts.some((value) => value.includes('تغيّر الدفتر'))),
      );
    },
  );
  return checks;
};
