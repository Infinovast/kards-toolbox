import assert from 'node:assert/strict';
import { extractDeckCodeFromText, inferDeckTitleFromText } from './deckImport.ts';
import { defaultDeckName, normalizeDeckName } from './deckName.ts';

const deckCode = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';

const fullDeckShare = `Japan Germany Aggro
Major power: japan
Ally: germany
HQ: Truk

japan:
1x (1K) Infantry Regiment

germany:
3x (1K) Suppression

${deckCode}`;

assert.equal(extractDeckCodeFromText(deckCode), deckCode);
assert.equal(extractDeckCodeFromText(fullDeckShare), deckCode);
assert.equal(extractDeckCodeFromText(`Aggro list: ${deckCode}, win rate is fine`), deckCode);
assert.equal(extractDeckCodeFromText(`pasted from game ${deckCode}`), deckCode);
assert.equal(inferDeckTitleFromText(fullDeckShare, deckCode), 'Japan Germany Aggro');

const shareWithoutTitle = `Major power: japan
Ally: germany

${deckCode}`;

assert.equal(inferDeckTitleFromText(shareWithoutTitle, deckCode), '');

const shareWithCardLineFirst = `1x (1K) Infantry Regiment
${deckCode}`;

assert.equal(inferDeckTitleFromText(shareWithCardLineFirst, deckCode), '');

assert.equal(defaultDeckName('Soviet', 'Germany'), '苏德卡组');
assert.equal(defaultDeckName('Germany', 'Soviet'), '德苏卡组');
assert.equal(defaultDeckName('Japan', 'Japan'), '日卡组');
assert.equal(defaultDeckName('USA', 'Anzac'), '美澳卡组');
assert.equal(defaultDeckName('Britain'), '英卡组');
assert.equal(normalizeDeckName('  Japan Germany Aggro  ', '日德卡组'), 'Japan Germany Aggro');
assert.equal(normalizeDeckName('!!!☠️', '日德卡组'), '日德卡组');
assert.equal(normalizeDeckName('   ', '日德卡组'), '日德卡组');

console.log('deck import tests passed');
