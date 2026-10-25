import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDeckCode, encodeDeckCode, findCardsByImportId } from './deckCode';
import { DEFAULT_DECK_RULES, validateDeck } from './deckRules';
import type { KardsCardRecord } from '../types/card';

const cards = JSON.parse(readFileSync('public/data/cards-v54.json', 'utf8')).cards as KardsCardRecord[];
const index = findCardsByImportId(cards);
const sample = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
const decoded = decodeDeckCode(`  我的卡组\n${sample}\n复制到游戏中`);
assert.equal(decoded.mainNation, 'Japan');
assert.equal(decoded.allyNation, 'Germany');
assert.equal([...decoded.counts.values()].reduce((a, b) => a + b), 39);
assert.deepEqual(decodeDeckCode(encodeDeckCode(decoded.mainNation, decoded.allyNation, decoded.counts)), decoded);
for (const quantity of [1, 2, 3, 4, 5, 8, 9, 99]) {
  assert.equal(decodeDeckCode(encodeDeckCode('Germany', 'Anzac', new Map([['rV', quantity]]))).counts.get('rV'), quantity);
}
assert.equal(decodeDeckCode('%%1a|rV;;;').allyNation, 'Anzac');
assert.equal(decodeDeckCode('%%11|;;;').counts.size, 0);
assert.equal(decodeDeckCode('%%11|aa;aa;;').counts.get('aa'), 3);
for (const invalid of ['hello', '%%01|;;;', '%%1x|;;;', '%%11|a;;;', '%%11|aa;;', '%%11|aa;bb;;|']) assert.throws(() => decodeDeckCode(invalid), invalid);
assert.throws(() => encodeDeckCode('Germany', 'Japan', new Map([['rV', 0]])));
const fixtures: KardsCardRecord[] = ['Standard', 'Limited', 'Special', 'Elite'].map((rarity, i) => ({
  id: i, importId: `a${i}`, cardId: `fixture${i}`, reserved: false,
  json: { rarity, faction: 'Germany', set: 'Base', title: { 'zh-Hans': rarity } },
}));
const fixtureIndex = findCardsByImportId(fixtures);
const legalCounts = new Map([['a0', 4], ['a1', 3], ['a2', 2], ['a3', 1]]);
assert.deepEqual(validateDeck(legalCounts, fixtureIndex, 'Germany', 'Germany', { ...DEFAULT_DECK_RULES.standard, deckSize: 10 }), []);
assert.equal(validateDeck(new Map([['a3', 2]]), fixtureIndex, 'Germany', 'Germany', { ...DEFAULT_DECK_RULES.standard, deckSize: 2 }).length, 1);
assert.deepEqual(validateDeck(new Map([['a3', 9]]), fixtureIndex, 'Germany', 'Germany', { ...DEFAULT_DECK_RULES.arena, deckSize: 9 }), []);
const unknown = decodeDeckCode('%%12|ZZ;;;');
assert.equal(encodeDeckCode(unknown.mainNation, unknown.allyNation, unknown.counts), '%%12|ZZ;;;');
assert.match(validateDeck(unknown.counts, new Map(), 'Germany', 'Britain', DEFAULT_DECK_RULES.standard).join(' '), /缺少卡牌 ZZ/);
assert(cards.length > 1600);
assert(index.size > 1600);
console.log('deck codec and rule tests passed (real 39-card deck, quantities, ANZAC, unknown IDs, rarity limits)');
