import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('kardsDesktop', {
  getAppInfo: () => ipcRenderer.invoke('app:get-info'),
  readClipboardText: () => ipcRenderer.invoke('clipboard:read-text'),
  saveBackup: (backup: unknown) => ipcRenderer.invoke('backup:save', backup),
  openBackup: () => ipcRenderer.invoke('backup:open'),
});
