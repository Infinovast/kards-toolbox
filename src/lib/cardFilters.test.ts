import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EMPTY_CARD_FILTERS, isInBuilderPool, matchesCardFilters } from './cardFilters';
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

const cards: KardsCardRecord[] = JSON.parse(readFileSync('public/data/cards-v54.json', 'utf8')).cards;
for (const card of cards.filter(card => isInBuilderPool(card, 'Japan', 'Germany'))) {
  assert.ok(['Japan', 'Germany'].includes(card.json.faction!));
  assert.ok(card.json.faction === 'Japan' || card.json.rarity !== 'Elite');
  assert.ok(!['OnlySpawnable', 'Special'].includes(card.json.set!));
}
console.log('Shared card filters and builder country pool tests passed');
