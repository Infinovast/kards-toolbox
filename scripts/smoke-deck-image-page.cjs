// Start a renderer on port 5189.
const { chromium, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'deck-image-page', 'renderer');
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ channel: process.env.KARDS_BROWSER_CHANNEL || 'msedge', headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' });
    await context.addInitScript(() => {
      window.__testClipboard = '';
      window.kardsDesktop = { readClipboardText: async () => window.__testClipboard, setTheme: async () => {} };
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
    });
    const page = await context.newPage();
    await page.emulateMedia({ reducedMotion: 'reduce' });
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    const codeA = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
    const codeB = '%%14|9s;;lV;', legacyCode = '%%11|9s;;;';
    const key = code => `deck_img_local_v1_${code}`;
    const read = code => page.evaluate(key => window.__store(key), key(code));
    const clipboard = async text => {
      await page.evaluate(text => { window.__testClipboard = text; }, text);
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    };
    const full = page.getByAltText('完整卡组图', { exact: true }), mini = page.getByAltText('迷你分享图', { exact: true });
    const waitImages = async () => {
      await expect(full).toBeVisible({ timeout: 30000 });
      await expect(mini).toBeVisible({ timeout: 30000 });
      await expect.poll(() => full.evaluate(image => image.naturalWidth)).toBe(2304);
      await expect.poll(() => mini.evaluate(image => image.naturalWidth)).toBe(1368);
    };
    await page.goto(process.env.KARDS_TEST_URL || 'http://127.0.0.1:5189');
    await page.getByRole('button', { name: '进入我的卡组' }).click();
    await expect(page.getByRole('button', { name: '新卡组', exact: true })).toBeVisible({ timeout: 30000 });
    await page.getByRole('button', { name: '卡组生图', exact: true }).click();
    const input = page.getByLabel('卡组码', { exact: true });
    await expect(input).toHaveValue('');
    const appearance = page.getByRole('button', { name: '外观', exact: true });
    const openTablecloth = async () => {
      await appearance.click();
      await page.getByRole('group', { name: '生图外观' }).getByRole('button', { name: '桌布', exact: true }).click();
    };
    await expect(appearance).toBeDisabled();
    const changeBounds = await appearance.boundingBox();
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
      const downloaded = page.waitForEvent('download', { timeout: 10000 });
      await page.getByRole('button', { name, exact: true }).click();
      assert.equal((await downloaded).suggestedFilename(), filename);
    }

    await input.fill(codeB); await waitImages();
    await appearance.click();
    await expect(page.getByRole('button', { name: '卡牌异画', exact: true })).toBeDisabled();
    await page.keyboard.press('Escape');
    await expect(appearance).toBeFocused();
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
    await openTablecloth();
    await expect(page.getByRole('heading', { name: '切换桌布', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(appearance).toBeFocused();
    assert.equal(await full.getAttribute('src'), imageA, 'cancel leaves the preview unchanged');
    await openTablecloth();
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
    await openTablecloth();
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
    await page.evaluate(({ codeA, codeB, imageA, imageB }) => {
      window.__imageRequests = [];
      window.kardsDesktop.renderDeckImage = async request => {
        window.__imageRequests.push(request.code);
        if (request.code === codeA) await new Promise(resolve => setTimeout(resolve, 1600));
        return request.code === codeB ? imageB : imageA;
      };
    }, { codeA, codeB, imageA, imageB });
    await input.fill(codeA);
    await expect.poll(() => page.evaluate(() => window.__imageRequests.length)).toBeGreaterThan(0);
    await input.fill(codeB); await waitImages();
    const latest = await full.getAttribute('src');
    await page.waitForTimeout(1900);
    assert.equal(await full.getAttribute('src'), latest);
    assert.equal(await read(codeB), latest);

    for (const [width, height, mode] of [[1280, 820, 'dark'], [980, 640, 'light']]) {
      if (mode === 'light') await page.getByRole('button', { name: '切换到浅色模式', exact: true }).click();
      await page.setViewportSize({ width, height });
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

    // Both PNGs use the chosen artwork when the card is also the mini cover.
    await page.evaluate(() => { delete window.kardsDesktop.renderDeckImage; });
    const altCode = '%%11|30;;;';
    await input.fill(altCode); await waitImages();
    const baseFull = await full.getAttribute('src');
    const baseMini = await mini.getAttribute('src');
    const openArtwork = async () => {
      await appearance.click();
      await expect(page.getByRole('button', { name: '卡牌异画', exact: true })).toBeEnabled();
      await page.getByRole('button', { name: '卡牌异画', exact: true }).click();
      return page.getByRole('group', { name: '卡牌异画选项' });
    };
    const artwork = await openArtwork();
    const first = artwork.getByRole('button', { name: '古德里安（异画 1）', exact: true });
    const second = artwork.getByRole('button', { name: '古德里安（异画 2）', exact: true });
    await expect(first).toHaveAttribute('aria-pressed', 'false');
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await expect.poll(() => second.locator('img').evaluate(image => image.naturalWidth)).toBeGreaterThan(0);
    await page.screenshot({ path: path.join(output, 'alternate-art-menu.png') });
    await second.click();
    await waitImages();
    const alternateFull = await full.getAttribute('src');
    assert.notEqual(alternateFull, baseFull);
    assert.notEqual(await mini.getAttribute('src'), baseMini);
    await expect.poll(() => read(altCode)).toBe(alternateFull);
    await openArtwork();
    await expect(second).toHaveAttribute('aria-pressed', 'true');
    await first.click();
    await waitImages();
    assert.notEqual(await full.getAttribute('src'), alternateFull);
    await openArtwork();
    await expect(first).toHaveAttribute('aria-pressed', 'true');
    await expect(second).toHaveAttribute('aria-pressed', 'false');
    await first.click();
    await waitImages();
    assert.equal(await full.getAttribute('src'), baseFull);
    assert.equal(await mini.getAttribute('src'), baseMini);

    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    const settings = page.getByRole('button', { name: '卡牌库设置' });
    await settings.click();
    const filter = page.getByRole('button', { name: '筛选异画卡牌' });
    await expect(filter).toHaveAttribute('aria-pressed', 'false');
    await filter.click();
    const cardCount = Object.keys(require('../src/data/assets.json').alternateCardArt).length;
    await expect(page.locator('.library-result-count')).toContainText(String(cardCount));
    await expect(page.getByRole('button', { name: /^展开.+总部$/ })).toHaveCount(0);
    await page.getByRole('textbox', { name: '搜索卡牌' }).fill('fast_heinz');
    await page.getByRole('button', { name: '查看古德里安', exact: true }).click();
    const detail = page.getByRole('dialog', { name: '卡牌详情：古德里安', exact: true });
    const flip = detail.getByRole('button', { name: '切换异画', exact: true });
    await expect(detail.getByText('点击卡牌可以切换异画~')).toBeVisible();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await flip.click();
    await expect(flip.getByRole('img', { name: '古德里安异画 1' })).toBeVisible();
    const rotor = flip.locator('.card-detail-flip-rotor');
    await expect.poll(() => rotor.evaluate(el => new DOMMatrixReadOnly(getComputedStyle(el).transform).m11)).toBe(-1);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await flip.click();
    await expect(flip.getByRole('img', { name: '古德里安异画 2' })).toBeVisible();
    await flip.click();
    await expect(flip).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');
    await expect(detail).toHaveCount(0);
    await settings.click();
    await page.getByRole('combobox', { name: '卡牌详情样式' }).click();
    await page.getByRole('option', { name: '侧栏', exact: true }).click();
    await page.getByRole('button', { name: '查看古德里安', exact: true }).click();
    const sidebar = page.getByRole('dialog', { name: '卡牌详情', exact: true });
    await expect(sidebar.getByText('点击卡牌可以切换异画~')).toBeVisible();
    await sidebar.getByRole('button', { name: '切换异画' }).click();
    await expect(sidebar.getByRole('img', { name: '古德里安异画 1' })).toBeVisible();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: '清除筛选', exact: true }).click();
    await settings.click();
    await expect(filter).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Escape');

    const testDeck = {
      id: 'alternate-art-test', code: altCode, name: '异画测试卡组', mainNation: 'Germany', allyNation: 'Germany', totalCards: 2, warnings: [],
    };
    await page.evaluate(deck => window.__store('kards_decks', [deck], true), testDeck);
    await expect.poll(() => page.evaluate(() => window.__store('kards_decks'))).toEqual([testDeck]);
    await page.reload();
    await page.getByRole('button', { name: '卡组', exact: true }).click();
    const enterDecks = page.getByRole('button', { name: '进入我的卡组' });
    if (await enterDecks.isVisible()) await enterDecks.click();
    await page.getByRole('button', { name: '选择卡组 异画测试卡组', exact: true }).click();
    await page.getByRole('button', { name: '生成本地卡组图片' }).click();
    const previewDialog = page.getByRole('dialog').filter({ has: page.getByRole('heading', { name: '本地卡组图片 - 异画测试卡组' }) });
    const previewImage = previewDialog.getByRole('img', { name: '本地卡组图片' });
    await expect(previewImage).toBeVisible();
    const standardPreview = await previewImage.getAttribute('src');
    const modalAppearance = previewDialog.getByRole('button', { name: '外观', exact: true });
    await modalAppearance.click();
    await previewDialog.getByRole('button', { name: '卡牌异画', exact: true }).click();
    await page.keyboard.press('Escape');
    await expect(modalAppearance).toBeFocused();
    await expect(previewImage).toBeVisible();
    await modalAppearance.click();
    await previewDialog.getByRole('button', { name: '卡牌异画', exact: true }).click();
    await previewDialog.getByRole('button', { name: '古德里安（异画 1）', exact: true }).click();
    await expect(previewImage).toBeVisible();
    assert.notEqual(await previewImage.getAttribute('src'), standardPreview);
    await previewDialog.getByRole('button', { name: '切换到迷你分享图' }).click();
    await expect(previewDialog.getByRole('img', { name: '迷你分享图' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(previewDialog).toHaveCount(0);
    assert.deepEqual(errors, []);
    console.log('Deck image page renderer smoke passed: clipboard, dual PNGs, header charts, zoom, history, retries, stale requests, themes, minimum window, alternate artwork, library filter and card flips');
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
