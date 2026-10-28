import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_CARD_FILTERS, isInBuilderPool, matchesCardFilters } from './cardFilters';
import { CARD_SUBTYPES, cardSubtypeLabels } from './cardSubtypes';
import type { KardsCardRecord } from '../types/card';

const base: KardsCardRecord = { id: 1, cardId: 'card-a', importId: 'aa', reserved: false, json: {
  title: { 'zh-Hans': '测试步兵', 'en-EN': 'Test Infantry' }, description: { 'en-EN': 'Fallback rules' },
  faction: 'Germany', type: 'infantry', rarity: 'Standard', set: 'Base', kredits: 8,
} };
const changed = (json: Partial<KardsCardRecord['json']>, reserved = false) => ({ ...base, reserved, json: { ...base.json, ...json } });
for (const query of ['测试', 'INFANTRY', 'fallback', 'card-a', 'aa', '  步兵  ']) {
  assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, query }), query);
}
assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, query: 'not found' }));
const translated = changed({ title: { ...base.json.title, 'ja-JP': '歩兵部隊', 'de-DE': 'Testeinheit' }, text: { 'zh-Hans': '部署：抽取一张牌' } });
for (const query of ['歩兵', 'testeinheit', '部署', 'fallback']) {
  assert.ok(matchesCardFilters(translated, { ...EMPTY_CARD_FILTERS, query }), `all retained title/text/description languages remain searchable: ${query}`);
}
for (const [key, value] of Object.entries({ cardType: ['infantry'], rarity: ['Standard'], cost: ['7'], expansion: 'Base', status: 'active' })) {
  assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, [key]: value }), key);
}
for (const [key, value] of Object.entries({ cardType: ['tank'], rarity: ['Elite'], cost: ['6'], expansion: 'Other', status: 'reserved' })) {
  assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, [key]: value }), key);
}
assert.ok(matchesCardFilters(changed({ kredits: 0 }), { ...EMPTY_CARD_FILTERS, cost: ['0'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Japan', 'GERMANY'], cardType: ['tank', 'infantry'], rarity: ['Elite', 'Standard'], cost: ['0', '7'] }), 'OR within each group, AND between groups');
assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Japan', 'Neutral'], cardType: ['infantry'] }));
assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Germany'], cost: ['0', '6'] }));
assert.ok(matchesCardFilters(changed({ faction: 'Neutral' }), { ...EMPTY_CARD_FILTERS, factions: ['Neutral', 'Japan'] }));
assert.ok(matchesCardFilters(changed({ kredits: 7 }), { ...EMPTY_CARD_FILTERS, cost: ['7'] }));
assert.ok(!matchesCardFilters(changed({ kredits: 6 }), { ...EMPTY_CARD_FILTERS, cost: ['0', '7'] }));
assert.ok(matchesCardFilters(changed({}, true), { ...EMPTY_CARD_FILTERS, status: 'reserved' }));
assert.ok(!matchesCardFilters(changed({}, true), { ...EMPTY_CARD_FILTERS, status: 'active' }));
assert.ok(matchesCardFilters(changed({ set: 'OnlySpawnable' }), { ...EMPTY_CARD_FILTERS, status: 'generated' }));
assert.ok(isInBuilderPool(changed({ rarity: 'Elite' }), 'Germany', 'Soviet'), 'main-country elites remain visible');
assert.ok(isInBuilderPool(changed({ faction: 'Soviet' }), 'Germany', 'Soviet'));
assert.ok(!isInBuilderPool(changed({ faction: 'Soviet', rarity: 'Elite' }), 'Germany', 'Soviet'));
assert.ok(!isInBuilderPool(changed({ faction: 'Neutral' }), 'Germany', 'Soviet'));
assert.ok(!isInBuilderPool(changed({ faction: 'Japan' }), 'Germany', 'Soviet'));
assert.ok(isInBuilderPool(changed({ faction: 'Anzac' }), 'Germany', 'ANZAC'));
assert.ok(isInBuilderPool(changed({ rarity: 'Elite' }), 'Germany', 'Germany'), 'same-country decks retain their main-country elites');
assert.ok(isInBuilderPool(changed({ rarity: 'Special', set: 'Base' }), 'Germany', 'Soviet'), 'Special rarity is not the generated Special set');
for (const set of ['OnlySpawnable', 'Special']) assert.ok(!isInBuilderPool(changed({ set }), 'Germany', 'Soviet'));

const cards: KardsCardRecord[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards;
const ot34 = cards.find(card => card.cardId === 'ot34')!;
assert.equal(CARD_SUBTYPES.length, 5);
const subtypeCardIds = CARD_SUBTYPES.flatMap(subtype => subtype.cardIds);
assert.equal(subtypeCardIds.length, 59);
assert.equal(new Set(subtypeCardIds).size, subtypeCardIds.length, 'a card belongs to at most one listed subtype');
const knownCardIds = new Set(cards.map(card => card.cardId));
assert.deepEqual(subtypeCardIds.filter(cardId => !knownCardIds.has(cardId)), [], 'every subtype entry maps to a catalog card');
assert.deepEqual(cardSubtypeLabels('ot34'), ['T-34']);
assert.deepEqual(cardSubtypeLabels('ot34', 'en-EN'), ['T-34']);
assert.ok(matchesCardFilters(ot34, { ...EMPTY_CARD_FILTERS, subtypes: ['t-34'] }));
assert.ok(!matchesCardFilters(ot34, { ...EMPTY_CARD_FILTERS, subtypes: ['spitfire'] }));
assert.ok(matchesCardFilters(ot34, { ...EMPTY_CARD_FILTERS, subtypes: ['spitfire', 't-34'] }), 'subtype selections combine with OR');
assert.ok(!matchesCardFilters(ot34, { ...EMPTY_CARD_FILTERS, subtypes: ['t-34'], cardType: ['infantry'] }), 'subtype and type filters combine with AND');
for (const card of cards.filter(card => isInBuilderPool(card, 'Japan', 'Germany'))) {
  assert.ok(['Japan', 'Germany'].includes(card.json.faction!));
  assert.ok(card.json.faction === 'Japan' || card.json.rarity !== 'Elite');
  assert.ok(!['OnlySpawnable', 'Special'].includes(card.json.set!));
}
console.log('Shared card filters and builder country pool tests passed');
