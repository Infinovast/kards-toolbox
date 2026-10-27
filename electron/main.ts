import { app, BrowserWindow, clipboard, dialog, ipcMain, nativeTheme, net, protocol } from 'electron';
import fs from 'fs/promises';
import { mkdirSync } from 'fs';
import path from 'path';
import { renderKardsmanDeck } from './deckRenderer';
import { resolveUserDataPath } from './userDataPath';
import { fetchCardDataPage, type CardDataSource } from '../src/lib/cardData';
import { downloadCardImage } from '../src/lib/cardImageDownload';
import type { DeckRenderRequest } from '../src/lib/deckRenderTypes';

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

function getIconPath(dark = nativeTheme.shouldUseDarkColors) {
  return path.join(__dirname, '..', 'dist', 'assets', 'kards_logos', 'Common', dark ? 'KardsLogoWhite_icon.png' : 'KardsLogoBlack_icon.png');
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
    icon: getIconPath(),
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
  if (isDev) return;

  protocol.registerFileProtocol('kards', (request, callback) => {
    try {
      const url = new URL(request.url);
      const filePath = getRendererDistPath(url.pathname);
      callback({ path: filePath });
    } catch (error) {
      callback({ error: -6 });
    }
  });
}

function registerIpcHandlers() {
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

  ipcMain.handle('deck:render', (_event, request: DeckRenderRequest) => renderKardsmanDeck(request));
  ipcMain.handle('app:set-theme', (_event, mode: string) => {
    if (!['dark', 'light', 'system'].includes(mode)) throw new Error('无效主题');
    nativeTheme.themeSource = mode as 'dark' | 'light' | 'system';
    mainWindow?.setIcon(getIconPath());
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

nativeTheme.on('updated', () => mainWindow?.setIcon(getIconPath()));
app.setName(appName);
// Reuse an existing profile after the rename; never move or overwrite user data.
// Explicit test/portable profile overrides keep their original behavior.
if (!app.commandLine.hasSwitch('user-data-dir')) {
  const profilePath = resolveUserDataPath(app.getPath('appData'));
  mkdirSync(profilePath, { recursive: true });
  app.setPath('userData', profilePath);
  app.setPath('sessionData', profilePath);
}
registerIpcHandlers();

app.whenReady().then(async () => {
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
