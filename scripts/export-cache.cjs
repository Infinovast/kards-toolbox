// Run with Electron, not Node. Read a disposable snapshot rather than modifying
// the source profile; a single-instance lock keeps it stable while copying.
const { app, BrowserWindow, protocol } = require('electron');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');
const { createBrotliCompress, constants } = require('node:zlib');
const { pipeline } = require('node:stream/promises');

const source = process.env.KARDS_BUNDLE_PROFILE;
const work = process.env.KARDS_BUNDLE_WORK;
const output = process.env.KARDS_BUNDLE_OUTPUT;
if (!source || !work || !output) throw new Error('Missing cache export paths');
protocol.registerSchemesAsPrivileged([{ scheme: 'kards', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }]);
app.setName('KARDS Toolbox');
app.setPath('userData', source);
if (!app.requestSingleInstanceLock({ cacheExport: true })) {
  console.error('请关闭使用此数据目录的 KARDS 工具箱，再生成完整包。');
  app.exit(1);
} else {
  try {
    const indexedDB = path.join(source, 'IndexedDB');
    if (!fs.existsSync(indexedDB)) throw new Error(`数据目录没有卡图缓存：${source}`);
    const snapshot = path.join(work, 'profile');
    fs.mkdirSync(snapshot, { recursive: true });
    fs.cpSync(indexedDB, path.join(snapshot, 'IndexedDB'), { recursive: true });
    app.setPath('userData', snapshot);
    app.setPath('sessionData', snapshot);
    app.whenReady().then(exportCache).then(() => app.exit(0)).catch(fail);
  } catch (error) { fail(error); }
}

function fail(error) {
  console.error(error);
  app.exit(1);
}

async function exportCache() {
  const root = path.resolve(__dirname, '..');
  const html = path.join(work, 'export.html');
  await fsp.writeFile(html, '<!doctype html><meta charset="utf-8"><script src="./reader.js"></script>');
  const files = {
    '/export.html': html,
    '/reader.js': path.join(work, 'reader.js'),
    '/data/cards.json': path.join(root, 'public', 'data', 'cards.json'),
  };
  protocol.registerFileProtocol('kards', (request, callback) => {
    const file = files[new URL(request.url).pathname];
    callback(file ? { path: file } : { error: -6 });
  });
  const win = new BrowserWindow({ show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } });
  win.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (_details, callback) => callback({ cancel: true }));
  await win.loadURL('kards://app/export.html');
  const manifest = await win.webContents.executeJavaScript('cacheBundleReader.getManifest()');
  if (!manifest.keys.length) throw new Error('没有可打包的卡图，请先在应用中缓存卡图。');
  console.log(`卡牌数据 ${manifest.header.database.cards.length} 张，大图 ${manifest.full} 张，缩略图 ${manifest.thumbnail} 张`);
  const compressed = createBrotliCompress({ params: {
    [constants.BROTLI_PARAM_QUALITY]: 11,
    [constants.BROTLI_PARAM_LGWIN]: 24,
  } });
  const done = pipeline(compressed, fs.createWriteStream(output));
  void done.catch(() => {});
  const write = record => new Promise((resolve, reject) => compressed.write(`${JSON.stringify(record)}\n`, error => error ? reject(error) : resolve()));
  try {
    await write(manifest.header);
    let count = 0;
    for (const key of manifest.keys) {
      const value = await win.webContents.executeJavaScript(`cacheBundleReader.readImage(${JSON.stringify(key)})`);
      if (typeof value !== 'string' || value.length > 14 * 1024 * 1024 || !/^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value)) throw new Error(`卡图缓存损坏：${key}`);
      await write({ key, value });
      count++;
      if (count % 100 === 0 || count === manifest.keys.length) console.log(`压缩缓存 ${count} / ${manifest.keys.length}`);
    }
    await write({ complete: true, imageCount: count });
    compressed.end();
    await done;
    console.log(`缓存包 ${(fs.statSync(output).size / 1024 / 1024).toFixed(1)} MiB`);
  } catch (error) {
    compressed.destroy();
    await done.catch(() => {});
    throw error;
  }
}
