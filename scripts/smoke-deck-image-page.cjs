// Start a renderer on port 5189, or build first and pass --desktop.
const { chromium, _electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const desktop = process.argv.includes('--desktop');
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'deck-image-page', desktop ? 'desktop' : 'renderer');
  await fs.mkdir(output, { recursive: true });
  const env = { ...process.env, KARDS_USE_DIST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const profile = desktop ? await fs.mkdtemp(path.join(output, 'profile-')) : null;
  const app = desktop ? await _electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${profile}`, '--disable-crash-reporter'], env }) : null;
  let browser = null;
  try {
    if (app) await app.evaluate(({ session }, output) => {
      session.defaultSession.on('will-download', (_event, item) => item.setSavePath(output + '/' + item.getFilename()));
    }, output);
    if (app) await app.evaluate(({ ipcMain, session }) => {
      global.__testClipboard = '';
      global.__imageRequests = [];
      ipcMain.removeHandler('clipboard:read-text');
      ipcMain.handle('clipboard:read-text', () => global.__testClipboard);
      const render = ipcMain._invokeHandlers.get('deck:render');
      ipcMain.removeHandler('deck:render');
      ipcMain.handle('deck:render', async (event, request) => {
        global.__imageRequests.push(request.code);
        if (request.code === global.__slowCode) await new Promise(resolve => setTimeout(resolve, 1600));
        return render(event, request);
      });
      session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_request, done) => done({ cancel: true }));
    });
    browser = app ? null : await chromium.launch({ channel: process.env.KARDS_BROWSER_CHANNEL || 'msedge', headless: true });
    const context = app ? app.context() : await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' });
    await context.addInitScript(({ desktop }) => {
      window.__testClipboard = '';
      if (!desktop) window.kardsDesktop = { readClipboardText: async () => window.__testClipboard, setTheme: async () => {} };
      const put = IDBObjectStore.prototype.put;
      IDBObjectStore.prototype.put = function(value, key) {
        if (window.__failImageSave && String(key).startsWith('deck_img_local_v1_')) throw new DOMException('Test disk full', 'QuotaExceededError');
        return put.call(this, value, key);
      };
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(...args) {
        if (window.__failMini && this.width === 1368) return null;
        return getContext.apply(this, args);
      };
      window.__store = (key, value, write = false) => new Promise((resolve, reject) => {
        const open = indexedDB.open('localforage');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const db = open.result, tx = db.transaction('keyvaluepairs', write ? 'readwrite' : 'readonly');
          const store = tx.objectStore('keyvaluepairs'), request = write ? store.put(value, key) : store.get(key);
          tx.oncomplete = () => { db.close(); resolve(request.result ?? null); };
          tx.onabort = tx.onerror = () => { db.close(); reject(tx.error || request.error); };
        };
      });
    }, { desktop });
    const page = app ? await app.firstWindow() : await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const codeA = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
    const codeB = '%%14|9s;;lV;', legacyCode = '%%11|9s;;;';
    const key = code => `deck_img_local_v1_${code}`;
    const read = code => page.evaluate(key => window.__store(key), key(code));
    const clipboard = async text => {
      if (app) await app.evaluate((_, text) => { global.__testClipboard = text; }, text);
      else await page.evaluate(text => { window.__testClipboard = text; }, text);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    };
    const full = page.getByAltText('完整卡组图', { exact: true }), mini = page.getByAltText('迷你分享图', { exact: true });
    const waitImages = async () => {
      await expect(full).toBeVisible({ timeout: 30000 });
      await expect(mini).toBeVisible({ timeout: 30000 });
      await expect.poll(() => full.evaluate(image => image.naturalWidth)).toBe(2304);
      await expect.poll(() => mini.evaluate(image => image.naturalWidth)).toBe(1368);
    };
    if (app) {
      await page.waitForURL('kards://app/index.html', { waitUntil: 'domcontentloaded' });
      await page.reload({ waitUntil: 'domcontentloaded' });
    }
    else await page.goto(process.env.KARDS_TEST_URL || 'http://127.0.0.1:5189');
    await expect(page.getByRole('button', { name: '新卡组', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '卡组生图', exact: true }).click();
    const input = page.getByLabel('卡组码', { exact: true });
    await expect(input).toHaveValue('');
    const changeTablecloth = page.getByRole('button', { name: '更换桌布', exact: true });
    await expect(changeTablecloth).toBeDisabled();
    const changeBounds = await changeTablecloth.boundingBox();
    const historyBounds = await page.getByRole('button', { name: '历史记录', exact: true }).boundingBox();
    assert.ok(changeBounds.x + changeBounds.width <= historyBounds.x, 'change tablecloth sits to the left of history');
    await page.getByRole('button', { name: '历史记录', exact: true }).click();
    await expect(page.getByText('暂无生图记录', { exact: false })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('button', { name: '历史记录', exact: true })).toBeFocused();
    await input.fill('invalid');
    await expect(input).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('button', { name: '下载完整卡组图', exact: true })).toBeDisabled();

    await clipboard(`剪贴板生图\n${codeA}`);
    await expect(input).toHaveValue(codeA);
    await expect(page.locator('#deck-image-input-status')).toContainText('剪贴板生图');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await waitImages();
    await expect.poll(() => read(codeA)).toBeTruthy();
    const imageA = await full.getAttribute('src');
    const miniA = await mini.getAttribute('src');
    await fs.writeFile(path.join(output, 'full-export.png'), Buffer.from(imageA.split(',')[1], 'base64'));
    const header = await sharp(Buffer.from(imageA.split(',')[1], 'base64')).extract({ left: 970, top: 12, width: 650, height: 174 }).removeAlpha().raw().toBuffer();
    for (const color of [[65, 104, 73], [71, 124, 168], [186, 123, 30]]) {
      let found = false;
      for (let offset = 0; offset < header.length; offset += 3) if (color.every((value, channel) => header[offset + channel] === value)) { found = true; break; }
      assert.ok(found, `exported PNG includes category color ${color}`);
    }
    for (const title of ['完整卡组图', '迷你分享图']) {
      const opener = page.getByRole('button', { name: `放大${title}`, exact: true });
      const originalWidth = (await opener.boundingBox()).width;
      await opener.click();
      const zoom = page.getByRole('dialog', { name: `${title}放大预览`, exact: true });
      await expect(zoom).toBeVisible();
      assert.equal(await page.locator('.card-detail-overlay .card-detail-backdrop').evaluate(element => getComputedStyle(element).backdropFilter), 'blur(12px)');
      await expect(zoom.getByRole('img')).toBeVisible();
      await expect.poll(async () => (await zoom.getByRole('img').boundingBox()).width).toBeGreaterThan(originalWidth);
      await page.screenshot({ path: path.join(output, title === '完整卡组图' ? 'full-zoom.png' : 'mini-zoom.png') });
      await page.keyboard.press('Escape');
      await expect(zoom).toHaveCount(0);
      await expect(opener).toBeFocused();
    }
    for (const [name, filename] of [['下载完整卡组图', '剪贴板生图.png'], ['下载迷你分享图', '剪贴板生图-mini.png']]) {
      if (app) {
        const target = path.join(output, filename);
        await fs.rm(target, { force: true });
        await page.getByRole('button', { name, exact: true }).click();
        await expect.poll(async () => (await fs.stat(target).catch(() => null))?.size || 0).toBeGreaterThan(0);
      } else {
        const downloaded = page.waitForEvent('download', { timeout: 10000 });
        await page.getByRole('button', { name, exact: true }).click();
        assert.equal((await downloaded).suggestedFilename(), filename);
      }
    }

    await input.fill(codeB); await waitImages();
    const imageB = await full.getAttribute('src');
    await clipboard(`剪贴板生图\n${codeA}`);
    await expect(input).toHaveValue(codeB); // Unchanged clipboard must not replace manual edits.

    // An older cache has only a full image. History must show it verbatim and generate the mini.
    await page.evaluate(async ({ code, image }) => {
      await window.__store(`deck_img_local_v1_${code}`, image, true);
      await window.__store('deck_img_local_v1_invalid', image, true);
    }, { code: legacyCode, image: imageA });
    await page.getByRole('button', { name: '历史记录', exact: true }).click();
    const history = page.getByRole('dialog', { name: '生图历史记录', exact: true });
    await expect(history.getByRole('listitem')).toHaveCount(3);
    await expect(history.getByAltText('历史卡组图缩略图', { exact: true }).first()).toBeVisible();
    await expect(history.getByAltText('历史迷你图缩略图', { exact: true }).first()).toBeVisible();
    assert.equal(await history.evaluate(element => getComputedStyle(element).borderRadius), '9px');
    await history.getByRole('button').filter({ hasText: legacyCode }).click();
    await expect(input).toHaveValue(legacyCode); await waitImages();
    assert.equal(await full.getAttribute('src'), imageA);
    await page.getByRole('button', { name: '历史记录', exact: true }).click();
    await history.getByRole('button').filter({ hasText: codeA }).click();
    await waitImages();
    assert.equal(await mini.getAttribute('src'), miniA);

    // Reuse the image picker, including headquarters descriptions, without changing the app background.
    const applicationTablecloth = await page.locator('[data-tablecloth]').getAttribute('data-tablecloth');
    await changeTablecloth.click();
    await expect(page.getByRole('heading', { name: '切换桌布', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(changeTablecloth).toBeFocused();
    assert.equal(await full.getAttribute('src'), imageA, 'cancel leaves the preview unchanged');
    await changeTablecloth.click();
    const hqTablecloth = require('../src/data/tablecloths.json').tablecloths.find(item => item.type === 'headquarters');
    const headquarters = require('../src/data/headquarters.json').headquarters.find(item => item.groupId === hqTablecloth.headquartersId);
    const headquartersChoice = page.getByRole('button', { name: `选择桌布 ${hqTablecloth.name}`, exact: true });
    await headquartersChoice.hover();
    await expect(page.getByRole('tooltip')).toHaveText(headquarters.brief);
    await headquartersChoice.click();
    await expect(page.getByRole('heading', { name: '切换桌布', exact: true })).toHaveCount(0);
    await waitImages();
    assert.notEqual(await full.getAttribute('src'), imageA, 'tablecloth changes the full image');
    assert.notEqual(await mini.getAttribute('src'), miniA, 'tablecloth changes the mini image');
    const changedFull = await full.getAttribute('src');
    const changedMini = await mini.getAttribute('src');
    await expect.poll(() => read(codeA)).toBe(changedFull);
    await changeTablecloth.click();
    await expect(headquartersChoice).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('Escape');
    assert.equal(await page.locator('[data-tablecloth]').getAttribute('data-tablecloth'), applicationTablecloth);
    await input.fill(codeB); await waitImages();
    await page.getByRole('button', { name: '历史记录', exact: true }).click();
    await history.getByRole('button').filter({ hasText: codeA }).click();
    await waitImages();
    assert.equal(await full.getAttribute('src'), changedFull, 'history restores the updated full image');
    assert.equal(await mini.getAttribute('src'), changedMini, 'history restores the updated mini image');

    // Separate render failures and storage failures keep successful previews available.
    await page.evaluate(() => { window.__failMini = true; window.__failImageSave = true; });
    await input.fill(codeB);
    await expect(full).toBeVisible({ timeout: 30000 });
    await expect(page.getByText('无法创建迷你分享图', { exact: true })).toBeVisible();
    await expect(page.getByRole('alert').filter({ hasText: '图片已生成，但历史记录未能保存。请重试生成。' })).toBeVisible();
    await page.evaluate(() => { window.__failMini = false; window.__failImageSave = false; });
    await page.getByRole('button', { name: '重试生成', exact: true }).last().click();
    await waitImages();

    // A slow earlier request must never overwrite a newer code or its cache.
    if (app) await app.evaluate((_, code) => { global.__slowCode = code; global.__imageRequests = []; }, codeA);
    else await page.evaluate(({ codeA, codeB, imageA, imageB }) => {
      window.__imageRequests = [];
      window.kardsDesktop.renderDeckImage = async request => {
        window.__imageRequests.push(request.code);
        if (request.code === codeA) await new Promise(resolve => setTimeout(resolve, 1600));
        return request.code === codeB ? imageB : imageA;
      };
    }, { codeA, codeB, imageA, imageB });
    await input.fill(codeA);
    await expect.poll(() => app ? app.evaluate(() => global.__imageRequests.length) : page.evaluate(() => window.__imageRequests.length)).toBeGreaterThan(0);
    await input.fill(codeB); await waitImages();
    const latest = await full.getAttribute('src');
    await page.waitForTimeout(1900);
    assert.equal(await full.getAttribute('src'), latest);
    assert.equal(await read(codeB), latest);

    for (const [width, height, mode] of [[1280, 820, 'dark'], [980, 640, 'light']]) {
      if (mode === 'light') await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click();
      if (app) await app.evaluate(({ BrowserWindow }, size) => BrowserWindow.getAllWindows()[0].setContentSize(...size), [width, height]);
      else await page.setViewportSize({ width, height });
      await page.waitForTimeout(350); // Capture the settled theme after its existing transition.
      await page.screenshot({ path: path.join(output, `${mode}.png`) });
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: '历史记录', exact: true }).click();
      await expect(history).toBeVisible();
      await expect(history.getByAltText('历史迷你图缩略图', { exact: true }).first()).toBeVisible();
      await page.screenshot({ path: path.join(output, `${mode}-history.png`) });
      await page.keyboard.press('Escape');
    }
    await page.getByRole('button', { name: '卡组', exact: true }).click();
    await clipboard(`重新进入\n${codeB}`);
    const prompt = page.getByRole('dialog');
    if (await prompt.count()) await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '卡组生图', exact: true }).click();
    await expect(input).toHaveValue(codeB); await waitImages();
    assert.deepEqual(errors, []);
    console.log(`Deck image page ${desktop ? 'desktop' : 'renderer'} smoke passed: clipboard, dual PNGs, header charts, image zoom, history thumbnails, legacy caches, errors/retries, stale requests, themes and minimum window`);
  } finally {
    if (app) await app.close();
    if (browser) await browser.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
