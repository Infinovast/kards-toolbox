// Real Electron/IndexedDB import and build-time cache export; no network access.
// Build first with npm run build:desktop.
const { _electron: electron, expect } = require('playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { brotliDecompressSync } = require('node:zlib');
const root = path.resolve(__dirname, '..');
const { cards } = require('../public/data/cards.json');
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=';

function buildBundle(profile, output, succeeds = true, target) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [path.join(root, 'scripts/build-full.cjs'), ...(target ? ['--target', target] : ['--cache-only']), '--profile', profile, '--output', output], { cwd: root, windowsHide: true });
    let log = '';
    child.stdout.on('data', bytes => { log += bytes; if (target) process.stdout.write(bytes); });
    child.stderr.on('data', bytes => { log += bytes; if (target) process.stderr.write(bytes); });
    child.on('error', reject);
    child.on('exit', code => (succeeds ? code === 0 : code !== 0) ? resolve(log) : reject(new Error(log)));
  });
}

async function launch(profile, distribution, executable) {
  const env = { ...process.env, KARDS_USE_DIST: '1' };
  if (distribution) env.PORTABLE_EXECUTABLE_DIR = distribution;
  else delete env.PORTABLE_EXECUTABLE_DIR;
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: executable || require('electron'), args: [...(executable ? [] : [root]), `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  const page = await app.firstWindow();
  await page.route(/^https?:/, route => route.abort());
  return { app, page };
}

async function stored(page, entries) {
  await page.addScriptTag({ path: require.resolve('localforage') });
  return page.evaluate(async entries => {
    const store = window.localforage;
    await store.ready();
    for (let attempt = 0; await store.getItem('kards_settings') === null; attempt++) {
      if (attempt >= 100) throw new Error('App storage did not initialize');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    if (entries) for (const [key, value] of Object.entries(entries)) await store.setItem(key, value);
    const data = {};
    await store.iterate((value, key) => { data[key] = value; });
    return data;
  }, entries);
}

async function main() {
  const output = path.join(root, 'test-results/cache-bundle');
  await fs.mkdir(output, { recursive: true });
  const work = await fs.mkdtemp(path.join(output, 'run-'));
  let current;
  try {
    const source = path.join(work, 'source');
    const distribution = path.join(work, 'distribution');
    await fs.mkdir(distribution);
    current = await launch(source, distribution);
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    const key = kind => `kards_card_image_v2_${cards[0].importId}_${encodeURIComponent(cards[0][kind === 'full' ? 'imageUrl' : 'thumbUrl'])}`;
    const database = { schemaVersion: 1, active: { cards: cards.slice(0, 2), source: 'kardsplayer', fetchedAt: '2026-10-01T00:00:00Z' } };
    const privateData = { kards_decks: [{ id: 'private', name: 'PRIVATE DECK', code: '%%12|ZZ;;;' }], kards_builder_draft: { private: true }, deck_img_local_v1_private: png, kards_card_image_failures_v1: { private: true } };
    const staleKey = 'kards_card_image_v2_stale_https%3A%2F%2Fwww.kardsplayer.com%2Fold.png';
    await stored(current.page, { ...privateData, kards_card_database_v1: database, [key('full')]: png, [key('thumbnail')]: png, [staleKey]: png });
    const locked = await buildBundle(source, distribution, false);
    assert.match(locked, /请关闭/);
    await current.app.close(); current = null;
    const log = await buildBundle(source, distribution);
    assert.match(log, /大图 1 张，缩略图 1 张/);
    const archive = path.join(distribution, 'kards-toolbox-cache.br');
    const originalBytes = await fs.readFile(archive);
    const records = brotliDecompressSync(originalBytes).toString().trim().split('\n').map(JSON.parse);
    assert.equal(records[0].database.fetchedAt, database.active.fetchedAt);
    assert.deepEqual(records.slice(1, -1).map(record => record.key).sort(), [key('full'), key('thumbnail')].sort());
    assert.ok(!JSON.stringify(records).includes('PRIVATE DECK'));
    assert.ok(!records.some(record => record.key === staleKey));
    if (process.argv.includes('--pack')) {
      const fullOutput = path.join(work, 'full-output');
      const { execFile } = require('node:child_process');
      const exec = require('node:util').promisify(execFile);
      for (const target of ['dir', 'portable']) {
        console.log(`Checking the ${target}-full ZIP packaging pipeline…`);
        await buildBundle(source, fullOutput, true, target);
        const archiveName = `kards_toolbox-${require('../package.json').version}-${target}-full.zip`;
        const extracted = path.join(work, `extracted-${target}`);
        await exec(require('7zip-bin').path7za, ['x', path.join(fullOutput, archiveName), `-o${extracted}`, '-y'], { windowsHide: true });
        const files = await fs.readdir(extracted);
        assert.ok(files.includes('kards_toolbox.exe') && files.includes('kards-toolbox-cache.br'));
        if (target === 'portable') {
          assert.deepEqual(files.sort(), ['kards-toolbox-cache.br', 'kards_toolbox.exe']);
        } else {
          await fs.access(path.join(extracted, 'resources', 'app.asar'));
          await fs.access(path.join(extracted, 'icudtl.dat'));
          // Exercise the executable-directory lookup without portable environment variables.
          const packagedProfile = path.join(work, 'packaged-profile');
          current = await launch(packagedProfile, null, path.join(extracted, 'kards_toolbox.exe'));
          await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
          assert.equal((await current.page.evaluate(() => window.kardsDesktop.getAppInfo())).packaged, true);
          const imported = await stored(current.page);
          assert.equal(imported[key('full')], png);
          assert.equal(imported[key('thumbnail')], png);
          await fs.access(path.join(packagedProfile, 'full-cache-applied.json'));
          await assert.rejects(() => fs.access(path.join(extracted, 'kards-toolbox-cache.br')));
          await current.app.close(); current = null;
        }
        console.log(`${target}-full ZIP layout verified`);
      }
    }
    // Export used a disposable snapshot; it did not mutate the source catalogue.
    current = await launch(source, path.join(work, 'empty'));
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    assert.deepEqual((await stored(current.page)).kards_card_database_v1, database);
    await current.app.close(); current = null;

    const target = path.join(work, 'target');
    current = await launch(target, distribution);
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    let data = await stored(current.page);
    assert.equal(data[key('full')], png); assert.equal(data[key('thumbnail')], png);
    assert.ok(data.kards_card_database_v1.active.cards.some(card => card.importId === cards[0].importId));
    assert.ok(!data.kards_builder_draft && !data.deck_img_local_v1_private && !data[staleKey]);
    assert.deepEqual(data.kards_decks, []);
    await fs.access(path.join(target, 'full-cache-applied.json'));
    await assert.rejects(() => fs.access(archive));
    await assert.rejects(() => fs.access(path.join(target, 'full-cache-staging')));
    // Reload within the same process must also honor successful initialization.
    await current.page.reload();
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    await current.app.close(); current = null;

    // A completed profile skips an invalid new sidecar on the next launch.
    await fs.writeFile(archive, 'corrupt');
    current = await launch(target, distribution);
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    assert.equal(await fs.readFile(archive, 'utf8'), 'corrupt');
    await current.app.close(); current = null;

    // An existing active catalogue and a locally changed image remain untouched.
    const existing = path.join(work, 'existing');
    current = await launch(existing, path.join(work, 'empty'));
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    const ownDatabase = { schemaVersion: 1, active: { ...database.active, cards: cards.slice(5, 6) } };
    await stored(current.page, { kards_card_database_v1: ownDatabase, [key('full')]: 'existing-image', kards_builder_draft: { keep: true } });
    await current.app.close(); current = null;
    await fs.writeFile(archive, originalBytes);
    current = await launch(existing, distribution);
    await expect(current.page.getByRole('heading', { name: '卡组', exact: true })).toBeVisible();
    data = await stored(current.page);
    assert.deepEqual(data.kards_card_database_v1, ownDatabase);
    assert.equal(data[key('full')], 'existing-image');
    assert.equal(data[key('thumbnail')], png);
    assert.deepEqual(data.kards_builder_draft, { keep: true });
    console.log('Full cache smoke passed: source lock/snapshot, private-data exclusion, current images, first start/apply/delete, reload/relaunch skip, existing-data preservation');
  } finally {
    if (current) await current.app.close();
    if (path.dirname(work) === output) await fs.rm(work, { recursive: true, force: true });
  }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
