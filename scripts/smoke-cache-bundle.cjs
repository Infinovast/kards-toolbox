// Real production protocol + isolated IndexedDB migration/export, without network.
const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn, execFile } = require('node:child_process');
const exec = require('node:util').promisify(execFile);
const tools = require('./load-pack-tools.cjs');
const { cards } = require('../public/data/cards.json');
const root = path.resolve(__dirname, '..');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';
function buildBundle(profile, output, succeeds = true) { return new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts/export-cache.cjs'), '--to-pack', '--profile', profile, '--output', output], { cwd: root, windowsHide: true });
  let log = ''; child.stdout.on('data', bytes => { log += bytes; }); child.stderr.on('data', bytes => { log += bytes; });
  child.on('error', reject); child.on('exit', code => (succeeds ? code === 0 : code !== 0) ? resolve(log) : reject(new Error(log)));
}); }
async function launch(profile, distribution) {
  const env = { ...process.env, KARDS_USE_DIST: '1', KARDS_USE_PACKS: '1', PORTABLE_EXECUTABLE_DIR: distribution }; delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: require('electron'), args: [root, `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  const page = await app.firstWindow(); await page.route(/^https?:/, route => route.abort());
  try { await expect(page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible({ timeout: 15000 }); }
  catch (error) { console.error('Startup DOM:', await page.locator('body').innerText()); console.error(await app.evaluate(() => process.versions)); await app.close(); throw error; }
  return { app, page };
}
async function stored(page, entries) {
  await page.addScriptTag({ path: require.resolve('localforage') });
  return page.evaluate(async entries => {
    const store = window.localforage; await store.ready();
    if (entries) for (const [key, value] of Object.entries(entries)) await store.setItem(key, value);
    const result = {}; await store.iterate((value, key) => { result[key] = value; }); return result;
  }, entries);
}
async function main() {
  const output = path.join(root, 'test-results/cache-bundle'); await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'kpak-'));
  let current;
  try {
    const source = path.join(work, 'source'), distribution = path.join(work, 'distribution'); await fs.mkdir(distribution);
    current = await launch(source, distribution);
    const fixture = cards.find(card => card.cardId === '50_infantry_regiment');
    const key = kind => `kards_card_image_v2_${fixture.importId}_${encodeURIComponent(fixture[kind === 'full' ? 'imageUrl' : 'thumbUrl'])}`;
    const database = { schemaVersion: 1, active: { cards: [fixture], source: 'kardsplayer', fetchedAt: '2026-10-01T00:00:00Z' } };
    await stored(current.page, { kards_test_private: 'PRIVATE DECK', kards_card_database_v1: database, [key('full')]: png, [key('thumb')]: png, kards_card_image_failures_v1: { [key('full')]: { message: 'legacy failure', at: '2026-10-01' } } });
    assert.match(await buildBundle(source, path.join(distribution, 'cards.kpak'), false), /请关闭/);
    await current.app.close(); current = null;
    const log = await buildBundle(source, path.join(distribution, 'cards.kpak')); assert.match(log, /大图 1 张，缩略图 1 张/);
    const pack = await tools.Kpak.open(path.join(distribution, 'cards.kpak'));
    assert.equal(pack.entries.size, 2); assert.ok(!JSON.stringify([...pack.entries]).includes('PRIVATE DECK'));
    const original = await fs.readFile(pack.file), target = path.join(work, 'target');
    current = await launch(target, distribution);
    let data = await stored(current.page);
    assert.ok(!Object.keys(data).some(key => /^kards_card_image_v[12]_/.test(key)), 'full install never populates IndexedDB images');
    assert.deepEqual(data.kards_decks, []); assert.ok(data.kards_card_database_v1.active);
    let stats = await current.page.evaluate(() => window.kardsDesktop.listCardImageKeys()); assert.equal(stats.entries.length, 2);
    assert.deepEqual(await fs.readFile(path.join(target, 'packs/cards.kpak')), original, 'fresh full install copies the pack without decoding or rewriting entries');
    const image = await current.page.evaluate(async ref => { const url = 'kards://app/card-image?' + new URLSearchParams(ref); const response = await fetch(url); return { status: response.status, mime: response.headers.get('content-type'), bytes: [...new Uint8Array(await response.arrayBuffer())] }; }, { cardId: fixture.cardId, variant: 'thumb', url: fixture.thumbUrl });
    assert.equal(image.status, 200); assert.equal(image.mime, 'image/png'); assert.deepEqual(Buffer.from(image.bytes), Buffer.from(png.split(',')[1], 'base64'));
    assert.equal(await current.page.evaluate(() => typeof window.require), 'undefined');
    await assert.rejects(() => current.page.evaluate(() => window.kardsDesktop.cacheCardImage({ cardId: 'bad', variant: 'full', url: 'file:///C:/Windows/win.ini' })), /卡图地址无效/);
const assets = await current.page.evaluate(async () => { const response = await fetch('/assets/faction_icons/Germany/germany_white.svg'); return { status: response.status, mime: response.headers.get('content-type') }; });
    assert.equal(assets.status, 200); assert.equal(assets.mime, 'image/svg+xml');
    await fs.access(path.join(target, 'full-cache-applied.json')); await assert.rejects(() => fs.access(path.join(distribution, 'cards.kpak')));
    // Exercise real main-process download validation and binary persistence with
    // a deterministic net.fetch fixture, while the renderer remains isolated.
    await current.app.evaluate(({ net }) => { global.__originalNetFetch = net.fetch; net.fetch = async () => new Response(Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64'))); });
    const extra = { cardId: 'sample_new_card', variant: 'full', url: fixture.imageUrl };
    const downloaded = await current.page.evaluate(ref => window.kardsDesktop.cacheCardImage(ref), extra); assert.equal(downloaded.mime, 'image/png');
    stats = await current.page.evaluate(() => window.kardsDesktop.listCardImageKeys()); assert.equal(stats.entries.length, 3);
    await current.page.evaluate(ref => window.kardsDesktop.deleteCardImages([ref]), extra);
    await current.page.evaluate(() => window.kardsDesktop.compactCardPack());
    stats = await current.page.evaluate(() => window.kardsDesktop.listCardImageKeys()); assert.equal(stats.entries.length, 2); assert.equal(stats.deadBytes, 0);
    await current.app.evaluate(({ net }) => { net.fetch = global.__originalNetFetch; delete global.__originalNetFetch; });
    await current.page.reload(); await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    await current.app.close(); current = null;
    await fs.writeFile(path.join(distribution, 'cards.kpak'), 'invalid but completed installs skip it');
    current = await launch(target, distribution); assert.match(await fs.readFile(path.join(distribution, 'cards.kpak'), 'utf8'), /invalid/);
    await current.app.close(); current = null;
    // Legacy migration goes into the pack and preserves the user's own data.
    await fs.writeFile(path.join(distribution, 'cards.kpak'), original);
    current = await launch(source, distribution);
    data = await stored(current.page); assert.equal(data.kards_test_private, 'PRIVATE DECK');
    assert.ok(!data[key('full')] && !data[key('thumb')]);
    assert.ok(Object.keys(data.kards_card_image_failures_v1).some(key => key.startsWith('kards_card_pack_v2_')), 'legacy failure records migrate to the native cache identity');
    assert.equal((await current.page.evaluate(() => window.kardsDesktop.listCardImageKeys())).entries.length, 2);
    await current.app.close(); current = null;
    const nativeExport = path.join(work, 'native.kpak'); await buildBundle(source, nativeExport); assert.equal((await tools.Kpak.open(nativeExport)).entries.size, 2);
    const nativeOnly = path.join(work, 'native-only'); await fs.mkdir(path.join(nativeOnly, 'packs'), { recursive: true });
    await fs.copyFile(nativeExport, path.join(nativeOnly, 'packs/cards.kpak'));
    const nativeAgain = path.join(work, 'native-only.kpak'); await buildBundle(nativeOnly, nativeAgain);
    const again = await tools.Kpak.open(nativeAgain), exported = await tools.Kpak.open(nativeExport);
    assert.equal(again.entries.size, 2);
    assert.equal(again.database.source, exported.database.source);
    assert.equal(again.database.fetchedAt, exported.database.fetchedAt);
    assert.deepEqual(again.database.cards.map(card => [card.cardId, card.imageUrl, card.thumbUrl]), exported.database.cards.map(card => [card.cardId, card.imageUrl, card.thumbUrl]), 'pack-only profiles export using their own catalogue');
    const loose = path.join(work, 'loose');
    await exec(process.execPath, [path.join(root, 'scripts/export-cache.cjs'), '--to-loose', '--profile', source, '--loose-dir', loose], { cwd: root, windowsHide: true });
    const manifest = JSON.parse(await fs.readFile(path.join(loose, 'manifest.json'), 'utf8')); assert.equal(manifest.images.length, 2);
    const repacked = path.join(work, 'repacked.kpak'); await tools.buildLooseCardPack(loose, repacked);
    assert.equal((await tools.Kpak.open(repacked)).entries.size, 2);
    if (process.argv.includes('--pack')) {
      for (const target of ['dir', 'portable']) {
        const release = path.join(work, `release-${target}`);
        await exec(process.execPath, [path.join(root, 'scripts/build-full.cjs'), '--target', target, '--profile', source, '--output', release], { cwd: root, windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        const archive = path.join(release, `kards_toolbox-${require('../package.json').version}-${target}-full.zip`), extracted = path.join(work, `unzip-${target}`);
        await exec(await require('./sevenzip.cjs')(), ['x', archive, `-o${extracted}`, '-y'], { windowsHide: true });
        const names = await fs.readdir(extracted); assert.ok(names.includes('kards_toolbox.exe') && names.includes('cards.kpak'));
        if (target === 'portable') assert.deepEqual(names.sort(), ['cards.kpak', 'kards_toolbox.exe']);
        else {
          const asar = require('@electron/asar'), files = asar.listPackage(path.join(extracted, 'resources/app.asar'));
          assert.ok(files.some(file => file.replaceAll('\\', '/').endsWith('/dist-electron/static.kpak')));
          assert.ok(!files.some(file => /\/dist\/assets\/.*\.(png|jpe?g|svg|webp|avif)$/i.test(file.replaceAll('\\', '/'))));
        }
      }
    }
    console.log('KPAK desktop smoke passed: profile lock, legacy export/migration, zero-extraction install, protocol images/static assets, whitelist, native download/delete/compact, persistence and skip marker');
  } finally { if (current) await current.app.close(); if (path.dirname(work) === output) await fs.rm(work, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
