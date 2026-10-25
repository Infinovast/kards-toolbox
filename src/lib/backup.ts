import localforage from 'localforage';

export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_KEYS = [
  'kards_decks',
  'kards_builder_draft',
  'kards_collections',
  'kards_custom_categories',
  'kards_settings',
  'kards_selected_tablecloth',
  'kards_custom_tablecloths',
] as const;

export type BackupKey = typeof BACKUP_KEYS[number] | `deck_img_${string}`;

export interface KardsBackup {
  schemaVersion: number;
  exportedAt: string;
  app: 'kards-local-tool' | 'kards-deck-collector';
  data: Partial<Record<BackupKey, unknown>>;
}

export async function createBackup(): Promise<KardsBackup> {
  const data: Partial<Record<BackupKey, unknown>> = {};

  for (const key of BACKUP_KEYS) {
    data[key] = await localforage.getItem(key);
  }

  await localforage.iterate((value, key) => {
    if (key.startsWith('deck_img_')) {
      data[key as BackupKey] = value;
    }
  });

  return {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    app: 'kards-local-tool',
    data,
  };
}

export function parseBackup(content: string): KardsBackup {
  const parsed = JSON.parse(content) as KardsBackup;

  if (!parsed || !['kards-local-tool', 'kards-deck-collector'].includes(parsed.app) || parsed.schemaVersion !== BACKUP_SCHEMA_VERSION || !parsed.data || Array.isArray(parsed.data) || typeof parsed.data !== 'object') {
    throw new Error('Unsupported or invalid KARDS backup file.');
  }

  return parsed;
}

export async function restoreBackup(backup: KardsBackup) {
  const entries = Object.entries(backup.data);

  for (const [key] of entries) {
    const isKnownKey = BACKUP_KEYS.includes(key as typeof BACKUP_KEYS[number]) || key.startsWith('deck_img_');
    if (!isKnownKey) {
      throw new Error(`Unsupported backup key: ${key}`);
    }
  }

  for (const [key, value] of entries) {
    if (value === null || value === undefined) {
      await localforage.removeItem(key);
    } else {
      await localforage.setItem(key, value);
    }
  }
}
