// Production-protocol smoke test. Build first: npm run build:desktop.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

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
    await expect(page.getByRole('heading', { name: '卡组管理', exact: true })).toBeVisible();
    const info = await page.evaluate(() => window.kardsDesktop.getAppInfo());
    assert.equal(info.version, '0.1.0');
    assert.equal(await page.evaluate(() => typeof window.require), 'undefined');
    await page.getByRole('button', { name: '卡牌资料', exact: true }).click();
    await expect(page.getByText('本地目录 1,646 张 · 当前结果 1,646 张', { exact: true })).toBeVisible();
    await page.getByRole('button', { name: '卡组构筑', exact: true }).click();
    await page.getByLabel('导入卡组码', { exact: true }).fill('%%12|ZZ;;;');
    await page.getByRole('button', { name: '导入', exact: true }).click();
    await expect(page.getByText('未知卡牌 ZZ', { exact: true })).toBeVisible();
    await page.getByLabel('卡组名称', { exact: true }).fill('Desktop offline test');
    await page.getByRole('button', { name: '保存卡组', exact: true }).click();
    await expect(page.getByLabel('管理卡组名称', { exact: true })).toHaveValue('Desktop offline test');
    await page.getByLabel('卡组备注', { exact: true }).fill('生产协议与离线存储测试');
    await page.getByRole('button', { name: '生成本地卡组图片', exact: true }).click();
    await expect(page.getByRole('button', { name: '下载 PNG 图片', exact: true })).toBeVisible();
    assert.ok((await page.getByAltText('本地卡组图片', { exact: true }).getAttribute('src')).startsWith('data:image/png;base64,'));
    await page.reload();
    await page.getByText('Desktop offline test', { exact: true }).click();
    await expect(page.getByLabel('卡组备注', { exact: true })).toHaveValue('生产协议与离线存储测试');

    // Stub only OS file picking; exercise the real preload, IPC and filesystem.
    await app.evaluate(({ dialog }, filePath) => {
      dialog.showSaveDialog = async () => ({ canceled: false, filePath });
      dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [filePath] });
    }, backupPath);
    await page.getByRole('button', { name: '应用设置', exact: true }).click();
    await page.getByRole('button', { name: '导出备份', exact: true }).click();
    await expect(page.getByText(`备份已导出：${backupPath}`, { exact: true })).toBeVisible();
    const backup = JSON.parse(await fs.readFile(backupPath, 'utf8'));
    assert.equal(backup.data.kards_decks[0].name, 'Desktop offline test');
    assert.ok(Object.keys(backup.data).some((key) => key.startsWith('deck_img_local_v1_')));
    await page.getByRole('button', { name: '导入备份', exact: true }).click();
    await expect(page.getByText('备份已导入，卡组、设置和构筑草稿已恢复。', { exact: true })).toBeVisible();
    assert.deepEqual(errors, []);
    await fs.writeFile(path.join(output, 'result.json'), JSON.stringify({
      status: 'passed', packaged: info.packaged, version: info.version, url: page.url(), pageErrors: errors,
      checks: ['production kards protocol', 'bundled database', 'preload IPC', 'Node isolation',
        'offline PNG', 'IndexedDB reload', 'native backup save/open (file dialogs stubbed)'],
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
