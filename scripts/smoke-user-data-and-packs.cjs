// Run against a local renderer server; uses a fresh, isolated browser profile.
// KARDS_TEST_URL can override the default http://127.0.0.1:5188.
const { chromium, _electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');

async function main() {
  const desktop = process.argv.includes('--desktop');
  const root = path.resolve(__dirname, '..');
  const base = desktop ? 'kards://app' : process.env.KARDS_TEST_URL || 'http://127.0.0.1:5188';
  const output = path.join(root, 'test-results', 'user-data-and-packs', desktop ? 'desktop' : 'renderer');
  await fs.mkdir(output, { recursive: true });
  const profile = desktop ? await fs.mkdtemp(path.join(output, 'profile-')) : null;
  const env = { ...process.env, KARDS_USE_DIST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = desktop ? await _electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${profile}`, '--disable-crash-reporter'], env }) : null;
  if (app) await app.evaluate(({ net }) => {
    const fetch = net.fetch.bind(net);
    net.fetch = (input, init) => /^https?:/.test(typeof input === 'string' ? input : input.url || String(input))
      ? Promise.resolve(new Response('Offline test', { status: 503 })) : fetch(input, init);
  });
  const browser = desktop ? null : await chromium.launch({ headless: true, ...(process.env.KARDS_BROWSER_CHANNEL ? { channel: process.env.KARDS_BROWSER_CHANNEL } : {}) });
  const context = app ? app.context() : await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' });
  await context.addInitScript(() => {
    const get = IDBObjectStore.prototype.get;
    const put = IDBObjectStore.prototype.put;
    window.__userDataWrites = [];
    IDBObjectStore.prototype.get = function(key) {
      if (sessionStorage.getItem('test_fail_read') === key) throw new Error('test read failed');
      return get.call(this, key);
    };
    IDBObjectStore.prototype.put = function(value, key) {
      if (String(key).startsWith('kards_')) window.__userDataWrites.push(key);
      if (sessionStorage.getItem('test_fail_write') === key) throw new DOMException('test disk full', 'QuotaExceededError');
      if (sessionStorage.getItem('test_fail_write_once') === key) {
        sessionStorage.removeItem('test_fail_write_once');
        throw new DOMException('test disk full', 'QuotaExceededError');
      }
      return put.call(this, value, key);
    };
    const storage = (key, value, write) => new Promise((resolve, reject) => {
      const open = indexedDB.open('localforage');
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const db = open.result;
        try {
          const tx = db.transaction('keyvaluepairs', write ? 'readwrite' : 'readonly');
          const store = tx.objectStore('keyvaluepairs');
          const request = write ? store.put(value, key) : store.get(key);
          tx.oncomplete = () => { db.close(); resolve(request.result ?? null); };
          tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || request.error); };
        } catch (error) { db.close(); reject(error); }
      };
    });
    window.__testStore = { getItem: key => storage(key), setItem: (key, value) => storage(key, value, true) };
  });
  const page = app ? await app.firstWindow() : await context.newPage();
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(base) || /^(data:|blob:)/.test(route.request().url()) ? route.continue() : route.abort());
  const storeGet = key => page.evaluate(key => window.__testStore.getItem(key), key);
  try {
    await page.goto(desktop ? `${base}/index.html` : base);
    await expect(page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    await page.waitForFunction(() => window.__userDataWrites.includes('kards_custom_tablecloths'));
    const fixture = { id: 'safety-fixture', name: '原有卡组', mainNation: 'Germany', allyNation: 'Soviet', code: '%%14|;;;', isFavorite: false, isArena: false, totalCards: 0, warnings: [] };
    await page.evaluate(async deck => {
      await window.__testStore.setItem('kards_decks', [deck]);
      sessionStorage.setItem('test_fail_read', 'kards_settings');
    }, fixture);
    await page.reload();
    await expect(page.getByRole('heading', { name: '本地数据读取失败' })).toBeVisible();
    assert.equal((await storeGet('kards_decks'))[0].name, '原有卡组');
    assert.deepEqual(await page.evaluate(() => window.__userDataWrites), [], 'failed startup must not start any user-data writes');
    await page.evaluate(() => sessionStorage.removeItem('test_fail_read'));
    await page.getByRole('button', { name: '重试读取', exact: true }).click();
    await expect(page.getByRole('button', { name: '选择卡组 原有卡组', exact: true })).toBeVisible();

    await page.evaluate(() => sessionStorage.setItem('test_fail_write', 'kards_settings'));
    await page.getByRole('button', { name: '切换到浅色模式' }).click();
    await expect(page.getByRole('alert').filter({ hasText: '本地数据保存失败' })).toBeVisible();
    await page.evaluate(() => sessionStorage.removeItem('test_fail_write'));
    await page.getByRole('button', { name: '重试保存', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '本地数据保存失败' })).toHaveCount(0);
    await expect.poll(async () => (await storeGet('kards_settings')).displayMode).toBe('light');

    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.evaluate(() => sessionStorage.setItem('test_fail_write_once', 'kards_settings'));
    const backupContent = JSON.stringify({
      app: 'kards-toolbox', schemaVersion: 1, data: { kards_decks: [], kards_settings: { displayMode: 'dark' } },
    });
    if (app) {
      const backupFile = path.join(output, 'restore-fixture.json');
      await fs.writeFile(backupFile, backupContent);
      await app.evaluate(({ dialog }, file) => { dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] }); }, backupFile);
      await page.getByRole('button', { name: '导入备份', exact: true }).click();
    } else {
      const chooser = page.waitForEvent('filechooser');
      await page.getByRole('button', { name: '导入备份', exact: true }).click();
      await (await chooser).setFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(backupContent) });
    }
    await expect(page.getByText(/已回滚原数据/)).toBeVisible();
    assert.equal((await storeGet('kards_decks'))[0].id, fixture.id);
    assert.equal((await storeGet('kards_settings')).displayMode, 'light');
    assert.equal(await storeGet('kards_user_restore_journal_v1'), null);
    await page.getByRole('button', { name: '恢复自动备份', exact: true }).click();
    const recovery = page.getByRole('dialog', { name: '恢复自动备份', exact: true });
    await expect(recovery).toBeVisible();
    await recovery.getByRole('button', { name: '取消', exact: true }).click();

    // Explicit builder saves stay in the editor until the actual write succeeds.
    await page.getByRole('button', { name: '卡组', exact: true }).click();
    await page.getByRole('button', { name: '选择卡组 原有卡组', exact: true }).dblclick();
    const builder = page.getByLabel('卡组构筑', { exact: true });
    await expect(builder).toBeVisible();
    await page.getByLabel('卡组名称', { exact: true }).fill('可靠保存的卡组');
    await page.evaluate(() => sessionStorage.setItem('test_fail_write_once', 'kards_decks'));
    await page.getByRole('button', { name: '保存并退出', exact: true }).click();
    await page.getByRole('dialog', { name: '确认保存修改' }).getByRole('button', { name: '保存', exact: true }).click();
    await expect(builder.getByRole('status').filter({ hasText: '卡组保存失败' })).toBeVisible();
    assert.equal((await storeGet('kards_decks'))[0].name, fixture.name);
    await page.getByRole('button', { name: '保存并退出', exact: true }).click();
    await page.getByRole('dialog', { name: '确认保存修改' }).getByRole('button', { name: '保存', exact: true }).click();
    await expect(builder).toHaveCount(0);
    assert.equal((await storeGet('kards_decks'))[0].name, '可靠保存的卡组');

    await page.getByRole('button', { name: '卡包', exact: true }).click();
    const history = page.getByLabel('开包历史', { exact: true });
    await expect(history).toContainText('100×0+330×0=0');
    await page.evaluate(() => { Math.random = () => 0.999999; });
    await page.getByRole('button', { name: '打开卡包', exact: true }).click();
    await expect(page.locator('.pack-opening-stage')).toBeVisible();
    await expect(history).toContainText('100×1+330×0=100');
    await expect(page.locator('[data-reward-kind="wildcard"]')).toHaveCount(0);
    await page.getByRole('button', { name: '全部翻开', exact: true }).click();
    await expect(page.locator('.pack-reveal-card[data-state="revealed"]')).toHaveCount(5);
    await page.getByRole('button', { name: '选择卡包', exact: true }).click();
    await page.getByRole('group', { name: '卡包规格' }).getByRole('button', { name: '军官包', exact: true }).click();
    await expect(page.getByLabel('单卡基础出卡概率')).toContainText('32.1%');

    // A history write failure does not open an unrecorded pack or increment totals.
    await page.evaluate(() => sessionStorage.setItem('test_fail_write_once', 'kards_pack_history_v1'));
    await page.getByRole('button', { name: '打开卡包', exact: true }).click();
    await expect(page.getByRole('alert').filter({ hasText: '无法打开卡包' })).toBeVisible();
    await expect(page.locator('.pack-opening-stage')).toHaveCount(0);
    await expect(history).toContainText('100×1+330×0=100');
    await page.getByRole('button', { name: '打开卡包', exact: true }).click();
    await expect(history).toContainText('100×1+330×1=430');
    await expect(page.locator('[data-reward-kind="wildcard"]')).toHaveCount(7);
    await page.getByRole('button', { name: '全部翻开', exact: true }).click();
    await expect(page.locator('.pack-reveal-card[data-state="revealed"]')).toHaveCount(7);
    await page.getByRole('button', { name: '查看通用精英万能牌', exact: true }).first().click();
    const wildcard = page.getByRole('dialog', { name: '通用万能牌', exact: true });
    await expect(wildcard.getByAltText('通用精英万能牌')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(wildcard).toHaveCount(0);
    await expect.poll(async () => (await storeGet('kards_pack_history_v1')).rarities.Elite).toBe(12);
    await page.screenshot({ path: path.join(output, 'officer-wildcards.png') });

    await page.getByRole('button', { name: '选择卡包', exact: true }).click();
    await page.getByRole('button', { name: '切换到深色模式' }).click();
    for (const [width, height] of [[1280, 820], [980, 640]]) {
      await page.setViewportSize({ width, height });
      for (const theme of ['dark', 'light']) {
        if (theme === 'light') await page.getByRole('button', { name: '切换到浅色模式' }).click();
        await expect(page.locator('.pack-choice-art > img').first()).toBeVisible();
        const geometry = await page.locator('.pack-page-toolbar').evaluate(element => {
          const bounds = [...element.children].map(child => { const rect = child.getBoundingClientRect(); return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom }; });
          const page = element.closest('.card-packs-page');
          return { bounds, scroll: page.scrollHeight - page.clientHeight, body: document.documentElement.scrollWidth - innerWidth };
        });
        assert.ok(geometry.bounds[0].right <= geometry.bounds[1].left && geometry.bounds[1].right <= geometry.bounds[2].left, `toolbar collision at ${width}, ${theme}`);
        assert.ok(geometry.scroll <= 1 && geometry.body <= 1, `unexpected overflow at ${width}, ${theme}`);
        await expect(history.getByLabel('精英 12', { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(output, `packs-${width}-${theme}.png`) });
        if (theme === 'light') await page.getByRole('button', { name: '切换到深色模式' }).click();
      }
    }
    await page.reload();
    await page.getByRole('button', { name: '卡包', exact: true }).click();
    await expect(history).toContainText('100×1+330×1=430');
    await expect(history.getByLabel('精英 12', { exact: true })).toBeVisible();
    assert.deepEqual(errors, [], 'no uncaught renderer errors');
    console.log(`${desktop ? 'Production desktop' : 'Renderer'} UI checks passed: failed-load protection, save retry, restore rollback, explicit builder saves, exact pack history, Common wildcard reveal, persistence and 980/1280 layouts.`);
  } finally { if (app) await app.close(); else { await context.close(); await browser.close(); } }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
