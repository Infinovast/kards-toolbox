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

  interface Window {
    kardsDesktop?: {
      prepareCacheBundle: () => Promise<import('../lib/cacheBundleFormat').CacheBundleInfo | null>;
      finishCacheBundle: () => Promise<void>;
      listCardImageKeys: () => Promise<import('../lib/cacheBundleFormat').CardPackStats>;
      deleteCardImages: (refs: import('../lib/cacheBundleFormat').CardImageReference[]) => Promise<void>;
      compactCardPack: () => Promise<void>;
      cacheCardImage: (ref: import('../lib/cacheBundleFormat').CardImageReference) => Promise<import('../lib/cacheBundleFormat').CardImageMetadata>;
      importLegacyCardImage: (ref: import('../lib/cacheBundleFormat').CardImageReference, data: string) => Promise<void>;
      fetchCardDataPage: (offset: number, source: import('../lib/cardData').CardDataSource) => Promise<import('../lib/cardData').CardDataPage>;
      fetchCardImage: (url: string) => Promise<string>;
      renderDeckImage: (request: import('../lib/deckRenderTypes').DeckRenderRequest) => Promise<string>;
      recognizeDeckImage: (data: string) => Promise<import('../lib/deckImageImport').WindowsOcrResult>;
      setTheme: (mode: 'dark' | 'light' | 'system') => Promise<boolean>;
      getAppInfo: () => Promise<KardsDesktopAppInfo>;
      readClipboardText: () => Promise<string>;
      saveBackup: (backup: unknown) => Promise<KardsDesktopBackupSaveResult>;
      openBackup: () => Promise<KardsDesktopBackupOpenResult>;
    };
  }
}
