export {};

declare global {
  interface KardsDesktopAppInfo {
    name: string;
    version: string;
    userDataPath: string;
    packaged: boolean;
    developerOptions: boolean;
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
      getAppInfo: () => Promise<KardsDesktopAppInfo>;
      readClipboardText: () => Promise<string>;
      saveBackup: (backup: unknown) => Promise<KardsDesktopBackupSaveResult>;
      openBackup: () => Promise<KardsDesktopBackupOpenResult>;
    };
  }
}
