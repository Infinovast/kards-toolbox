import assert from 'node:assert/strict';
import { parseBackup } from './backup';
for (const app of ['kards-local-tool', 'kards-deck-collector']) {
  assert.equal(parseBackup(JSON.stringify({ app, schemaVersion: 1, data: { kards_decks: [] } })).app, app);
}
for (const invalid of ['null', '{}', '{"app":"kards-local-tool","schemaVersion":1,"data":null}', '{"app":"kards-local-tool","schemaVersion":1,"data":[]}']) assert.throws(() => parseBackup(invalid));
console.log('backup format compatibility tests passed');
