// Verify computed CSS mask URLs in the production protocol. No screenshots/pixels.
const { _electron: electron, expect } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');
const catalogue = require('../src/data/assets.json');
const filterPaths = new Set([
  ...Object.values(catalogue.factions).map(asset => asset.white || asset.icon),
  ...Object.values(catalogue.types), ...Object.values(catalogue.rarities), ...Object.values(catalogue.sets),
]);

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'filter-icon-paths');
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'profile-'));
  const executable = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const env = { ...process.env, KARDS_USE_DIST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: executable || require('electron'), args: [...executable ? [] : [root], `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  try {
    const page = await app.firstWindow();
    const requests = new Set(), failures = [], badResponses = [], pageErrors = [];
    page.on('request', request => { if (filterPaths.has(new URL(request.url()).pathname)) requests.add(request.url()); });
    page.on('requestfailed', request => { if (filterPaths.has(new URL(request.url()).pathname)) failures.push({ url: request.url(), error: request.failure()?.errorText }); });
    page.on('response', response => { if (filterPaths.has(new URL(response.url()).pathname) && !response.ok()) badResponses.push({ url: response.url(), status: response.status() }); });
    page.on('pageerror', error => pageErrors.push(error.message));
    await page.route(/^https?:/, route => route.abort());
    await page.waitForURL('kards://app/index.html');
    await page.getByRole('button', { name: '卡牌', exact: true }).click();
    const checkedUrls = new Set();

    async function checkMenu(label, expected) {
      await page.getByRole('combobox', { name: label, exact: true }).click();
      const list = page.getByRole('listbox', { name: `${label}选项`, exact: true });
      await expect(list).toBeVisible();
      const urls = await list.locator('.filter-symbol').evaluateAll(elements => elements.map(element => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return { mask: style.maskImage, width: rect.width, height: rect.height };
      }));
      assert.equal(urls.length, expected, label);
      for (const icon of urls) {
        const match = /^url\("([^"]+)"\)$/.exec(icon.mask);
        assert.ok(match, icon.mask);
        const url = new URL(match[1]);
        assert.equal(url.protocol, new URL(page.url()).protocol);
        assert.equal(url.host, new URL(page.url()).host);
        assert.ok(filterPaths.has(url.pathname), url.pathname);
        assert.ok(icon.width > 0 && icon.height > 0);
        checkedUrls.add(url.href);
      }
      await page.waitForLoadState('networkidle');
      await list.press('Escape');
    }

    await checkMenu('阵营筛选', 10);
    await checkMenu('类型筛选', 7);
    await checkMenu('稀有度筛选', 4);
    await checkMenu('扩展包筛选', Object.keys(catalogue.sets).length);
    // Select some icons too: trigger chips must use the same corrected paths.
    await page.getByRole('combobox', { name: '阵营筛选', exact: true }).click();
    const list = page.getByRole('listbox');
    await list.locator('[data-value="Germany"]').click();
    await list.locator('[data-value="Britain"]').click();
    await list.press('Escape');
    const triggerMasks = await page.getByRole('combobox', { name: '阵营筛选', exact: true }).locator('.filter-symbol').evaluateAll(elements => elements.map(element => getComputedStyle(element).maskImage));
    assert.equal(triggerMasks.length, 2);
    assert.ok(triggerMasks.every(mask => mask.startsWith('url("kards://app/assets/faction_icons/')));
    // Electron's file-protocol successes are not exposed as Playwright network
    // events. Fetch the *computed* URLs, rather than a separately built good path.
    const assets = await page.evaluate(async urls => Promise.all(urls.map(async url => {
      const response = await fetch(url);
      return { url, status: response.status, ok: response.ok, mime: response.headers.get('content-type') };
    })), [...checkedUrls]);
    for (const asset of assets) {
      assert.ok(asset.ok, `computed mask URL failed: ${JSON.stringify(asset)}`);
      assert.match(asset.mime, /^image\/(svg\+xml|png)/);
    }
    assert.deepEqual(failures, []);
    assert.deepEqual(badResponses, []);
    assert.deepEqual(pageErrors, []);
    const report = { status: 'passed', version: (await page.evaluate(() => window.kardsDesktop.getAppInfo())).version, packaged: !!executable, screenshots: false, imageInspection: false, masksChecked: checkedUrls.size, assets, requests: [...requests], failures, badResponses, pageErrors };
    await fs.writeFile(path.join(out, executable ? 'packaged.json' : 'production.json'), JSON.stringify(report, null, 2));
    console.log(`Filter icon paths passed: ${checkedUrls.size} computed mask URLs resolved in production; no screenshots/image inspection`);
  } finally {
    await app.close();
    await fs.rm(profile, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
