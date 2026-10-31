// Verify ASAR random-access resources and both development resource modes.
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const http = require('node:http');
const { _electron: electron, expect } = require('playwright/test');
const asar = require('@electron/asar');
const tools = require('./load-pack-tools.cjs');
const root = path.resolve(__dirname, '..');
async function main() {
  const output = path.join(root, 'test-results/pack-mode'); await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'run-'));
  let app, vite, web;
  try {
    const source = path.join(work, 'app'); await fs.mkdir(source);
    await fs.cp(path.join(root, 'dist'), path.join(source, 'dist'), { recursive: true });
    await fs.cp(path.join(root, 'dist-electron'), path.join(source, 'dist-electron'), { recursive: true });
    await fs.writeFile(path.join(source, 'package.json'), JSON.stringify({ name: 'kards-toolbox', version: require('../package.json').version, main: 'dist-electron/main.cjs' }));
    const archive = path.join(work, 'app.asar'); await asar.createPackageWithOptions(source, archive, { unpack: '**/static.kpak' });
    const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'));
    assert.ok(files.some(file => file.endsWith('/static.kpak')));
    assert.ok(!files.some(file => /\.(png|jpe?g|svg|webp|avif)$/i.test(file)), 'application archive contains no loose game images');
    const env = { ...process.env, KARDS_USE_DIST: '1', KARDS_USE_PACKS: '1' }; delete env.ELECTRON_RUN_AS_NODE;
    app = await electron.launch({ executablePath: require('electron'), args: [archive, `--user-data-dir=${path.join(work, 'profile')}`, '--disable-crash-reporter'], env });
    const page = await app.firstWindow(); await page.route(/^https?:/, route => route.abort());
    await expect(page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    const asset = '/assets/headquarters/Britain_Alam_el_Halfa.png';
    const loaded = await page.evaluate(async url => { const response = await fetch(url); return { status: response.status, mime: response.headers.get('content-type'), length: (await response.arrayBuffer()).byteLength }; }, asset);
    assert.equal(loaded.status, 200); assert.equal(loaded.mime, 'image/png'); assert.ok(loaded.length > 1000);
    // Sharp resolves assets through the same pack manager inside app.asar.
    const image = await page.evaluate(() => window.kardsDesktop.renderDeckImage({ title: 'ASAR', code: '%%12|lV;;;', mainNation: 'Germany', allyNation: 'Britain', headquartersImage: '/assets/headquarters/Britain_Alam_el_Halfa.png', cards: [{ id: 'lV', name: 'cached', count: 1, rarity: 'Standard', image: null }] }));
    assert.ok(image.startsWith('data:image/png;base64,'));
    await app.close(); app = null;
    console.log('ASAR protocol and Sharp passed');
    const { createServer } = await import('vite');
    vite = await createServer({ root, configFile: path.join(root, 'vite.config.ts'), server: { host: '127.0.0.1', port: 0 }, logLevel: 'error' }); await vite.listen();
    const address = vite.httpServer.address();
    const loose = await fetch(`http://127.0.0.1:${address.port}${asset}`); assert.equal(loose.status, 200); assert.equal(loose.headers.get('content-type'), 'image/png');
    // HTTP development pages render cached kards:// images onto Canvas too.
    const devEnv = { ...process.env, ELECTRON_RENDERER_URL: `http://127.0.0.1:${address.port}` };
    for (const key of ['ELECTRON_RUN_AS_NODE', 'KARDS_USE_DIST', 'KARDS_USE_PACKS', 'PORTABLE_EXECUTABLE_DIR']) delete devEnv[key];
    app = await electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${path.join(work, 'dev-profile')}`, '--disable-crash-reporter'], env: devEnv });
    const devPage = await app.firstWindow();
    devPage.on('pageerror', error => console.error('Development renderer:', error.message));
    await expect(devPage.getByRole('heading', { name: '卡组', exact: true })).toBeVisible({ timeout: 20000 });
    console.log('Development renderer loaded');
    const fixture = require('../public/data/cards.json').cards.find(card => card.cardId === '50_infantry_regiment');
    await app.evaluate(({ net }) => { global.__originalNetFetch = net.fetch; net.fetch = async () => new Response(Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'))); });
    const mini = await devPage.evaluate(async card => {
      const { cacheCardImage } = await import('/src/lib/cardImages.ts');
      const { renderDeckMiniImage } = await import('/src/lib/deckMiniRenderer.ts');
      const url = await cacheCardImage(card, 'full', false);
      if (!url.startsWith('kards://')) throw new Error('Expected native protocol image');
      return renderDeckMiniImage(`%%12|${card.importId};;;`, [card], 'Dev Canvas');
    }, fixture);
    assert.ok(mini.startsWith('data:image/png;base64,'), 'cross-origin cached artwork leaves Canvas exportable');
    await app.evaluate(({ net }) => { net.fetch = global.__originalNetFetch; delete global.__originalNetFetch; });
    await app.close(); app = null;
    await vite.close(); vite = null;
    const packedRoot = path.join(work, 'web-packed'); await fs.mkdir(path.join(packedRoot, 'dist-packs'), { recursive: true });
    await fs.copyFile(path.join(root, 'dist-packs/static.kpak'), path.join(packedRoot, 'dist-packs/static.kpak'));
    const middleware = tools.staticAssetMiddleware(packedRoot);
    web = http.createServer((request, response) => { void middleware(request, response, () => { response.statusCode = 404; response.end(); }); });
    await new Promise(resolve => web.listen(0, '127.0.0.1', resolve));
    const packed = await fetch(`http://127.0.0.1:${web.address().port}${asset}`); assert.equal(packed.status, 200);
    assert.deepEqual(Buffer.from(await packed.arrayBuffer()), Buffer.from(await loose.arrayBuffer()));
    console.log('Pack mode smoke passed: ASAR protocol and Sharp, no loose images in archive, development Canvas, Vite loose mode and Web pack fallback');
  } finally {
    if (app) await app.close(); if (vite) await vite.close(); if (web) await new Promise(resolve => web.close(resolve));
    if (path.dirname(work) === output) await fs.rm(work, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
