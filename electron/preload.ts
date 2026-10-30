import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kardsDesktop', {
  prepareCacheBundle: () => ipcRenderer.invoke('cache-bundle:prepare'),
  readCacheBundleImage: (index: number) => ipcRenderer.invoke('cache-bundle:read-image', index),
  finishCacheBundle: () => ipcRenderer.invoke('cache-bundle:finish'),
  fetchCardDataPage: (offset: number, source: import('../src/lib/cardData').CardDataSource) => ipcRenderer.invoke('cards:fetch-page', offset, source),
  fetchCardImage: (url: string) => ipcRenderer.invoke('cards:fetch-image', url),
  renderDeckImage: (request: unknown) => ipcRenderer.invoke('deck:render', request),
  recognizeDeckImage: (data: string) => ipcRenderer.invoke('deck:recognize-image', data),
  setTheme: (mode: string) => ipcRenderer.invoke('app:set-theme', mode),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  saveBackup: (backup: unknown) => ipcRenderer.invoke('backup:save', backup),
  openBackup: () => ipcRenderer.invoke('backup:open'),
});
