import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kardsDesktop', {
  fetchCardDataPage: (offset: number, source: import('../src/lib/cardData').CardDataSource) => ipcRenderer.invoke('cards:fetch-page', offset, source),
  fetchCardImage: (url: string) => ipcRenderer.invoke('cards:fetch-image', url),
  renderDeckImage: (request: unknown) => ipcRenderer.invoke('deck:render', request),
  setTheme: (mode: string) => ipcRenderer.invoke('app:set-theme', mode),
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  saveBackup: (backup: unknown) => ipcRenderer.invoke('backup:save', backup),
  openBackup: () => ipcRenderer.invoke('backup:open'),
});
