// Electron owns the profile lock while reading a disposable IndexedDB snapshot.
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const tools = require('./load-pack-tools.cjs');
const root = path.resolve(__dirname, '..');
const source = process.env.KARDS_BUNDLE_PROFILE, work = process.env.KARDS_BUNDLE_WORK, output = process.env.KARDS_BUNDLE_OUTPUT;
const loose = process.env.KARDS_BUNDLE_LOOSE, toLoose = process.env.KARDS_BUNDLE_MODE === '--to-loose';
if (!source || !work || !output || !loose) throw new Error('Missing export paths');
protocol.registerSchemesAsPrivileged([{ scheme: 'kards', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('KARDS Toolbox'); app.setPath('userData', source);
if (!app.requestSingleInstanceLock({ cacheExport: true })) { console.error('请关闭使用此数据目录的 KARDS 工具箱，再导出缓存。'); app.exit(1); }
else {
  try {
    const snapshot = path.join(work, 'profile'); fs.mkdirSync(snapshot, { recursive: true });
    if (fs.existsSync(path.join(source, 'IndexedDB'))) fs.cpSync(path.join(source, 'IndexedDB'), path.join(snapshot, 'IndexedDB'), { recursive: true });
    const sourcePack = path.join(source, 'packs/cards.kpak');
    if (fs.existsSync(sourcePack)) {
      if (fs.existsSync(`${sourcePack}.idx.bak`)) throw new Error('源卡图包有未完成写入，请先启动应用恢复');
      fs.copyFileSync(sourcePack, path.join(work, 'source.kpak'));
    }
    app.setPath('userData', snapshot); app.setPath('sessionData', snapshot);
    app.whenReady().then(exportCache).then(() => app.exit(0)).catch(fail);
  } catch (error) { fail(error); }
}
function fail(error) { console.error(error); app.exit(1); }
async function exportCache() {
  const sourcePack = path.join(work, 'source.kpak');
  const native = fs.existsSync(sourcePack) ? await tools.Kpak.open(sourcePack) : null;
  const hasDatabase = fs.existsSync(path.join(work, 'profile/IndexedDB'));
  if (!hasDatabase && !native?.entries.size) throw new Error('源目录没有卡图缓存');
  require('esbuild').buildSync({ entryPoints: [path.join(root, 'scripts/cache-profile-reader.ts')], bundle: true, platform: 'browser', format: 'iife', globalName: 'cacheBundleReader', outfile: path.join(work, 'reader.js') });
  const html = path.join(work, 'export.html'); await fsp.writeFile(html, '<!doctype html><script src="./reader.js"></script>');
  const files = { '/export.html': html, '/reader.js': path.join(work, 'reader.js'), '/data/cards.json': path.join(root, 'public/data/cards.json') };
  protocol.registerFileProtocol('kards', (request, callback) => { const file = files[new URL(request.url).pathname]; callback(file ? { path: file } : { error: -6 }); });
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, done) => done({ cancel: true }));
  await win.loadURL('kards://app/export.html');
  const manifest = await win.webContents.executeJavaScript(`cacheBundleReader.getManifest(${JSON.stringify(native?.database || null)})`);
  if (native?.entries.size) {
    const destination = toLoose ? loose : path.join(work, 'loose'), result = { version: 2, database: manifest.database, images: [] };
    const refs = new Map(manifest.references.map(ref => [tools.hashPackKey(tools.cardImageIdentity(ref), tools.packSalt()), ref]));
    for (const [key, ref] of refs) {
      const image = await native.read(key); if (!image) continue;
      result.images.push(await tools.writeLooseImage(destination, ref, image.buffer));
    }
    if (!result.images.length) throw new Error('没有与当前牌库匹配的有效卡图');
    await fsp.writeFile(path.join(destination, 'manifest.json'), JSON.stringify(result, null, 2));
    if (!toLoose) await tools.buildLooseCardPack(destination, output);
    console.log(`已导出 ${toLoose ? loose : output}`); return;
  }
  if (!manifest.images.length) throw new Error('没有可导出的卡图');
  console.log(`卡牌数据 ${manifest.database.cards.length} 张，大图 ${manifest.full} 张，缩略图 ${manifest.thumbnail} 张`);
  const target = toLoose ? loose : path.join(work, 'loose');
  const result = { version: 2, database: manifest.database, images: [] };
  for (const image of manifest.images) {
    const data = await win.webContents.executeJavaScript(`cacheBundleReader.readImage(${JSON.stringify(image.key)})`);
    if (typeof data !== 'string' || data.length > 14 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(data)) throw new Error('旧卡图缓存损坏');
    const { key, ...ref } = image;
    result.images.push(await tools.writeLooseImage(target, ref, Buffer.from(data.slice(data.indexOf(',') + 1), 'base64')));
  }
  await fsp.writeFile(path.join(target, 'manifest.json'), JSON.stringify(result, null, 2));
  if (!toLoose) await tools.buildLooseCardPack(target, output);
  console.log(`已导出 ${toLoose ? loose : output}`);
}
