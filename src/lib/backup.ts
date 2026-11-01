import localforage from 'localforage';
import { USER_DATA_KEYS, validateUserDataValue } from './userDataSchema';
import { assertUserDataSaved, queueUserDataTask, replaceUserData } from './userDataStorage';

export const BACKUP_SCHEMA_VERSION = 1;

export const BACKUP_KEYS = USER_DATA_KEYS;

export type BackupKey = typeof BACKUP_KEYS[number] | `deck_img_${string}`;

export interface KardsBackup {
  schemaVersion: number;
  exportedAt: string;
  app: 'kards-toolbox' | 'kards-local-tool' | 'kards-deck-collector';
  data: Partial<Record<BackupKey, unknown>>;
}

export async function createBackup(): Promise<KardsBackup> {
  return queueUserDataTask(async () => {
    assertUserDataSaved();
    const data: Partial<Record<BackupKey, unknown>> = {};

    for (const key of BACKUP_KEYS) {
      data[key] = await localforage.getItem(key);
      validateUserDataValue(key, data[key]);
    }

    await localforage.iterate((value, key) => {
      if (key.startsWith('deck_img_')) {
        data[key as BackupKey] = value;
      }
    });

    return {
      schemaVersion: BACKUP_SCHEMA_VERSION,
      exportedAt: new Date().toISOString(),
      app: 'kards-toolbox',
      data,
    };
  });
}

export function parseBackup(content: string): KardsBackup {
  const parsed = JSON.parse(content) as KardsBackup;

  if (!parsed || !['kards-toolbox', 'kards-local-tool', 'kards-deck-collector'].includes(parsed.app) || parsed.schemaVersion !== BACKUP_SCHEMA_VERSION || !parsed.data || Array.isArray(parsed.data) || typeof parsed.data !== 'object') {
    throw new Error('Unsupported or invalid KARDS backup file.');
  }

  for (const [key, value] of Object.entries(parsed.data)) validateUserDataValue(key, value);

  return parsed;
}

export async function restoreBackup(backup: KardsBackup) {
  const validated = parseBackup(JSON.stringify(backup));
  await queueUserDataTask(() => replaceUserData(Object.entries(validated.data)));
}
