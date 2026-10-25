// Production-protocol smoke test. Build first: npm run build:desktop.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'desktop');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const backupPath = path.join(output, 'desktop-backup.json');
  const env = { ...process.env, KARDS_USE_DIST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const packaged = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const app = await electron.launch({
    executablePath: packaged || require('electron'),
    args: [...(packaged ? [] : [root]), `--user-data-dir=${profile}`, '--disable-crash-reporter'],
    env,
  });
  try {
    const page = await app.firstWindow();
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.route(/^https?:/, (route) => route.abort());
    await page.waitForURL('kards://app/index.html');
    await expect(page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    const info = await page.evaluate(() => window.kardsDesktop.getAppInfo());
    assert.equal(info.version, '0.3.0');
    assert.equal(info.name, 'KARDS Toolbox');
    assert.equal(path.resolve(info.userDataPath), profile, 'explicit test profile remains authoritative');
    await expect(page).toHaveTitle('KARDS 工具箱');
    assert.equal(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].getTitle()), 'KARDS 工具箱');
    await expect(page.getByRole('complementary', { name: '主导航' }).getByRole('button')).toHaveCount(4);
    await expect(page.getByRole('switch', { name: '收藏夹显示' })).not.toBeChecked();
    await page.getByRole('button', { name: '关于', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'KARDS Toolbox', exact: true })).toBeVisible();
    await expect(page.getByText('版本 0.3.0 · Windows 桌面版', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    // Observe actual native setIcon calls while exercising the preload theme bridge.
    await app.evaluate(({ BrowserWindow }) => {
      const win = BrowserWindow.getAllWindows()[0], original = win.setIcon.bind(win);
      global.__iconPaths = [];
      win.setIcon = (icon) => { global.__iconPaths.push(icon); original(icon); };
    });
    await expect.poll(() => page.evaluate(() => window.kardsDesktop.getAppInfo().then(i => i.darkIcon))).toBe(true);
    assert.equal(await page.evaluate(() => window.kardsDesktop.setTheme('light')), false);
    await expect(page.getByAltText('KARDS Logo', { exact: true })).toHaveAttribute('src', /KardsLogoWhite/);
    assert.equal(await page.evaluate(() => window.kardsDesktop.setTheme('dark')), true);
    const iconPaths = await app.evaluate(() => global.__iconPaths);
    assert.ok(iconPaths.some(p => p.endsWith('KardsLogoBlack.png')));
    assert.ok(iconPaths.some(p => p.endsWith('KardsLogoWhite.png')));

    // Real artwork, repeated copies and the final HQ slot use the production Sharp IPC.
    const records = JSON.parse(await fs.readFile(path.join(root, 'public/data/cards-v54.json'), 'utf8')).cards;
    const imageDir = path.join(root, 'references/koishi-plugin-kardsman/data/kards/kards_cn');
    const files = await fs.readdir(imageDir);
    const code = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
    const renderCards = [];
    for (const [group, ids] of code.split('|')[1].split(';').entries()) {
      for (const id of ids.match(/.{2}/g) || []) {
        const card = records.find(c => c.importId === id);
        assert.ok(card, `known card ${id}`);
        const name = card.json.title['zh-Hans'];
        const file = files.find(f => f === `${name}_${id}.png`) || files.find(f => f === `${name}.png`);
        assert.ok(file, `local reference artwork ${name}`);
        renderCards.push({ id, count: group + 1, name, rarity: card.json.rarity,
          image: `data:image/png;base64,${(await fs.readFile(path.join(imageDir, file))).toString('base64')}` });
      }
    }
    assert.equal(renderCards.reduce((n, card) => n + card.count, 0), 39);
    const request = { title: '真实卡图生图验证', mainNation: '日本', allyNation: '德国', cards: renderCards };
    const rendered = await page.evaluate(request => window.kardsDesktop.renderDeckImage(request), request);
    const renderedBytes = Buffer.from(rendered.split(',')[1], 'base64');
    const meta = await sharp(renderedBytes).metadata();
    assert.equal(meta.width, 2304); assert.ok(meta.height >= 1440);
    await fs.writeFile(path.join(output, 'sharp-real-deck.png'), renderedBytes);
    const firstThumb = await sharp(Buffer.from(renderCards[0].image.split(',')[1], 'base64')).resize(212, 301, { fit: 'cover' }).removeAlpha().raw().toBuffer();
    const firstCell = await sharp(renderedBytes).extract({ left: 60, top: 195, width: 212, height: 301 }).removeAlpha().raw().toBuffer();
    assert.deepEqual(firstCell, firstThumb, 'Sharp composite preserves the real card thumbnail');
    const smallBg = `data:image/png;base64,${(await sharp({ create: { width: 320, height: 180, channels: 3, background: '#314d40' } }).png().toBuffer()).toString('base64')}`;
    const customRender = await page.evaluate(request => window.kardsDesktop.renderDeckImage(request), { ...request, background: smallBg });
    assert.equal((await sharp(Buffer.from(customRender.split(',')[1], 'base64')).metadata()).width, 2304);
    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    await expect(page.getByText('本地目录 1,646 张 · 当前结果 1,646 张', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '卡组', exact: true }).click();
    await page.getByRole('button', { name: '导入新卡组', exact: true }).click();
    await page.getByRole('dialog').getByRole('textbox').last().fill('%%12|ZZ;;;');
    await page.getByRole('button', { name: '确认导入', exact: true }).click();
    await page.getByRole('button', { name: '编辑卡组', exact: true }).click();
    await page.getByLabel('导入卡组码', { exact: true }).fill('%%12|ZZ;;;');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await expect(page.getByText('未知卡牌 ZZ', { exact: true })).toBeVisible();
    await page.getByLabel('卡组名称', { exact: true }).fill('Desktop offline test');
    await page.getByRole('button', { name: '保存更改', exact: true }).click();
    await expect(page.getByLabel('管理卡组名称', { exact: true })).toHaveValue('Desktop offline test');
    await page.getByLabel('卡组备注', { exact: true }).fill('生产协议与离线存储测试');
    await page.getByRole('button', { name: '生成本地卡组图片', exact: true }).click();
    await expect(page.getByRole('button', { name: '下载 PNG 图片', exact: true })).toBeVisible();
    assert.ok((await page.getByAltText('本地卡组图片', { exact: true }).getAttribute('src')).startsWith('data:image/png;base64,'));
    await page.reload();
    await page.getByText('Desktop offline test', { exact: true }).click();
    await expect(page.getByLabel('卡组备注', { exact: true })).toHaveValue('生产协议与离线存储测试');

    // Exercise the real fixed-endpoint IPC and parser, stubbing only the HTTP boundary.
    await app.evaluate(({ net }, cards) => {
      global.__cardRequests = [];
      const original = net.fetch.bind(net);
      net.fetch = async (url, options) => {
        if (url === 'https://herokuapi.kards.com/graphql') {
          global.__cardRequests.push(JSON.parse(options.body));
          return new Response(JSON.stringify({ data: { cards: { pageInfo: { count: cards.length, hasNextPage: false }, edges: cards.map(node => ({ node })) } } }), { status: 200 });
        }
        return original(url, options);
      };
    }, records.slice(0, 2));
    await assert.rejects(() => page.evaluate(() => window.kardsDesktop.fetchCardDataPage(-1)), /分页参数/);
    page.on('dialog', dialog => dialog.accept());
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await expect(page.getByTestId('settings-page')).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByRole('button', { name: '获取最新卡牌数据', exact: true }).click();
    await expect(page.getByText('新旧数据对比', { exact: true })).toBeVisible();
    const dataRequests = await app.evaluate(() => global.__cardRequests);
    assert.equal(dataRequests.length, 1);
    assert.equal(dataRequests[0].variables.offset, 0);
    assert.ok(dataRequests[0].variables.showReserved && dataRequests[0].variables.showSpawnables);
    assert.ok(!dataRequests[0].query.includes('image('));
    await page.getByRole('button', { name: '应用更新', exact: true }).click();
    await expect(page.getByText('更新已应用，卡牌库和构筑已使用新数据。卡图缓存未改变。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    await expect(page.getByText('本地目录 2 张 · 当前结果 2 张', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '回退上次数据', exact: true }).click();
    await expect(page.getByText('已回退至上次卡牌数据，用户卡组和卡图缓存未改变。', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    await expect(page.getByText('本地目录 1,646 张 · 当前结果 1,646 张', { exact: true })).toBeVisible();

    // Stub only OS file picking; exercise the real preload, IPC and filesystem.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, backupPath);
    await page.getByRole('button', { name: '设置', exact: true }).click();
    await page.getByRole('button', { name: '导出备份', exact: true }).click();
    await expect(page.getByText(`备份已导出：${backupPath}`, { exact: true })).toBeVisible();
    const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    assert.equal(backup.app, 'kards-toolbox');
    assert.ok(!('kards_card_database_v1' in backup.data));
    assert.equal(backup.data.kards_decks[0].name, 'Desktop offline test');
    assert.ok(Object.keys(backup.data).some((key) => key.startsWith('deck_img_local_v1_')));
    await page.getByRole('button', { name: '导入备份', exact: true }).click();
    await expect(page.getByText('备份已导入，卡组、设置和构筑草稿已恢复。', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({
      status: 'passed', packaged: info.packaged, version: info.version, url: page.url(), pageErrors: errors,
      checks: ['production kards protocol', 'bundled database', 'preload IPC', 'Node isolation',
        'offline PNG', 'real artwork Sharp composition', 'small custom wallpaper', 'native theme icon switching',
        'IndexedDB reload', 'full-width settings', 'manual card-data preview/apply/rollback IPC (HTTP stubbed)', 'card-data backup boundary', 'native backup save/open (file dialogs stubbed)'],
    }, null, 2));
    console.log('Desktop smoke passed: production resources, offline data/PNG, preload and backup IPC');
  } finally {
    await app.close();
    if (path.dirname(profile) === output && path.basename(profile).startsWith('profile-')) {
      await fs.rm(profile, { recursive: true, force: true });
    }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
