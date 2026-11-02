import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { decodeDeckCode, encodeDeckCode, findCardsByImportId } from './deckCode';
import { DEFAULT_DECK_RULES, deckModeLabel, deckRuleSet, validateDeck } from './deckRules';
import type { KardsCardRecord } from '../types/card';

const cards = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards as KardsCardRecord[];
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
const allyWarning = '盟国牌数量过多';
for (const ruleSet of ['standard', 'arena'] as const) {
  const rules = DEFAULT_DECK_RULES[ruleSet];
  assert.equal(rules.maxAllyCards, 12);
  assert.ok(!validateDeck(new Map([['a0', 12]]), fixtureIndex, 'Britain', 'Germany', rules).includes(allyWarning));
  assert.ok(validateDeck(new Map([['a0', 13]]), fixtureIndex, 'Britain', 'Germany', rules).includes(allyWarning));
  assert.ok(!validateDeck(new Map([['a0', 13]]), fixtureIndex, 'Germany', 'Germany', rules).includes(allyWarning));
}
const reservedCard = { ...fixtures[0], importId: 'r0', reserved: true };
const modeIndex = findCardsByImportId([...fixtures, reservedCard]);
assert.equal(deckRuleSet(new Map(), modeIndex), 'standard');
assert.equal(deckRuleSet(new Map([['a0', 4]]), modeIndex), 'standard');
assert.equal(deckRuleSet(new Map([['a0', 4], ['r0', 1]]), modeIndex), 'arena');
assert.equal(deckRuleSet(new Map([['r0', 0]]), modeIndex), 'standard');
assert.equal(deckModeLabel('standard'), '排位/休闲模式');
assert.equal(deckModeLabel('arena'), '经典模式');
const unknown = decodeDeckCode('%%12|ZZ;;;');
assert.equal(encodeDeckCode(unknown.mainNation, unknown.allyNation, unknown.counts), '%%12|ZZ;;;');
assert.match(validateDeck(unknown.counts, new Map(), 'Germany', 'Britain', DEFAULT_DECK_RULES.standard).join(' '), /缺少卡牌 ZZ/);
assert(cards.length > 1600);
assert(index.size > 1600);
console.log('deck codec and rule tests passed (real 39-card deck, quantities, ANZAC, unknown IDs, rarity limits)');
