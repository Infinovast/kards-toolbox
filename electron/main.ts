import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeImage, nativeTheme, net, protocol } from 'electron';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { renderDeckImage } from './deckRenderer';
import { recognizeDeckImage } from './windowsOcr';
import { resolveUserDataPath } from './userDataPath';
import { CacheBundleInstaller, configurePackManager, validateImageReference } from './cacheBundle';
import { fetchCardDataPage, type CardDataSource } from '../src/lib/cardData';
import { downloadCardImage, downloadCardImageBytes } from '../src/lib/cardImageDownload';
import { isBundleImageData, cardPackCacheKey, type CardImageReference } from '../src/lib/cacheBundleFormat';
import { pathToFileURL } from 'node:url';
import type { DeckRenderRequest } from '../src/lib/deckRenderTypes';
import { LOGOS } from '../src/lib/assetCatalog';

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'kards',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
    },
  },
]);

app.commandLine.appendSwitch('disable-crash-reporter');

const isDev = !app.isPackaged && process.env.KARDS_USE_DIST !== '1';
const rendererUrl = process.env.ELECTRON_RENDERER_URL || 'http://127.0.0.1:5173';
const appName = 'KARDS Toolbox';
let mainWindow: BrowserWindow | null = null;
let cacheBundle: CacheBundleInstaller;

type BackupPayload = {
  schemaVersion: number;
  exportedAt: string;
  data: Record<string, unknown>;
};

declare const __KARDS_ENABLE_DEVELOPER_OPTIONS__: boolean;
const enableDeveloperOptions = __KARDS_ENABLE_DEVELOPER_OPTIONS__;

function getRendererDistPath(relativePath = 'index.html') {
  const normalized = decodeURIComponent(relativePath).replace(/^\/+/, '') || 'index.html';
  const root = path.resolve(__dirname, '..', 'dist');
  const resolved = path.resolve(root, normalized);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) throw new Error('资源路径无效');
  return resolved;
}

async function getIcon(dark = nativeTheme.shouldUseDarkColors) {
  const asset = await cacheBundle.readStaticAsset(dark ? LOGOS.app.white : LOGOS.app.black);
  return asset ? nativeImage.createFromBuffer(asset.buffer) : nativeImage.createEmpty();
}

async function showLoadFailure(mainWindow: BrowserWindow, details: string) {
  const message = [
    '<!doctype html>',
    '<html><body style="font-family:Segoe UI,Arial,sans-serif;background:#151515;color:#eee;padding:32px;">',
    '<h1>KARDS 工具箱</h1>',
    '<p>The desktop renderer could not be loaded.</p>',
    `<pre style="white-space:pre-wrap;background:#242424;padding:16px;border:1px solid #444;">${details}</pre>`,
    '</body></html>',
  ].join('');

  await mainWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(message)}`);
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 980,
    minHeight: 640,
    title: appName,
    icon: await getIcon(),
    show: false,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });
  mainWindow.setMenuBarVisibility(false);
  mainWindow.setAutoHideMenuBar(true);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedUrl) => {
    if (mainWindow) {
      showLoadFailure(mainWindow, `Code: ${errorCode}\nDetails: ${errorDescription}\nURL: ${validatedUrl}`).catch(console.error);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  try {
    if (isDev) {
      await mainWindow.loadURL(rendererUrl);
    } else {
      await mainWindow.loadURL('kards://app/index.html');
    }
  } catch (error) {
    await showLoadFailure(mainWindow, error instanceof Error ? error.stack || error.message : String(error));
  }
}

function registerAppProtocol() {
  protocol.handle('kards', async request => {
    try {
      const url = new URL(request.url);
      if (url.host !== 'app' || request.method !== 'GET') return new Response(null, { status: 403 });
      const pathname = decodeURIComponent(url.pathname);
      const image = pathname.startsWith('/assets/') && !/\.(js|css|map)$/.test(pathname) ? await cacheBundle.readStaticAsset(pathname)
        : pathname === '/card-image' ? await cacheBundle.readCardImage(url.searchParams.get('cardId')!, url.searchParams.get('variant') as 'full' | 'thumb', url.searchParams.get('url')!) : undefined;
      if (image !== undefined) return image ? new Response(new Uint8Array(image.buffer), { headers: {
        'Content-Type': image.mime, 'Cache-Control': pathname === '/card-image' ? 'public, max-age=31536000, immutable' : 'no-cache',
        'Access-Control-Allow-Origin': '*', 'X-Content-Type-Options': 'nosniff',
      } }) : new Response(null, { status: 404 });
      return net.fetch(pathToFileURL(getRendererDistPath(pathname)).href);
    } catch (error) {
      console.error('Local resource:', error);
      return new Response(null, { status: 404 });
    }
  });
}

function registerIpcHandlers() {
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    const sender = event.senderFrame?.url || '';
    if (!sender.startsWith('kards://app/') && !(isDev && new URL(sender).origin === new URL(rendererUrl).origin)) throw new Error('不允许的资源请求来源');
  };
  ipcMain.handle('cache-bundle:prepare', event => { trusted(event); return cacheBundle.prepare(); });
  ipcMain.handle('cache-bundle:finish', event => { trusted(event); return cacheBundle.finish(); });
  ipcMain.handle('card-pack:list', event => { trusted(event); return cacheBundle.listCardImageKeys(); });
  ipcMain.handle('card-pack:delete', (event, refs: CardImageReference[]) => {
    trusted(event); if (!Array.isArray(refs) || refs.length > 50000) throw new Error('缓存删除列表无效');
    return cacheBundle.deleteCardImages(refs);
  });
  ipcMain.handle('card-pack:compact', event => { trusted(event); return cacheBundle.compactCardPack(); });
  ipcMain.handle('card-pack:download', async (event, request: CardImageReference) => {
    trusted(event); const ref = validateImageReference(request);
    const { bytes, mime } = await downloadCardImageBytes(ref.url, net.fetch as typeof fetch);
    await cacheBundle.appendCardImages([{ ...ref, buffer: Buffer.from(bytes), mime }]);
    return { ...ref, key: cardPackCacheKey(ref), size: bytes.length, mime, updatedAt: new Date().toISOString() };
  });
  // One-time legacy migration is bounded and signature checked, like downloads.
  ipcMain.handle('card-pack:import-legacy', async (event, ref: CardImageReference, data: string) => {
    trusted(event); if (!isBundleImageData(data)) throw new Error('旧卡图缓存无效');
    const meta = validateImageReference(ref), buffer = Buffer.from(data.slice(data.indexOf(',') + 1), 'base64');
    const mime = data.slice(5, data.indexOf(';'));
    await cacheBundle.appendCardImages([{ ...meta, buffer, mime }]);
  });
  ipcMain.handle('cards:fetch-page', (_event, offset: number, source: CardDataSource) => fetchCardDataPage(offset, source, net.fetch as typeof fetch));
  ipcMain.handle('cards:fetch-image', (_event, url: string) => downloadCardImage(url, net.fetch as typeof fetch));
  ipcMain.handle('app:get-info', () => ({
    name: appName,
    version: app.getVersion(),
    userDataPath: app.getPath('userData'),
    packaged: app.isPackaged,
    developerOptions: enableDeveloperOptions,
    darkIcon: nativeTheme.shouldUseDarkColors,
  }));

  ipcMain.handle('deck:render', (_event, request: DeckRenderRequest) => renderDeckImage(request));
  ipcMain.handle('deck:recognize-image', (_event, data: string) => recognizeDeckImage(data));
  ipcMain.handle('app:set-theme', async (_event, mode: string) => {
    if (!['dark', 'light', 'system'].includes(mode)) throw new Error('无效主题');
    nativeTheme.themeSource = mode as 'dark' | 'light' | 'system';
    mainWindow?.setIcon(await getIcon());
    return nativeTheme.shouldUseDarkColors;
  });

  ipcMain.handle('clipboard:read-text', () => clipboard.readText());

  ipcMain.handle('backup:save', async (_event, backup: BackupPayload) => {
    if (!backup || backup.schemaVersion !== 1 || typeof backup.data !== 'object') {
      throw new Error('Invalid backup payload.');
    }

    const defaultPath = path.join(
      app.getPath('documents'),
      `kards-toolbox-backup-${new Date().toISOString().slice(0, 10)}.json`,
    );

    const result = await dialog.showSaveDialog({
      title: '导出 KARDS 工具箱备份',
      defaultPath,
      filters: [{ name: 'KARDS backup', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePath) {
      return { canceled: true };
    }

    await fs.writeFile(result.filePath, JSON.stringify(backup, null, 2), 'utf-8');
    return { canceled: false, filePath: result.filePath };
  });

  ipcMain.handle('backup:open', async () => {
    const result = await dialog.showOpenDialog({
      title: '导入 KARDS 工具箱备份',
      properties: ['openFile'],
      filters: [{ name: 'KARDS backup', extensions: ['json'] }],
    });

    if (result.canceled || !result.filePaths[0]) {
      return { canceled: true };
    }

    const content = await fs.readFile(result.filePaths[0], 'utf-8');
    return {
      canceled: false,
      filePath: result.filePaths[0],
      content,
    };
  });
}

nativeTheme.on('updated', () => { void getIcon().then(icon => mainWindow?.setIcon(icon)).catch(console.error); });
app.setName(appName);
// An explicit profile remains available for isolated runs and development.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const profilePath = resolveUserDataPath(app.getPath('appData'));
  mkdirSync(profilePath, { recursive: true });
  app.setPath('userData', profilePath);
  app.setPath('sessionData', profilePath);
}
cacheBundle = new CacheBundleInstaller(app.getPath('userData'), process.env.PORTABLE_EXECUTABLE_DIR || path.dirname(process.execPath), {
  root: app.getAppPath(), packaged: app.isPackaged || process.env.KARDS_USE_PACKS === '1', staticPack: path.join(__dirname, 'static.kpak'),
});
configurePackManager(cacheBundle);
// Also prevents a build-time cache snapshot from racing a running application.
const primaryInstance = app.requestSingleInstanceLock();
if (!primaryInstance) app.quit();
app.on('second-instance', (_event, _argv, _directory, data: { cacheExport?: boolean }) => {
  if (data?.cacheExport) return;
  if (mainWindow?.isMinimized()) mainWindow.restore();
  mainWindow?.show();
  mainWindow?.focus();
});

if (primaryInstance) app.whenReady().then(async () => {
  registerIpcHandlers();
  registerAppProtocol();
  await createMainWindow();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createMainWindow();
    }
  });
}).catch((error) => {
  dialog.showErrorBox(appName, error instanceof Error ? error.message : String(error));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
