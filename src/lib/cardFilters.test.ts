import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_CARD_FILTERS, hasCardFilterConditions, isGeneratedCard, isInBuilderPool, matchesCardFilters } from './cardFilters';
import { mergeWeatherCardRecords } from './cardData';
import { CARD_SUBTYPES, cardSubtypeLabels } from './cardSubtypes';
import { CARD_KEYWORDS, CARD_TEXT_KEYWORDS, cardHasKeyword, cardKeywords } from './cardKeywords';
import { CARD_SORT_OPTIONS, sortCards } from './cardSort';
import { cardStatusLabel } from './cardDetails';
import { DEFAULT_DECK_RULES, validateDeck } from './deckRules';
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
for (const query of ['测.步兵', 'Te.t In.antry', 'card.a', 'fall.ack', '测..兵']) {
  assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, query }), `single-character wildcard: ${query}`);
}
for (const query of ['测.兵', '测试.步兵', 'Test.*Infantry']) {
  assert.ok(!matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, query }), `only dot is a wildcard: ${query}`);
}
const punctuation = changed({ title: { 'zh-Hans': '甲[乙](丙)+丁?戊\\己^庚$辛|壬{癸}😀尾' } });
for (const query of ['甲.乙](丙)+丁?戊\\己^庚$辛|壬{癸}.尾', '}[.尾']) {
  assert.ok(matchesCardFilters(punctuation, { ...EMPTY_CARD_FILTERS, query }), `literal text or normalized Chinese name with dot: ${query}`);
}
const formattedName = changed({ title: { 'zh-Hans': '第 13 龙骑兵团 / OT-34（改）', 'zh-Hant': '第 13 龍騎兵團 / OT-34（改）', 'en-EN': '13th Dragoons / OT-34' } });
for (const query of ['第13', '第 13', '第-13', '第/13', '第—13', '龙骑兵团OT34', '龙骑兵团/OT-34', 'OT34改', '第13龙.兵团', '龍騎兵團OT34']) {
  assert.ok(matchesCardFilters(formattedName, { ...EMPTY_CARD_FILTERS, query }), `Chinese names ignore separators: ${query}`);
}
for (const query of ['第13.龙骑', '13thDragoons', 'not found', '---']) assert.ok(!matchesCardFilters(formattedName, { ...EMPTY_CARD_FILTERS, query }), `normalization stays within Chinese names: ${query}`);
const literalRules = changed({ title: { 'en-EN': 'Test Infantry' }, text: { 'zh-Hans': '测试步兵' } });
for (const query of ['[测试]', '测试|步兵', '测试-步兵', 'Test.*Infantry']) assert.ok(!matchesCardFilters(literalRules, { ...EMPTY_CARD_FILTERS, query }), 'rules and other languages keep literal punctuation');
const numericUnit = changed({ kredits: 1, operationCost: 4, attack: 0, defense: 4 });
for (const query of ['x1404', 'x104', ' X104 ']) assert.ok(matchesCardFilters(numericUnit, { ...EMPTY_CARD_FILTERS, query }), `unit stat search: ${query}`);
for (const query of ['x1044', 'x114', 'x140', 'x14040', 'x14', 'x1-4-0-4']) assert.ok(!matchesCardFilters(numericUnit, { ...EMPTY_CARD_FILTERS, query }), `stat fields keep exact positions: ${query}`);
assert.ok(matchesCardFilters(changed({ kredits: 1, operationCost: 9, attack: 0, defense: 4 }), { ...EMPTY_CARD_FILTERS, query: 'x104' }), 'three digits ignore operation cost');
for (const type of ['infantry', 'artillery', 'tank', 'bomber', 'fighter']) assert.ok(matchesCardFilters({ ...numericUnit, json: { ...numericUnit.json, type } }, { ...EMPTY_CARD_FILTERS, query: 'x1404' }));
for (const type of ['order', 'countermeasure', undefined]) assert.ok(!matchesCardFilters({ ...numericUnit, json: { ...numericUnit.json, type } }, { ...EMPTY_CARD_FILTERS, query: 'x1404' }), 'stat search only returns units');
for (const value of [10, -1, 1.5, undefined]) assert.ok(!matchesCardFilters(changed({ kredits: value, operationCost: 4, attack: 0, defense: 4 }), { ...EMPTY_CARD_FILTERS, query: 'x1404' }), 'each queried field must be a single digit');
assert.ok(!matchesCardFilters(numericUnit, { ...EMPTY_CARD_FILTERS, query: 'x104', factions: ['Japan'] }), 'stat searches compose with existing filters');
assert.ok(matchesCardFilters(changed({ kredits: 0, operationCost: 0, attack: 0, defense: 0 }), { ...EMPTY_CARD_FILTERS, query: 'x0000' }), 'zero stats are retained');
assert.ok(matchesCardFilters(changed({ text: { 'zh-Hans': '首\n尾' } }), { ...EMPTY_CARD_FILTERS, query: '首.尾' }), 'dot also matches a newline');
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, query: 'test' }), 'plain search works after wildcard queries');
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
assert.ok(matchesCardFilters(changed({ permanent_pool: true }), { ...EMPTY_CARD_FILTERS, status: ['permanent'] }));
assert.ok(!matchesCardFilters(changed({ permanent_pool: false }), { ...EMPTY_CARD_FILTERS, status: ['permanent'] }));
assert.ok(!matchesCardFilters(changed({ permanent_pool: true, set: 'OnlySpawnable' }), { ...EMPTY_CARD_FILTERS, status: ['permanent'] }));
assert.equal(cardStatusLabel(base), '现役');
assert.equal(cardStatusLabel(changed({}, true)), '预备卡');
assert.equal(cardStatusLabel(changed({ attributes: ['BecomesVeteran:vet'] })), '现役');
assert.equal(cardStatusLabel(changed({ attributes: ['VeteranOf:base'], set: 'Special' })), '现役，老兵形态');
assert.equal(cardStatusLabel(changed({ set: 'OnlySpawnable' })), '现役，衍生卡');
assert.equal(cardStatusLabel(changed({ set: 'OnlySpawnable' }, true)), '预备卡，衍生卡');
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
const exileNations: Record<string, string> = {
  orp_orze: 'Britain', agency_africa: 'Britain', battle_mk_i_pl: 'Britain', lysander_pl: 'Britain',
  devils_brigade: 'Britain', hurricane_pl: 'Britain', m_s_406: 'Poland', orp_byskawica: 'Britain',
  '2nd_infantry_regiment': 'Soviet', il2m_pl: 'Soviet', m4_sherman_pl: 'USA', t34_76_pl: 'Soviet',
  yak_9_pl: 'Soviet', m4_firefly_pl: 'USA', '1st_grenadier_regiment': 'France', spitfire_mk_v_pl: 'Britain',
};
assert.equal(cards.filter(card => card.json.exile).length, Object.keys(exileNations).length);
for (const [cardId, nation] of Object.entries(exileNations)) {
  const card = cards.find(card => card.cardId === cardId)!;
  assert.ok(card, `${cardId} exists in bundled data`);
  assert.equal(card.json.exile, nation, `${cardId} has the expected exile nation`);
  for (const faction of [card.json.faction!, nation, nation.toLowerCase()]) {
    assert.ok(matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, factions: [faction] }), `${cardId} matches ${faction}`);
  }
  assert.ok(matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, factions: ['Germany', nation], keywords: ['exile'], cardType: [card.json.type!] }), 'exile nations compose with OR within nations and AND across filters');
  assert.ok(!matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, factions: ['Germany', 'Japan'] }), 'unrelated nations do not match');
  assert.ok(!matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, factions: [nation], cost: ['99'] }), 'exile nationality does not bypass other filters');
}
for (const exile of [undefined, null, false, 1, {}, []]) {
  assert.ok(!matchesCardFilters(changed({ exile }), { ...EMPTY_CARD_FILTERS, factions: ['Britain'] }), 'absent or non-string exile metadata does not grant nationality');
}
assert.ok(matchesCardFilters(changed({ exile: ' britain ' }), { ...EMPTY_CARD_FILTERS, factions: ['BRITAIN'] }));
for (const id of ['1st_signal_regiment', '158_nachschub']) {
  const card = cards.find(card => card.cardId === id)!;
  assert.ok(card, `${id} exists in bundled data`);
  for (const query of ['x104', 'x1404']) assert.ok(matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, query }), `${query} finds ${id}`);
}
assert.ok(matchesCardFilters(cards.find(card => card.cardId === '13e_dragons')!, { ...EMPTY_CARD_FILTERS, query: '第13' }));
const weatherCards: KardsCardRecord[] = JSON.parse(readFileSync('src/data/weatherCards.json', 'utf8'));
assert.equal(weatherCards.length, 30);
assert.ok(weatherCards.every(card => matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: ['weather'] })));
const mergedCatalog = mergeWeatherCardRecords(cards);
assert.equal(mergedCatalog.filter(card => matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: ['permanent'] })).length, 410);
const generatedCatalog = mergedCatalog.filter(isGeneratedCard);
assert.equal(generatedCatalog.length, 147);
for (const card of mergedCatalog.filter(card => card.json.attributes?.some(attribute => attribute.startsWith('VeteranOf:')))) {
  assert.ok(matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, expansion: card.json.set!, status: ['veteran'] }), 'veterans match their inherited expansion and generated category');
  assert.ok(!matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: ['active'] }));
  assert.ok(!isInBuilderPool(card, card.json.faction!, card.json.faction!), 'normalizing the set must not make veteran forms constructible');
  assert.ok(validateDeck(new Map([[card.importId, 1]]), new Map([[card.importId, card]]), 'Germany', 'Britain', DEFAULT_DECK_RULES.standard).some(warning => warning.includes('是衍生卡')), 'standard validation still rejects normalized veteran forms');
}
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
assert.ok(matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywordMode: 'and', keywords: ['shock', 'covert', 'heavyArmor'] }));
assert.ok(!matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywordMode: 'and', keywords: ['shock', 'guard'] }));
assert.ok(!matchesCardFilters(withKeywords, { ...EMPTY_CARD_FILTERS, keywordMode: 'and', keywords: ['none', 'shock'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, keywordMode: 'and', keywords: ['none'] }));
assert.ok(matchesCardFilters(base, { ...EMPTY_CARD_FILTERS, keywordMode: 'and' }), 'an empty keyword selection never restricts cards');
assert.ok(!hasCardFilterConditions({ ...EMPTY_CARD_FILTERS, query: 'search', keywordMode: 'and' }), 'text and an unused keyword mode are not restrictive filters');
for (const condition of [{ factions: ['Germany'] }, { cardType: ['tank'] }, { subtypes: ['t-34'] }, { keywords: ['guard'] }, { cost: ['2'] }, { rarity: ['Elite'] }, { expansion: 'Base' }, { status: ['weather'] }]) {
  assert.ok(hasCardFilterConditions({ ...EMPTY_CARD_FILTERS, ...condition }), JSON.stringify(condition));
}
for (const attribute of ['VeteranOf:base', 'BecomesVeteran:vet']) {
  assert.ok(cardHasKeyword(changed({ attributes: [attribute] }), 'veteran'));
  assert.deepEqual(cardKeywords(changed({ attributes: [attribute] }), 'zh-Hans'), attribute.startsWith('VeteranOf:') ? ['老兵'] : []);
}
assert.deepEqual(cardKeywords(changed({ attributes: ['guard', 'BecomesVeteran:vet', 'shock'] }), 'zh-Hans'), ['守护', '冲击'], 'veteran potential stays filterable but is not a displayed keyword');
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
const weather = mergedCatalog.filter(card => matchesCardFilters(card, { ...EMPTY_CARD_FILTERS, status: ['weather'] }));
// Deliberately put forms ahead of their originals and interleave all nine families.
const shuffledWeather = [...weather].reverse();
for (const key of CARD_SORT_OPTIONS.map(option => option.value)) for (const direction of ['asc', 'desc'] as const) {
  const ids = sortCards(shuffledWeather, key, direction).map(card => card.cardId);
  for (const variant of weather.filter(card => card.cardId.endsWith('_1'))) {
    const baseId = variant.cardId.slice(5, -2);
    const start = ids.indexOf(baseId);
    assert.deepEqual(ids.slice(start, start + 3), [baseId, `temp_${baseId}_1`, `temp_${baseId}_2`], `${key} ${direction}: weather forms stay together and in order`);
  }
}
const delugeFamily = weather.filter(card => ['deluge', 'temp_deluge_1', 'temp_deluge_2'].includes(card.cardId));
const unrelatedOrder = { ...delugeFamily[0], cardId: 'unrelated', importId: 'ZZ' };
const [delugeBase, delugeOne, delugeTwo] = ['deluge', 'temp_deluge_1', 'temp_deluge_2'].map(id => delugeFamily.find(card => card.cardId === id)!);
assert.deepEqual(sortCards([delugeBase, unrelatedOrder, delugeTwo, delugeOne]).map(card => card.cardId), ['deluge', 'temp_deluge_1', 'temp_deluge_2', 'unrelated'], 'an unrelated card with the same cost and type cannot split a weather family');
assert.deepEqual(sortCards([delugeTwo, unrelatedOrder, delugeOne]).map(card => card.cardId), ['temp_deluge_1', 'temp_deluge_2', 'unrelated'], 'filtered-out originals still allow forms to group');
console.log('Shared card filters and builder country pool tests passed');
