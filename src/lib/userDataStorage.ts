import localforage from 'localforage';
import { USER_DATA_KEYS, validateUserDataValue, type UserDataValues } from './userDataSchema';

export const AUTO_BACKUPS_KEY = 'kards_user_auto_backups_v1';
export const RESTORE_JOURNAL_KEY = 'kards_user_restore_journal_v1';
export interface AutomaticBackup { createdAt: string; data: UserDataValues }
interface RestoreJournal { schemaVersion: 1; before: Record<string, unknown> }
interface WriteFailure { value: unknown; message: string }
let tail: Promise<unknown> = Promise.resolve();
const failed = new Map<string, WriteFailure>();
const listeners = new Set<() => void>();
let status = { pending: 0, error: '' };
let recoveryRequired = false;
export const subscribeUserDataStorage = (listener: () => void) => { listeners.add(listener); return () => { listeners.delete(listener); }; };
export const userDataStorageStatus = () => status;
function publish(pending = status.pending) {
  status = { pending, error: [...failed.values()].map(item => item.message).join('；') };
  listeners.forEach(listener => listener());
}

// All user-data writes, exports and restores share this queue. Image/database
// caches have a separate lifecycle and deliberately do not use it.
export function queueUserDataTask<T>(task: () => Promise<T>): Promise<T> {
  const result = tail.then(task);
  tail = result.catch(() => undefined);
  return result;
}

const writeValue = (key: string, value: unknown) => value === null || value === undefined
  ? localforage.removeItem(key) : localforage.setItem(key, value).then(() => undefined);

export function saveUserData(key: string, value: unknown, options: { rememberFailure?: boolean } = {}): Promise<void> {
  const copy = value == null ? null : structuredClone(value);
  publish(status.pending + 1);
  return queueUserDataTask(async () => {
    try {
      if (recoveryRequired) throw new Error('备份恢复未完成，请重新读取本地数据');
      validateUserDataValue(key, copy);
      await writeValue(key, copy);
      failed.delete(key);
    } catch (error) {
      if (options.rememberFailure !== false) failed.set(key, { value: copy, message: error instanceof Error ? error.message : '本地数据保存失败' });
      throw error;
    } finally { publish(status.pending - 1); }
  });
}

export async function retryUserDataWrites() {
  const entries = await queueUserDataTask(async () => [...failed.entries()]);
  await Promise.all(entries.filter(([key, item]) => failed.get(key) === item).map(([key, item]) => saveUserData(key, item.value)));
}

export function updateUserData<T>(key: string, update: (current: T | null) => T): Promise<T> {
  publish(status.pending + 1);
  return queueUserDataTask(async () => {
    try {
      if (recoveryRequired) throw new Error('备份恢复未完成，请重新读取本地数据');
      const current = await localforage.getItem<T>(key);
      validateUserDataValue(key, current);
      const next = update(current);
      validateUserDataValue(key, next);
      await writeValue(key, next);
      failed.delete(key);
      return next;
    } finally { publish(status.pending - 1); }
  });
}

export function assertUserDataSaved() {
  if (failed.size || recoveryRequired) throw new Error('有修改尚未保存，请先重试保存或重新读取本地数据');
}

export function flushUserData() {
  return queueUserDataTask(async () => { assertUserDataSaved(); });
}

async function rollbackJournal(journal: RestoreJournal) {
  for (const [key, value] of Object.entries(journal.before)) await writeValue(key, value);
  await localforage.removeItem(RESTORE_JOURNAL_KEY);
  recoveryRequired = false;
}

export async function recoverUserDataRestore() {
  const journal = await localforage.getItem<RestoreJournal>(RESTORE_JOURNAL_KEY);
  if (!journal) { recoveryRequired = false; return; }
  recoveryRequired = true;
  if (journal.schemaVersion !== 1 || !journal.before || typeof journal.before !== 'object' || Array.isArray(journal.before)) throw new Error('备份恢复记录无效，已停止自动保存');
  // Only the key names are validated here: rollback must also be able to put
  // back malformed old values after a user imports a repair backup.
  for (const key of Object.keys(journal.before)) validateUserDataValue(key, null);
  await rollbackJournal(journal);
}

async function readValues(validate = true): Promise<UserDataValues> {
  const data: UserDataValues = {};
  for (const key of USER_DATA_KEYS) {
    data[key] = await localforage.getItem(key);
    if (validate) validateUserDataValue(key, data[key]);
  }
  return data;
}

export async function snapshotUserData(data: UserDataValues) {
  if (!Object.values(data).some(value => value !== null && value !== undefined)) return;
  const backups = await localforage.getItem<AutomaticBackup[]>(AUTO_BACKUPS_KEY) || [];
  if (!Array.isArray(backups)) throw new Error('自动备份记录无效');
  if (JSON.stringify(backups[0]?.data) === JSON.stringify(data)) return;
  await localforage.setItem(AUTO_BACKUPS_KEY, [{ createdAt: new Date().toISOString(), data }, ...backups].slice(0, 3));
}

export function readAutomaticBackups() {
  return queueUserDataTask(async () => {
    const backups = await localforage.getItem<AutomaticBackup[]>(AUTO_BACKUPS_KEY) || [];
    if (!Array.isArray(backups)) throw new Error('自动备份记录无效');
    return backups;
  });
}

export function loadUserData() {
  return queueUserDataTask(async () => {
    await recoverUserDataRestore();
    const data = await readValues();
    // Migrate only absent values; malformed or unreadable data never becomes a
    // default that could subsequently overwrite the original storage.
    for (const key of USER_DATA_KEYS) {
      if (data[key] !== null || typeof localStorage === 'undefined') continue;
      const legacy = localStorage.getItem(key);
      if (legacy !== null) {
        data[key] = key === 'kards_selected_tablecloth' ? legacy : JSON.parse(legacy);
        validateUserDataValue(key, data[key]);
      }
    }
    await snapshotUserData(data);
    return data;
  });
}

// Called inside the shared queue after the entire incoming backup is validated.
export async function replaceUserData(entries: [string, unknown][]) {
  assertUserDataSaved();
  await recoverUserDataRestore();
  const current = await readValues(false);
  let valid = true;
  try { for (const [key, value] of Object.entries(current)) validateUserDataValue(key, value); } catch { valid = false; }
  if (valid) await snapshotUserData(current);
  const before: Record<string, unknown> = {};
  for (const [key] of entries) before[key] = await localforage.getItem(key);
  await localforage.setItem(RESTORE_JOURNAL_KEY, { schemaVersion: 1, before } satisfies RestoreJournal);
  recoveryRequired = true;
  try {
    for (const [key, value] of entries) await writeValue(key, value);
    await localforage.removeItem(RESTORE_JOURNAL_KEY);
    recoveryRequired = false;
  } catch (error) {
    try { await rollbackJournal({ schemaVersion: 1, before }); }
    catch { throw new Error('备份恢复中断，回滚尚未完成；原数据已保留在恢复记录中，请重试读取或重启应用'); }
    throw new Error(`备份恢复失败，已回滚原数据：${error instanceof Error ? error.message : String(error)}`);
  }
}
