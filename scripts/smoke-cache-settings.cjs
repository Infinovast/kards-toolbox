// Requires a local Vite renderer. All card data, downloads, and storage are isolated fixtures.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium, expect } = require('playwright/test');

const base = process.env.KARDS_TEST_URL || 'http://127.0.0.1:5189';
const output = path.resolve('test-results/cache-settings-ui');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
const result = { checks: [], layouts: [], nativeDialogs: [], externalRequests: [], pageErrors: [] };
const fixtureCards = Array.from({ length: 110 }, (_, index) => {
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const importId = alphabet[Math.floor(index / 62)] + alphabet[index % 62];
  const cardId = `fixture_card_${index}`;
  return {
    id: index + 90000, cardId, importId, reserved: false,
    imageUrl: `https://www.kardsplayer.com/images/card/v1/zh-Hans/${cardId}.png`,
    thumbUrl: `https://www.kardsplayer.com/images/card/v1/zh-Hans/thumb/${cardId}.png`,
    json: { id: cardId, import_id: importId, faction: 'Germany', type: 'infantry', rarity: 'Standard', set: 'Base',
      kredits: 1, operationCost: 1, attack: 1, defense: 1, attributes: [],
      title: { 'zh-Hans': `合成卡牌${index + 1}`, 'en-EN': `Fixture ${index + 1}` }, text: { 'zh-Hans': '' } },
  };
});

async function context(browser) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 820 }, reducedMotion: 'reduce' });
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url === new URL('/data/cards.json', base).href) return route.fulfill({ json: { cards: fixtureCards } });
    if (url.startsWith(base) || /^(data:|blob:)/.test(url)) return route.continue();
    result.externalRequests.push(url);
    return route.abort();
  });
  await ctx.addInitScript(({ png }) => {
    window.__imageRequests = [];
    window.__holdDownloads = false;
    window.__releaseDownloads = [];
    window.__cacheMutations = [];
    window.__failCacheKeys = false;
    const put = IDBObjectStore.prototype.put, remove = IDBObjectStore.prototype.delete, keys = IDBObjectStore.prototype.openKeyCursor;
    IDBObjectStore.prototype.put = function(value, key) {
      window.__cacheMutations.push({ operation: 'put', key: String(key) });
      return put.call(this, value, key);
    };
    IDBObjectStore.prototype.delete = function(key) {
      window.__cacheMutations.push({ operation: 'delete', key: String(key) });
      return remove.call(this, key);
    };
    IDBObjectStore.prototype.openKeyCursor = function(...args) {
      if (window.__failCacheKeys) throw new Error('Synthetic inventory read failure');
      return keys.apply(this, args);
    };
    window.kardsDesktop = {
      setTheme: async () => true, readClipboardText: async () => '',
      fetchCardImage: async url => {
        window.__imageRequests.push(url);
        if (window.__holdDownloads) await new Promise(resolve => window.__releaseDownloads.push(resolve));
        return png;
      },
    };
  }, { png });
  const page = await ctx.newPage();
  page.on('dialog', dialog => { result.nativeDialogs.push({ type: dialog.type(), message: dialog.message() }); void dialog.dismiss(); });
  page.on('pageerror', error => result.pageErrors.push(error.message));
  await page.goto(base);
  await expect(page.getByRole('button', { name: '设置', exact: true })).toBeVisible();
  return { ctx, page };
}

async function seed(page, { count = 8, cached = 3, pending = true, withBatch = false } = {}) {
  return page.evaluate(async ({ cards, count, cached, pending, withBatch, png }) => {
    const { default: store } = await import('/node_modules/.vite/deps/localforage.js');
    const { mergeWeatherCardRecords } = await import('/src/lib/cardData.ts');
    const { encodeDeckCode } = await import('/src/lib/deckCode.ts');
    await store.clear();
    const records = mergeWeatherCardRecords(cards.slice(0, count));
    const snapshot = { cards: records, source: 'kardsplayer', fetchedAt: '2026-11-20T00:00:00Z' };
    await store.setItem('kards_settings', { displayMode: 'dark', showWelcomePage: false });
    await store.setItem('kards_card_database_v1', {
      schemaVersion: 1, active: snapshot, previous: { ...snapshot, fetchedAt: '2026-11-19T00:00:00Z' },
      ...(pending ? { pending: { ...snapshot, cards: records.filter(card => card.cardId !== cards[0].cardId) } } : {}),
    });
    const code = encodeDeckCode('Germany', 'Britain', new Map([[cards[0].importId, 1]]));
    await store.setItem('kards_decks', [{ id: 'fixture-deck', name: '合成卡组', code, mainNation: 'Germany', allyNation: 'Britain',
      isFavorite: false, isArena: false, totalCards: 1, warnings: [] }]);
    await store.setItem('kards_custom_categories', [{ id: 'fixture-category', name: '合成分类', backs: [] }]);
    for (const card of records.slice(0, cached)) for (const url of [card.imageUrl, card.thumbUrl]) {
      await store.setItem(`kards_card_image_v2_${card.importId}_${encodeURIComponent(url)}`, png);
    }
    await store.setItem('deck_img_local_v1_fixture', png);
    await store.setItem('kards_card_image_v2_old_obsolete', png);
    if (withBatch) {
      await store.setItem('kards_card_image_batch_v1', { importIds: records.map(card => card.importId), startedAt: snapshot.fetchedAt });
    }
    return { count: records.length, cached, code };
  }, { cards: fixtureCards, count, cached, pending, withBatch, png });
}

async function read(page, key) {
  return page.evaluate(async key => (await import('/node_modules/.vite/deps/localforage.js')).default.getItem(key), key);
}

async function resetMutations(page) {
  await page.evaluate(() => { window.__cacheMutations = []; window.__imageRequests = []; });
}

async function mutations(page, operation, key) {
  return page.evaluate(({ operation, key }) => window.__cacheMutations.filter(item => item.operation === operation && item.key === key).length, { operation, key });
}

async function dialog(page) {
  const top = page.locator('[role="dialog"][aria-modal="true"]').last();
  await expect(top).toBeVisible();
  const titleId = await top.getAttribute('aria-labelledby');
  assert.ok(titleId, 'application confirmation has an accessible title');
  return page.locator(`[role="dialog"][aria-labelledby=${JSON.stringify(titleId)}]`);
}

async function cancelDialog(page, opener, escape = false) {
  const modal = await dialog(page);
  await expect(modal).toBeVisible();
  assert.equal(await modal.evaluate(element => element.contains(document.activeElement)), true, 'confirmation owns focus');
  const confirm = modal.locator('[data-dialog-confirm]');
  const cancel = modal.locator('[data-dialog-cancel]');
  await expect(confirm).toHaveCount(1);
  await expect(cancel).toHaveCount(1);
  await cancel.focus();
  await page.keyboard.press('Shift+Tab');
  assert.equal(await modal.evaluate(element => element.contains(document.activeElement)), true, 'Tab remains in the confirmation');
  if (escape) await page.keyboard.press('Escape');
  else await cancel.click();
  await expect(modal).not.toBeVisible();
  await expect(opener).toBeFocused();
}

async function confirmDialog(page) {
  const modal = await dialog(page);
  await expect(modal).toBeVisible();
  await modal.locator('[data-dialog-confirm]').click();
  await expect(modal).not.toBeVisible();
}

async function settingsTests(browser) {
  const { ctx, page } = await context(browser);
  try {
    const fixture = await seed(page, { withBatch: true });
    await page.evaluate(async png => {
      const { loadNewsImage } = await import('/src/lib/newsImages.ts');
      await loadNewsImage(png, new AbortController().signal);
    }, png);
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const cache = page.getByRole('region', { name: '本地缓存', exact: true });
    await expect(cache.getByRole('button', { name: '刷新缓存清单', exact: true })).toHaveCount(0);
    const maintenance = cache.getByLabel('缓存维护', { exact: true });
    const summary = maintenance.locator(':scope > summary');
    const gridSection = maintenance.getByRole('region', { name: '卡图网格', exact: true });
    await expect(gridSection).toBeHidden();
    await summary.click();
    await expect(gridSection.getByRole('heading', { name: '卡图网格', exact: true })).toBeVisible();
    await expect(gridSection.getByRole('button', { name: `已缓存（${fixture.cached}）`, exact: true })).toBeVisible();
    await expect(gridSection.getByRole('combobox', { name: '缓存查看范围' })).toHaveAttribute('data-value', 'recent');
    for (const width of [980, 1280, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      const layout = await cache.locator('dl').first().evaluate(element => {
        const columns = [...element.children].map(item => {
          const rect = item.getBoundingClientRect();
          return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, overflow: item.scrollWidth > item.clientWidth + 1 };
        });
        return { columns, overflow: element.scrollWidth > element.clientWidth + 1 };
      });
      assert.equal(layout.columns.length, 5);
      assert.ok(Math.max(...layout.columns.map(item => item.y)) - Math.min(...layout.columns.map(item => item.y)) < 2, `${width}px has a single statistics row`);
      assert.equal(layout.overflow, false);
      assert.ok(layout.columns.every(item => !item.overflow), 'statistics content fits');
      const later = layout.columns.slice(1).map(item => item.width);
      assert.ok(Math.max(...later) - Math.min(...later) < 2, 'the action statistics share equal width');
      assert.ok(layout.columns[0].width <= later[0] + 1, 'the basic card count does not displace action statistics');
      result.layouts.push({ width, ...layout });
      const grid = gridSection.getByLabel('卡牌缓存图片清单', { exact: true });
      await expect(grid.locator('article')).toHaveCount(3);
      await expect(grid.locator('article').first().locator('img')).toHaveCount(2);
      const template = await grid.evaluate(element => getComputedStyle(element).gridTemplateColumns.split(' ').length);
      assert.equal(template, width < 1024 ? 5 : width < 1280 ? 6 : width < 1536 ? 8 : 10);
      const toolbarPositions = await Promise.all([
        gridSection.getByRole('textbox', { name: '搜索缓存卡牌' }),
        gridSection.getByRole('combobox', { name: '缓存查看范围' }),
        gridSection.getByRole('group', { name: '缓存状态分类' }),
        gridSection.getByRole('button', { name: /^补全当前范围/ }),
      ].map(control => control.boundingBox()));
      assert.ok(toolbarPositions.every(box => Math.abs(box.y - toolbarPositions[0].y) < 2 && box.height === 36));
      const toolbar = await gridSection.locator('.cache-grid-toolbar').boundingBox();
      const download = toolbarPositions.at(-1);
      assert.ok(Math.abs(toolbar.x + toolbar.width - download.x - download.width) < 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await cache.screenshot({ path: path.join(output, `cache-settings-${width}-maintenance.png`) });
    }
    const search = gridSection.getByRole('textbox', { name: '搜索缓存卡牌', exact: true });
    await search.fill(fixtureCards[0].cardId);
    await expect(gridSection.locator('article')).toHaveCount(1);
    await gridSection.getByRole('button', { name: '清除缓存卡牌搜索', exact: true }).click();
    await expect(gridSection.locator('article')).toHaveCount(fixture.cached);
    await expect(gridSection.getByRole('navigation', { name: '分页', exact: true })).toBeVisible();
    result.checks.push('980/1280/1920 single statistics and filter rows, responsive grid, search and pagination inside maintenance');

    await page.setViewportSize({ width: 1280, height: 820 });
    await summary.click();
    await expect(gridSection).toBeHidden();
    for (const width of [980, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      await cache.screenshot({ path: path.join(output, `cache-settings-${width}.png`) });
    }
    const full = cache.getByRole('button', { name: '删除全部卡牌大图', exact: true });
    const clearNews = cache.getByRole('button', { name: '删除全部新闻图片缓存', exact: true });
    await expect(clearNews).toBeEnabled();
    await clearNews.click();
    await cancelDialog(page, clearNews, true);
    await clearNews.click();
    await confirmDialog(page);
    await expect(clearNews).toBeDisabled();
    await expect(cache.getByLabel('新闻图片占用空间')).toHaveText('0 B');
    assert.equal(await read(page, 'deck_img_local_v1_fixture'), png);
    await expect(full).toBeEnabled();
    result.checks.push('news image cache persists across reload, cancels cleanly and deletes independently of card and deck images');
    await resetMutations(page);
    await full.click();
    await cancelDialog(page, full, true);
    assert.equal(await mutations(page, 'delete', `kards_card_image_v2_${fixtureCards[0].importId}_${encodeURIComponent(fixtureCards[0].imageUrl)}`), 0);
    await full.click();
    await confirmDialog(page);
    const imageKey = `kards_card_image_v2_${fixtureCards[0].importId}_${encodeURIComponent(fixtureCards[0].imageUrl)}`;
    await expect.poll(() => read(page, imageKey)).toBeNull();
    assert.equal(await mutations(page, 'delete', imageKey), 1);
    result.checks.push('cache delete Escape cancels, confirm deletes each selected image once, focus returns');

    // A transient inventory enumeration failure should offer a local retry.
    await page.getByRole('button', { name: '卡组', exact: true }).click();
    await page.evaluate(() => { window.__failCacheKeys = true; });
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(cache.getByRole('alert').filter({ hasText: /读取本地缓存清单失败/ })).toBeVisible();
    const retry = cache.getByRole('button', { name: /重试|重新读取/ }).filter({ hasText: /重试|重新读取/ });
    await expect(retry).toHaveCount(1);
    await page.evaluate(() => { window.__failCacheKeys = false; });
    await retry.click();
    await expect(cache.getByRole('alert')).toHaveCount(0);
    await expect(cache.getByRole('button', { name: '刷新缓存清单', exact: true })).toHaveCount(0);
    result.checks.push('inventory read failure retries without a persistent refresh action');

    const updater = page.getByRole('region', { name: '卡牌数据更新', exact: true });
    const apply = updater.getByRole('button', { name: '应用更新', exact: true });
    await resetMutations(page);
    await apply.click();
    await cancelDialog(page, apply);
    assert.equal(await mutations(page, 'put', 'kards_card_database_v1'), 0);
    await apply.click(); await confirmDialog(page);
    await expect.poll(() => mutations(page, 'put', 'kards_card_database_v1')).toBe(1);
    const rollback = updater.getByRole('button', { name: '回退上次数据', exact: true });
    await resetMutations(page);
    await rollback.click(); await cancelDialog(page, rollback, true);
    assert.equal(await mutations(page, 'put', 'kards_card_database_v1'), 0);
    await rollback.click(); await confirmDialog(page);
    await expect.poll(() => mutations(page, 'put', 'kards_card_database_v1')).toBe(1);
    await updater.locator('summary').filter({ hasText: '已下载的卡牌数据' }).click();
    const removePrevious = updater.getByRole('button', { name: '删除回退数据', exact: true });
    await resetMutations(page);
    await removePrevious.click(); await cancelDialog(page, removePrevious);
    assert.equal(await mutations(page, 'put', 'kards_card_database_v1'), 0);
    await removePrevious.click(); await confirmDialog(page);
    await expect.poll(async () => (await read(page, 'kards_card_database_v1')).previous).toBeUndefined();
    assert.equal(await mutations(page, 'put', 'kards_card_database_v1'), 1);
    result.checks.push('card database apply, rollback, and section deletion use app confirmations, no native dialogs');

    await page.getByRole('button', { name: '卡组', exact: true }).click();
    await page.getByRole('button', { name: '选择卡组 合成卡组', exact: true }).click();
    await page.getByRole('button', { name: '更换卡背', exact: true }).click();
    const picker = page.getByRole('dialog', { name: '更换卡背', exact: true });
    const category = picker.getByRole('button', { name: '删除分类', exact: true });
    await category.click(); await cancelDialog(page, category, true);
    await expect(picker).toBeVisible();
    assert.equal((await read(page, 'kards_custom_categories')).length, 1);
    await category.click(); await confirmDialog(page);
    await expect.poll(async () => (await read(page, 'kards_custom_categories')).length).toBe(0);
    await expect(picker).toBeVisible();
    result.checks.push('nested category confirmation cancels independently and returns to the card-back picker');
  } finally { await ctx.close(); }
}

async function batchTests(browser) {
  const { ctx, page } = await context(browser);
  try {
    await seed(page, { count: 110, cached: 0, pending: false });
    await page.reload();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    const cache = page.getByRole('region', { name: '本地缓存', exact: true });
    await cache.getByLabel('缓存维护', { exact: true }).locator(':scope > summary').click();
    await cache.getByRole('button', { name: /^未缓存（/ }).click();
    const pager = cache.getByRole('navigation', { name: '分页', exact: true });
    await pager.getByRole('button', { name: '下一页', exact: true }).click();
    await expect(pager).toHaveAttribute('data-page', '2');
    const start = cache.getByRole('button', { name: /^缓存未缓存卡图（/ });
    await expect(start).toBeEnabled();
    await resetMutations(page);
    await start.click(); await cancelDialog(page, start);
    assert.equal(await mutations(page, 'put', 'kards_card_image_batch_v1'), 0);
    assert.deepEqual(await page.evaluate(() => window.__imageRequests), []);
    await page.evaluate(() => { window.__holdDownloads = true; });
    await start.click(); await confirmDialog(page);
    await expect.poll(() => page.evaluate(() => window.__imageRequests.length)).toBe(2);
    assert.equal(await mutations(page, 'put', 'kards_card_image_batch_v1'), 1);
    await page.evaluate(async () => {
      (await import('/src/lib/imageDownloads.ts')).cancelImageDownload();
      window.__holdDownloads = false;
      window.__releaseDownloads.splice(0).forEach(resolve => resolve());
    });
    await expect(page.getByRole('region', { name: '卡图缓存下载进度', exact: true })).toContainText('缓存已停止');
    result.checks.push('large cache batch cancel performs no work, confirm starts one synthetic batch');

    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    const libraryCache = page.getByRole('button', { name: /^缓存卡牌图片（/ });
    await expect(libraryCache).toBeVisible();
    await resetMutations(page);
    await libraryCache.click(); await cancelDialog(page, libraryCache, true);
    assert.equal(await mutations(page, 'put', 'kards_card_image_batch_v1'), 0);
    result.checks.push('CardLibrary large batch confirmation is in-app and Escape cancels');
  } finally { await ctx.close(); }
}

async function main() {
  await fs.mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.KARDS_BROWSER_CHANNEL || 'msedge' });
  try {
    await settingsTests(browser);
    await batchTests(browser);
    assert.deepEqual(result.nativeDialogs, [], 'all confirmations stay in the application');
    assert.deepEqual(result.externalRequests, [], 'the regression never uses the network for artwork');
    assert.deepEqual(result.pageErrors, []);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify(result, null, 2));
    console.log('Cache settings UI smoke passed: statistics layout, inventory retry, application confirmations, synthetic batches, database and category actions, focus/Escape');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
