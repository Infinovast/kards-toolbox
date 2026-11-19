import { parseCardDataPage, type CardDataSource } from './cardData';

type DirectMethod = 'prepareCacheBundle' | 'finishCacheBundle' | 'listCardImageKeys'
  | 'deleteCardImages' | 'compactCardPack' | 'cacheCardImage' | 'setTheme'
  | 'getAppInfo' | 'readClipboardText' | 'openBackup' | 'saveDeckImage';

export type WailsApp = {
  [Method in DirectMethod as Capitalize<Method>]: NonNullable<KardsDesktopBridge[Method]>;
} & {
  FetchCardDataPage(offset: number, source: CardDataSource): Promise<string>;
  SaveBackup(content: string): Promise<KardsDesktopBackupSaveResult>;
  ReadCardDataStorage(): Promise<string>;
  WriteCardDataStorage(content: string): Promise<void>;
};

export function installWailsDesktopBridge() {
  const app = window.go?.main?.App;
  if (!app) return;
  window.kardsDesktop = {
    cardImageEndpoint: '/card-image',
    prepareCacheBundle: app.PrepareCacheBundle,
    finishCacheBundle: app.FinishCacheBundle,
    listCardImageKeys: app.ListCardImageKeys,
    deleteCardImages: app.DeleteCardImages,
    compactCardPack: app.CompactCardPack,
    cacheCardImage: app.CacheCardImage,
    setTheme: app.SetTheme,
    getAppInfo: app.GetAppInfo,
    readClipboardText: app.ReadClipboardText,
    writeClipboardText: window.runtime?.ClipboardSetText ? async text => {
      if (!await window.runtime!.ClipboardSetText!(text)) throw new Error('无法写入剪贴板');
    } : undefined,
    openBackup: app.OpenBackup,
    saveDeckImage: app.SaveDeckImage,
    fetchCardDataPage: async (offset, source) => parseCardDataPage(JSON.parse(await app.FetchCardDataPage(offset, source)), source),
    saveBackup: backup => app.SaveBackup(JSON.stringify(backup)),
  };
}
