// Build first. Exercises the real packaged protocol, QR worker and Sharp.
const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const sharp = require('sharp');
const QRCode = require('qrcode');

async function main() {
  const root = path.resolve(__dirname, '..');
  const output = path.join(root, 'test-results', 'deck-image');
  await fs.mkdir(output, { recursive: true });
  const profile = await fs.mkdtemp(path.join(output, 'profile-'));
  const env = { ...process.env, KARDS_USE_DIST: '1', KARDS_USE_PACKS: '1' }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  try {
    await app.evaluate(({ session }) => session.defaultSession.webRequest.onBeforeRequest({ urls: ['https://*/*', 'http://*/*'] }, (_request, done) => done({ cancel: true })));
    const page = await app.firstWindow();
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await page.waitForURL('kards://app/index.html');
    await page.getByRole('complementary', { name: '主导航' }).getByRole('button', { name: '卡组', exact: true }).click();
    await expect(page.getByRole('button', { name: '新卡组', exact: true })).toBeVisible();
    const records = JSON.parse(await fs.readFile(path.join(root, 'public/data/cards.json'), 'utf8')).cards;
    const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/data/headquarters.json'), 'utf8')).headquarters;
    const hq = manifest.find(item => item.groupId === 'Japan/baguio' && item.nation === 'Japan');
    const code = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
    const cards = code.split('|')[1].split(';').flatMap((section, group) => (section.match(/.{2}/g) || []).map(id => {
      const card = records.find(item => item.importId === id);
      return { id, name: card.json.title['zh-Hans'], count: group + 1, image: null, rarity: card.json.rarity, faction: card.json.faction };
    }));
    const headquartersImage = hq.image;
    const cardBackId = 'cardback-050';
    const rendered = await page.evaluate(request => window.kardsDesktop.renderDeckImage(request), { title: 'QR round trip', code, headquartersId: hq.groupId, cardBackId, mainNation: 'Japan', allyNation: 'Germany', headquartersImage, cards });
    const file = { name: 'deck.png', mimeType: 'image/png', buffer: Buffer.from(rendered.split(',')[1], 'base64') };
    const openImport = async () => {
      await page.getByRole('button', { name: '新卡组', exact: true }).click();
      await page.getByRole('button', { name: '导入卡组', exact: false }).click();
      return page.getByRole('dialog').filter({ has: page.getByRole('button', { name: '确认导入', exact: true }) });
    };
    let dialog = await openImport();
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles(file);
    await expect(dialog.getByRole('status')).toHaveText('已读取二维码：40 张（含总部）', { timeout: 30000 });
    await expect(dialog.getByRole('textbox').last()).toHaveValue(code);
    await expect(dialog.getByRole('textbox').first()).toHaveValue('QR round trip');
    await dialog.getByRole('textbox').first().fill('Image round trip');
    await dialog.getByRole('button', { name: '确认导入', exact: true }).click();
    await page.getByRole('button', { name: '更换总部', exact: true }).click();
    await expect(page.getByRole('button', { name: `使用总部 ${hq.name}`, exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: '关闭更换总部', exact: true }).click();
    await expect(page.getByAltText('Image round trip', { exact: true })).toHaveAttribute('src', '/assets/cardbacks/Japan/cardback-050.png');

    dialog = await openImport();
    const previousTitle = 'Keep existing deck';
    await dialog.getByRole('textbox').first().fill(previousTitle);
    await dialog.getByRole('textbox').last().fill(code);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="700"><rect width="100%" height="100%" fill="white"/><g font-family="Microsoft YaHei" font-size="48" fill="black">${['Text-only deck', '第 50 步兵团', '第 50 步兵团', '第 50 步兵团', 'OT-34'].map((name, i) => `<text x="40" y="${100 + i * 120}">${name}</text>`).join('')}</g></svg>`;
    const textImage = await sharp(Buffer.from(svg)).png().toBuffer();
    const blank = await sharp({ create: { width: 700, height: 500, channels: 3, background: '#ffffff' } }).png().toBuffer();
    const unrelatedQr = await QRCode.toBuffer('https://example.com');
    // Images without a usable deck QR preserve the existing title and code.
    for (const [name, buffer] of [['no-qr.png', textImage], ['blank.png', blank], ['unrelated-qr.png', unrelatedQr]]) {
      await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles({ name, mimeType: 'image/png', buffer });
      await expect(dialog.getByText('图片中未找到可用的卡组二维码', { exact: true })).toBeVisible({ timeout: 30000 });
      await expect(dialog.getByRole('textbox').first()).toHaveValue(previousTitle);
      await expect(dialog.getByRole('textbox').last()).toHaveValue(code);
      await expect(dialog.getByRole('button', { name: '确认导入', exact: true })).toBeEnabled();
    }
    // Closing cancels stale UI work.
    await dialog.getByLabel('选择卡组图片文件', { exact: true }).setInputFiles(file);
    await dialog.getByRole('button', { name: '取消', exact: true }).click();
    await expect(dialog).toHaveCount(0);
    dialog = await openImport();
    await expect(dialog.getByRole('textbox').last()).toHaveValue('');
    assert.deepEqual(errors, []);
    console.log('Deck image desktop smoke passed: Sharp QR, production worker, headquarters/card back round trip, missing/invalid QR preservation and cancel/reopen');
  } finally {
    await app.close();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
