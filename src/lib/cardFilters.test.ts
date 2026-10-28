import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_CARD_FILTERS, isInBuilderPool, matchesCardFilters } from './cardFilters';
import { mergeWeatherCardRecords } from './cardData';
import { CARD_SUBTYPES, cardSubtypeLabels } from './cardSubtypes';
import { CARD_KEYWORDS, CARD_TEXT_KEYWORDS, cardHasKeyword, cardKeywords } from './cardKeywords';
import { CARD_SORT_OPTIONS, sortCards } from './cardSort';
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
for (const [key, value] of Object.entries({ cardType: ['infantry'], rarity: ['Standard'], cost: ['7'], expansion: 'Base', status: ['active'] })) {
  assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, [key]: value }), key);
}
for (const [key, value] of Object.entries({ cardType: ['tank'], rarity: ['Elite'], cost: ['6'], expansion: 'Other', status: ['reserved'] })) {
  assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, [key]: value }), key);
}
assert.ok(matchesCardFilters(changed({ kredits: 0 }), { ...EMPTY_CARD_FILTERS, cost: ['0'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Japan', 'GERMANY'], cardType: ['tank', 'infantry'], rarity: ['Elite', 'Standard'], cost: ['0', '7'] }), 'OR within each group, AND between groups');
assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Japan', 'Neutral'], cardType: ['infantry'] }));
assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, factions: ['Germany'], cost: ['0', '6'] }));
assert.ok(matchesCardFilters(changed({ faction: 'Neutral' }), { ...EMPTY_CARD_FILTERS, factions: ['Neutral', 'Japan'] }));
assert.ok(matchesCardFilters(changed({ kredits: 7 }), { ...EMPTY_CARD_FILTERS, cost: ['7'] }));
assert.ok(!matchesCardFilters(changed({ kredits: 6 }), { ...EMPTY_CARD_FILTERS, cost: ['0', '7'] }));
assert.ok(matchesCardFilters(changed({}, true), { ...EMPTY_CARD_FILTERS, status: ['reserved'] }));
assert.ok(!matchesCardFilters(changed({}, true), { ...EMPTY_CARD_FILTERS, status: ['active'] }));
assert.ok(matchesCardFilters(changed({ set: 'OnlySpawnable' }), { ...EMPTY_CARD_FILTERS, status: ['generated'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, status: ['active', 'reserved'] }), 'status selections combine with OR');
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
const weatherCards: KardsCardRecord[] = JSON.parse(readFileSync('src/data/weatherCards.json', 'utf8'));
assert.equal(weatherCards.length, 30);
assert.ok(weatherCards.every(card => matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: ['weather'] })));
const mergedCatalog = mergeWeatherCardRecords(cards);
const generatedCatalog = mergedCatalog.filter(card => ['OnlySpawnable', 'Special'].includes(card.json.set || ''));
assert.equal(generatedCatalog.length, 147);
for (const [status, expected] of [['veteran', 44], ['weather', 30], ['research', 30], ['punishment', 12], ['other', 31]] as const) {
  assert.equal(generatedCatalog.filter(card => matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: [status] })).length, expected, `${status} status grouping`);
}
const kamikaze = cards.find(card => card.cardId === 'kamikaze')!;
assert.ok(matchesCardFilters(kamikaze, { ...EMPTY_CARD_FILTERS, status: ['other'] }));
assert.ok(!matchesCardFilters(kamikaze, { ...EMPTY_CARD_FILTERS, status: ['research'] }), 'research status is based on explicit generation data, not loose card names');
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
// Keyword groups use OR; other filters still use AND. Metadata is not an ability.
const withKeywords = changed({ attributes: ['shock', 'bond', 'heavyArmor2', 'intel3', 'covert', 'VeteranOf:original', 'OnlySpawnable'] });
assert.deepEqual(cardKeywords(withKeywords, 'zh-Hans'), ['冲击', '协力', '重甲 2', '情报 3', '隐蔽', '老兵']);
assert.deepEqual(cardKeywords(withKeywords, 'en-EN'), ['Shock', 'Bond', 'Heavy Armor 2', 'Intel 3', 'Covert', 'Veteran']);
assert.ok(matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywords: ['ambush', 'covert'] }));
assert.ok(!matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywords: ['ambush', 'guard'] }));
assert.ok(!matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywords: ['covert'], cardType: ['tank'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, keywords: ['none'] }));
assert.ok(matchesCardFilters(changed({ attributes: ['OnlySpawnable'] }), { ...EMPTY_CARD_FILTERS, keywords: ['none'] }));
assert.ok(matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywords: ['none', 'shock'] }));
assert.ok(!matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywords: ['none'] }));
for (const attribute of ['VeteranOf:base', 'BecomesVeteran:vet']) {
  assert.ok(cardHasKeyword(changed({ attributes: [attribute] }), 'veteran'));
  assert.deepEqual(cardKeywords(changed({ attributes: [attribute] }), 'zh-Hans'), ['老兵']);
}
assert.deepEqual(cardKeywords(changed({ attributes: ['blitz', 'BecomesVeteran:vet', 'VeteranOf:base', 'guard'] }), 'zh-Hans'), ['闪击', '老兵', '守护'], 'preserve attribute order and deduplicate semantic keywords');
assert.ok(cardHasKeyword(changed({ exile: 'Britain' }), 'exile'), 'official exile metadata participates in keyword filtering');
assert.ok(!cardHasKeyword(changed({ exile: 'Britain' }), 'none'));
assert.deepEqual(cardKeywords(changed({ attributes: ['futureAbility'] }), 'zh-Hans'), ['futureAbility'], 'unknown future abilities remain visible');
assert.equal(CARD_KEYWORDS.length, 16);
for (const card of cards) {
  const keywords = cardKeywords(card, 'zh-Hans');
  assert.ok(keywords.every(keyword => !/^[a-z]|VeteranOf:|BecomesVeteran:|OnlySpawnable/.test(keyword)), `every catalog attribute is translated: ${card.cardId}`);
}
assert.deepEqual([...('被收缴，战斗机，战斗，情报X，重甲2，隐蔽，协力'.matchAll(CARD_TEXT_KEYWORDS))].map(match => match[0]), ['被收缴', '战斗', '情报X', '重甲2', '隐蔽', '协力']);

// Primary direction changes independently of the fixed cost/type tie-breaks.
const orderedTypes = ['infantry', 'artillery', 'tank', 'bomber', 'fighter', 'order', 'countermeasure'];
const sortable = orderedTypes.map((type, index) => ({ ...changed({ type, kredits: 2, attack: 3 }), cardId: String(index) }));
const reversed = [...sortable].reverse();
assert.deepEqual(sortCards(reversed).map(card => card.json.type), orderedTypes);
assert.deepEqual(sortCards(reversed, 'attack', 'desc').map(card => card.json.type), orderedTypes);
assert.deepEqual(reversed.map(card => card.json.type), [...orderedTypes].reverse(), 'sorting does not mutate the source catalogue');
assert.equal(CARD_SORT_OPTIONS.length, 6);
for (const key of ['kredits', 'operationCost', 'attack', 'defense'] as const) {
  const low = changed({ [key]: 1 }), high = changed({ [key]: 3 }), missing = changed({ [key]: undefined });
  assert.deepEqual(sortCards([high, missing, low], key), [low, high, missing], key);
  assert.deepEqual(sortCards([low, missing, high], key, 'desc'), [high, low, missing], `${key} descending`);
}
const cheapOrder = changed({ type: 'order', kredits: 1, attack: 3 });
assert.equal(sortCards([sortable[0], cheapOrder], 'attack', 'desc')[0], cheapOrder, 'cost breaks ties before type');
const alpha = changed({ title: { 'zh-Hans': '阿尔法', 'en-EN': 'Alpha' } });
const zulu = changed({ title: { 'zh-Hans': '祖鲁', 'en-EN': 'zulu' } });
for (const key of ['nameZh', 'nameEn'] as const) {
  assert.deepEqual(sortCards([zulu, alpha], key), [alpha, zulu]);
  assert.deepEqual(sortCards([alpha, zulu], key, 'desc'), [zulu, alpha]);
}
console.log('Shared card filters and builder country pool tests passed');
