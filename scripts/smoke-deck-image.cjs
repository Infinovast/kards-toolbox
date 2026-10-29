// Build first. Exercises the real packaged protocol, worker, Sharp and Windows OCR.
const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'deck-image');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = { ...process.env, KARDS_USE_DIST: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  try {
    await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_request, done) => done({ cancel: true })));
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('kards://app/index.html');
    await expect(page.getByRole('button', { name: '新卡组', exact: true })).toBeVisible();
    const records = JSON.parse(await fs.readFile(path.join(root, 'public/data/cards.json'), 'utf8')).cards;
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/data/headquarters.json'), 'utf8')).headquarters;
    const hq = manifest.find(item => item.groupId === 'Japan/baguio' && item.nation === 'Japan');
    const code = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
    const cards = code.split('|')[1].split(';').flatMap((section, group) => (section.match(/.{2}/g) || []).map(id => {
      const card = records.find(item => item.importId === id);
      return { id, name: card.json.title['zh-Hans'], count: group + 1, image: null, rarity: card.json.rarity, faction: card.json.faction };
    }));
    const headquartersImage = `data:image/png;base64,${(await fs.readFile(path.join(root, 'public', hq.image))).toString('base64')}`;
    const cardBackId = 'cardback-050';
    const rendered = await page.evaluate(request => window.kardsDesktop.renderDeckImage(request), { title: 'QR round trip', code, headquartersId: hq.groupId, cardBackId, mainNation: 'Japan', allyNation: 'Germany', headquartersImage, cards });
    const file = { name: 'deck.png', mimeType: 'image/png', buffer: Buffer.from(rendered.split(',')[1], 'base64') };
    const openImport = async () => {
      await page.getByRole('button', { name: '新卡组', exact: true }).click();
      await page.getByRole('button', { name: '导入卡组', exact: false }).click();
      return page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认导入', exact: true }) });
    };
    let dialog = await openImport();
    // A working QR must not need OCR, even when no OCR language pack is available.
    await app.evaluate(({ ipcMain }) => { global.__ocrCalls = 0; const original = ipcMain._invokeHandlers.get('deck:recognize-image'); ipcMain.removeHandler('deck:recognize-image'); ipcMain.handle('deck:recognize-image', (...args) => { global.__ocrCalls++; return original(...args); }); });
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles(file);
    await expect(dialog.getByRole('status')).toHaveText('已读取二维码：40 张（含总部）', { timeout: 30000 });
    await expect(dialog.getByRole('textbox').last()).toHaveValue(code);
    await expect(dialog.getByRole('textbox').first()).toHaveValue('QR round trip');
    assert.equal(await app.evaluate(() => global.__ocrCalls), 0);
    await dialog.getByRole('textbox').first().fill('Image round trip');
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await page.getByRole('button', { name: '更换总部', exact: true }).click();
    await expect(page.getByRole('button', { name: `使用总部 ${hq.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '关闭更换总部', exact: true }).click();
    await expect(page.getByAltText('Image round trip', { exact: true })).toHaveAttribute('src', '/assets/cardbacks/Japan/cardback-050.png');

    dialog = await openImport();
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="100%" height="100%" fill="white"/><g font-family="Microsoft YaHei" font-size="48" fill="black">${['OCR Pioneer', '第 50 步兵团', '第 50 步兵团', '第 50 步兵团', 'OT-34'].map((name, i) => `<text x="40" y="${100 + i * 120}">${name}</text>`).join('')}</g></svg>`;
    const textImage = await sharp(Buffer.from(svg)).png().toBuffer();
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles({ name: 'no-qr.png', mimeType: 'image/png', buffer: textImage });
    await expect(dialog.getByRole('status')).toHaveText('图像识别：5 张（含总部），请核对信息', { timeout: 65000 });
    assert.equal(await app.evaluate(() => global.__ocrCalls), 1);
    await expect(dialog.getByRole('textbox').last()).toHaveValue('%%14|9s;;lV;');
    await expect(dialog.getByRole('textbox').first()).toHaveValue('OCR Pioneer');

    // Failed recognition preserves existing code, and closing cancels stale UI work.
    const previousCode = await dialog.getByRole('textbox').last().inputValue();
    const blank = await sharp({ create: { width: 700, height: 500, channels: 3, background: '#ffffff' } }).png().toBuffer();
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles({ name: 'blank.png', mimeType: 'image/png', buffer: blank });
    await expect(dialog.getByText('无法识别卡组图片', { exact: true })).toBeVisible({ timeout: 65000 });
    await expect(dialog.getByRole('textbox').last()).toHaveValue(previousCode);
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles(file);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    dialog = await openImport();
    await expect(dialog.getByRole('textbox').last()).toHaveValue('');
    assert.deepEqual(errors, []);
    console.log('Deck image desktop smoke passed: Sharp QR, production worker, headquarters/card back round trip, actual Windows OCR, failure preservation and cancel/reopen');
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
