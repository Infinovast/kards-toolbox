import assert from 'node:assert/strict';
import localforage from 'localforage';
import { createBackup, parseBackup } from './backup';
for (const app of ['kards-toolbox', 'kards-local-tool', 'kards-deck-collector']) {
  assert.equal(parseBackup(JSON.stringify({ app, schemaVersion: 1, data: { kards_decks: [] } })).app, app);
}
for (const invalid of ['null', '{}', '{"app":"kards-local-tool","schemaVersion":1,"data":null}', '{"app":"kards-local-tool","schemaVersion":1,"data":[]}']) assert.throws(() => parseBackup(invalid));
const stored = new Map<string, unknown>([
  ['kards_decks', []], ['deck_img_local_v1_fixture', 'deck-image'],
  ['kards_card_image_v2_fixture', 'card-image'], ['kards_card_image_failures_v1', { fixture: { message: 'offline', at: '2026-10-26' } }],
  ['kards_card_image_batch_v1', { importIds: ['lV'] }],
]);
localforage.getItem = async <T>(key: string) => (stored.get(key) ?? null) as T;
localforage.iterate = async <T, U>(iterator: (value: T, key: string, iteration: number) => U | undefined) => { for (const [key, value] of stored) iterator(value as T, key, 1); return undefined as U; };
const backup = await createBackup();
assert.equal(backup.data.deck_img_local_v1_fixture, 'deck-image');
assert.ok(!Object.keys(backup.data).some(key => key.startsWith('kards_card_image_')), 'ordinary images, failures and batch scope are separate from user backups');
console.log('backup format compatibility tests passed');
