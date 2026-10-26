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
      fetchCardDataPage: (offset: number, source: import('../lib/cardData').CardDataSource) => Promise<import('../lib/cardData').CardDataPage>;
      fetchCardImage: (url: string) => Promise<string>;
      renderDeckImage: (request: import('../lib/deckRenderTypes').DeckRenderRequest) => Promise<string>;
      setTheme: (mode: 'dark' | 'light' | 'system') => Promise<boolean>;
      getAppInfo: () => Promise<KardsDesktopAppInfo>;
      readClipboardText: () => Promise<string>;
      saveBackup: (backup: unknown) => Promise<KardsDesktopBackupSaveResult>;
      openBackup: () => Promise<KardsDesktopBackupOpenResult>;
    };
  }
}
