import assert from 'node:assert/strict';
import localforage from 'localforage';
import { createBackup, parseBackup, restoreBackup } from './backup';
import { addPackHistory, emptyPackHistory, type PackHistory } from './packHistory';
import { AUTO_BACKUPS_KEY, RESTORE_JOURNAL_KEY, loadUserData, readAutomaticBackups, saveUserData, updateUserData, retryUserDataWrites, userDataStorageStatus } from './userDataStorage';

const stored = new Map<string, unknown>();
const writes: string[] = [];
let readFailure = '';
let writeFailure = '';
let failuresRemaining = 0;
localforage.getItem = async <T>(key: string) => {
  if (key === readFailure) throw new Error('read failed');
  return structuredClone(stored.get(key) ?? null) as T;
};
localforage.setItem = async <T>(key: string, value: T) => {
  if (key === writeFailure && failuresRemaining-- > 0) throw new Error('disk full');
  writes.push(key); stored.set(key, structuredClone(value)); return value;
};
localforage.removeItem = async (key: string) => { writes.push(key); stored.delete(key); };
localforage.iterate = async <T, U>(iterator: (value: T, key: string, iteration: number) => U | undefined) => { for (const [key, value] of stored) iterator(value as T, key, 1); return undefined as U; };
const backup = (data: Record<string, unknown>) => ({ app: 'kards-toolbox' as const, schemaVersion: 1, exportedAt: new Date().toISOString(), data });

stored.set('kards_decks', []);
stored.set('kards_settings', { displayMode: 'dark' });
readFailure = 'kards_settings';
await assert.rejects(loadUserData(), /read failed/);
assert.deepEqual(writes, [], 'a partial/failed initial read never writes defaults or backup snapshots');
assert.deepEqual(stored.get('kards_settings'), { displayMode: 'dark' });
readFailure = '';
stored.set('kards_collections', { invalid: true });
await assert.rejects(loadUserData(), /数据格式无效/);
assert.deepEqual(writes, [], 'malformed saved data must not become defaults');
stored.delete('kards_collections');
await loadUserData();
assert.equal((await readAutomaticBackups()).length, 1);
await loadUserData();
assert.equal((await readAutomaticBackups()).length, 1, 'identical initializations do not evict earlier backups');

writeFailure = 'kards_settings'; failuresRemaining = 1;
await assert.rejects(saveUserData('kards_settings', { displayMode: 'light' }), /disk full/);
assert.match(userDataStorageStatus().error, /disk full/);
await assert.rejects(createBackup(), /尚未保存/);
await retryUserDataWrites();
assert.equal(userDataStorageStatus().error, '');
assert.equal(userDataStorageStatus().pending, 0);
assert.deepEqual(stored.get('kards_settings'), { displayMode: 'light' });
// Retrying while a newer autosave is pending must never resurrect an older value.
failuresRemaining = 1;
await assert.rejects(saveUserData('kards_settings', { displayMode: 'dark' }));
await Promise.all([saveUserData('kards_settings', { displayMode: 'system' }), retryUserDataWrites()]);
assert.deepEqual(stored.get('kards_settings'), { displayMode: 'system' });

for (const data of [{ kards_decks: [null] }, { kards_settings: { uiScale: 'large' } }, { kards_pack_history_v1: {} }, { kards_custom_tablecloths: [5] }, { unexpected_key: [] }]) {
  const before = writes.length;
  assert.throws(() => parseBackup(JSON.stringify(backup(data))));
  await assert.rejects(restoreBackup(backup(data)));
  assert.equal(writes.length, before, 'validate every item before the first write');
}

stored.set('kards_collections', [{ id: 'old', name: 'old', deckIds: [] }]);
const originalFolders = structuredClone(stored.get('kards_collections'));
writeFailure = 'kards_settings'; failuresRemaining = 1;
await assert.rejects(restoreBackup(backup({ kards_collections: [], kards_settings: { displayMode: 'light' } })), /已回滚原数据/);
assert.deepEqual(stored.get('kards_collections'), originalFolders);
assert.deepEqual(stored.get('kards_settings'), { displayMode: 'system' });
assert.ok(!stored.has(RESTORE_JOURNAL_KEY));

await restoreBackup(backup({ kards_collections: [], kards_settings: { displayMode: 'dark' }, kards_pack_history_v1: emptyPackHistory() }));
assert.deepEqual(stored.get('kards_collections'), []);
assert.deepEqual(stored.get('kards_pack_history_v1'), emptyPackHistory());
const exported = await createBackup();
assert.deepEqual(exported.data.kards_pack_history_v1, emptyPackHistory());
assert.ok(!Object.keys(exported.data).some(key => [AUTO_BACKUPS_KEY, RESTORE_JOURNAL_KEY].includes(key)));
await Promise.all(Array.from({ length: 2 }, () => updateUserData<PackHistory>('kards_pack_history_v1', current => addPackHistory(current || emptyPackHistory(), 'officer', Array.from({ length: 7 }, () => ({ kind: 'wildcard', rarity: 'Elite' }))))));
assert.equal((stored.get('kards_pack_history_v1') as PackHistory).officer, 2, 'overlapping pack opens use an atomic read-modify-write');
assert.equal((stored.get('kards_pack_history_v1') as PackHistory).rarities.Elite, 14);

// An interrupted restore is rolled back before values are exposed to React.
stored.set(RESTORE_JOURNAL_KEY, { schemaVersion: 1, before: { kards_settings: { displayMode: 'light' }, kards_collections: originalFolders } });
stored.set('kards_collections', []);
const recovered = await loadUserData();
assert.deepEqual(recovered.kards_collections, originalFolders);
assert.deepEqual(recovered.kards_settings, { displayMode: 'light' });
assert.ok(!stored.has(RESTORE_JOURNAL_KEY));

// If rollback also fails, retain its journal and refuse unrelated autosaves.
writeFailure = 'kards_settings'; failuresRemaining = 2;
await assert.rejects(restoreBackup(backup({ kards_collections: [], kards_settings: { displayMode: 'dark' } })), /回滚尚未完成/);
assert.ok(stored.has(RESTORE_JOURNAL_KEY));
await assert.rejects(saveUserData('kards_decks', [], { rememberFailure: false }), /恢复未完成/);
await loadUserData();
assert.deepEqual(stored.get('kards_collections'), originalFolders);
assert.ok(!stored.has(RESTORE_JOURNAL_KEY));

// Repair imports can replace malformed old data, while keeping rollback values.
stored.set('kards_settings', { uiScale: 'bad' });
await restoreBackup(backup({ kards_settings: { displayMode: 'dark' } }));
assert.deepEqual(stored.get('kards_settings'), { displayMode: 'dark' });
for (const displayMode of ['light', 'system', 'dark', 'light']) { stored.set('kards_settings', { displayMode }); await loadUserData(); }
assert.equal((await readAutomaticBackups()).length, 3, 'automatic safety snapshots are bounded');
console.log('user-data read protection, save retry, validated restores, rollback and crash recovery passed');
