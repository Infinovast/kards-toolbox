export {};

declare global {
  interface KardsDesktopAppInfo {
    name: string;
    version: string;
    userDataPath: string;
    packaged: boolean;
    developerOptions: boolean;
    darkIcon: boolean;
  }

  interface KardsDesktopBackupOpenResult {
    canceled: boolean;
    filePath?: string;
    content?: string;
  }

  interface KardsDesktopBackupSaveResult {
    canceled: boolean;
    filePath?: string;
  }

  interface KardsDesktopBridge {
    cardImageEndpoint?: string;
    prepareCacheBundle: () => Promise<import('../lib/cacheBundleFormat').CacheBundleInfo | null>;
    finishCacheBundle: () => Promise<void>;
    listCardImageKeys: () => Promise<import('../lib/cacheBundleFormat').CardPackStats>;
    deleteCardImages: (refs: import('../lib/cacheBundleFormat').CardImageReference[]) => Promise<void>;
    compactCardPack: () => Promise<void>;
    cacheCardImage: (ref: import('../lib/cacheBundleFormat').CardImageReference) => Promise<import('../lib/cacheBundleFormat').CardImageMetadata>;
    fetchCardDataPage: (offset: number, source: import('../lib/cardData').CardDataSource) => Promise<import('../lib/cardData').CardDataPage>;
    fetchCardImage?: (url: string) => Promise<string>;
    renderDeckImage?: (request: import('../lib/deckRenderTypes').DeckRenderRequest) => Promise<string>;
    saveDeckImage?: (data: string, filename: string) => Promise<KardsDesktopBackupSaveResult>;
    setTheme: (mode: 'dark' | 'light' | 'system') => Promise<boolean>;
    getAppInfo: () => Promise<KardsDesktopAppInfo>;
    readClipboardText: () => Promise<string>;
    writeClipboardText?: (text: string) => Promise<void>;
    saveBackup: (backup: unknown) => Promise<KardsDesktopBackupSaveResult>;
    openBackup: () => Promise<KardsDesktopBackupOpenResult>;
  }

  interface Window {
    kardsDesktop?: KardsDesktopBridge;
    go?: { main?: { App?: import('../lib/wailsDesktop').WailsApp } };
    runtime?: { ClipboardSetText?: (text: string) => Promise<boolean> };
  }
}
