import assert from 'node:assert/strict';
import { extractDeckCodeFromText, inferDeckTitleFromText } from './deckImport.ts';

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

console.log('deck import tests passed');
