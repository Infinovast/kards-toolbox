import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { READY_DECKS } from '../data/readyDecks';
import { decodeDeckCode } from './deckCode';
import { analyzeDeckAbilities, DECK_ABILITY_REFERENCE } from './deckAnalysis';
import { mergeWeatherCardRecords } from './cardData';
import type { KardsCardRecord } from '../types/card';

const catalog = JSON.parse(readFileSync(new URL('../../public/data/cards.json', import.meta.url), 'utf8')).cards as KardsCardRecord[];
const cardsById = new Map(catalog.map(card => [card.importId, card]));
const readyScores = [[86.1, 46.8, 37.6, 68.1, 60.2], [73.9, 57.6, 77.2, 43.6, 71], [78.5, 48.7, 65.5, 44.4, 85.1], [82.9, 58.8, 44, 45.6, 71.1]];
// Fixtures from the reviewed experimental scorer; do not depend on ignored references/ at runtime or in CI.
const samples: [string, number[]][] = [
  ['%%25|0moo;0ybqbupWtV;ohpMsDw0wb;pUsUvS', [58, 26.2, 56.2, 58, 71.9]],
  ['%%41|8C969bppqTrjt3vewqyXz5;3X9xqjvfvhwJ;458Uwowy;z0', [73.9, 59.7, 30.4, 48.6, 81.2]],
  ['%%25|0b0i0l0o1abqn3pGqZtT;04bObu;08;1TglpMsCsU', [84.4, 31, 33.3, 53, 67.6]],
  ['%%43|6C7i7S888e8M8P949ep9pxt3t7thtlwox1;6x797l8V9799iXt9x0;;7H', [96.9, 56.1, 70.8, 32.3, 82.1]],
  ['%%15|2U3Q3X4A4rbqcrcWcxd7ddj4lVoKoOpGqdrcvWwJ;3g4G4n4p4t4vbKoU;4q;', [91.2, 59.1, 52.8, 42.2, 77.1]],
  ['%%51|3Q3X4GbCbEbKbnbPbqcGcNcpcrcWcxd3j4oOqZstsyvKvUvVvWvXwJ;3g4pcVqhrcvL;;', [57.7, 57.9, 78.6, 28.6, 71.9]],
  ['%%32|0l1a1O5u6B6C71727eg2men3p8p9sCtQtTx1yOzn;045Z6x797lpVqCx0;6L;', [91.2, 58.6, 68.8, 47.4, 65.1]],
  ['%%19|3Q3X4n4rlKnbnmnooDoEoKoOq2qdrMrNrPsjwJwO;3g4G4pn8q8;2U4qqh;', [71.6, 59, 75.4, 46.9, 75.1]],
  ['%%45|7E7S8e8P949vbJbqcrpGpsr1t9tktmzC;99bObQ;7HbNpv;848V', [66.5, 44.4, 41.4, 55.2, 77.3]],
  ['%%14|2U2W3g3V3X4G4n4r7S8F8M999a9klKoKoOt9thtlwAwBwHwJ;4p7Hnvq8qhwO;4q;', [79.6, 56.5, 78.4, 42.8, 75.8]],
  ['%%5a|bCbEbKbnbqcNcpcWcxd7j4papGqZsyu3vWxWxYy3y4y9yu;crcVxX;y5yt;gl', [82.9, 57.9, 62.6, 43.7, 73.8]],
  ['%%56|2H2i2nbEbnbqcKcNcpcWcxd3d7ddfKhaj4k5oHoIpGq6svsyvWyS;bPcr;bKcVrc;', [58.2, 59.1, 70.8, 33.1, 82.1]],
];
const before = JSON.stringify(catalog);
for (const [code, expected] of [...READY_DECKS.map((d, i) => [d.code, readyScores[i]] as [string, number[]]), ...samples]) {
  const counts = decodeDeckCode(code).counts;
  const result = analyzeDeckAbilities(counts, cardsById);
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.axes.map(axis => axis.score), expected);
  assert.deepEqual(analyzeDeckAbilities(new Map([...counts].reverse()), cardsById), result, 'map order must not affect the result');
}
assert.equal(JSON.stringify(catalog), before, 'profiling must not mutate the card catalogue');
assert.deepEqual(DECK_ABILITY_REFERENCE.axes.map(axis => axis.name), ['前期展开', '进攻能力', '解牌能力', '手牌续航', '防守抗压']);
assert.equal(DECK_ABILITY_REFERENCE.sampleCount, 12);
DECK_ABILITY_REFERENCE.axes.forEach((axis, index) => {
  const sorted = samples.map(([, scores]) => scores[index]).sort((a, b) => a - b);
  const quantile = (p: number) => { const h = 11 * p; return sorted[Math.floor(h)] + (sorted[Math.ceil(h)] - sorted[Math.floor(h)]) * (h % 1); };
  for (const [value, p] of [[axis.low, 0.25], [axis.median, 0.5], [axis.high, 0.75]]) assert.ok(Math.abs(value - quantile(p)) < 1e-8);
});

const counts = decodeDeckCode(READY_DECKS[0].code).counts;
const firstId = counts.keys().next().value!;
const short = new Map(counts); short.set(firstId, short.get(firstId)! - 1);
assert.deepEqual(analyzeDeckAbilities(short, cardsById), { status: 'incomplete', axes: [] });
assert.equal(analyzeDeckAbilities(new Map(), cardsById).status, 'incomplete');
assert.equal(analyzeDeckAbilities(new Map([...counts, ['missing', 1]]), cardsById).status, 'incomplete');
assert.equal(analyzeDeckAbilities(counts, new Map()).status, 'unsupported');
for (const count of [-1, 1.5, NaN, Infinity]) assert.equal(analyzeDeckAbilities(new Map([[firstId, count]]), cardsById).status, 'unsupported');
const changed = new Map(cardsById);
const original = changed.get(firstId)!;
changed.set(firstId, { ...original, json: { ...original.json, text: { 'zh-Hans': '已修改的复杂卡文。' } } });
assert.equal(analyzeDeckAbilities(counts, changed).status, 'ready', 'updated card text must fall back to current effects and printed stats');

const filler: KardsCardRecord = { id: -1, cardId: 'filler', importId: 'zz', json: { faction: 'Germany', type: 'infantry', kredits: 2, attack: 2, defense: 3, operationCost: 1 } };
const synthetic = (json: KardsCardRecord['json']) => {
  const card = { ...filler, json: { ...filler.json, ...json } };
  return analyzeDeckAbilities(new Map([['zz', 39]]), new Map([['zz', card]]));
};
const stat = (result: ReturnType<typeof synthetic>, id: string) => result.axes.find(axis => axis.id === id)!.score;
assert.equal(stat(synthetic({ text: { 'zh-Hans': '授予其他牌：“抽3张牌。”' } }), 'supply'), 0, 'quoted effects are not immediate draw');
assert.equal(synthetic({ operationCost: NaN }).status, 'unsupported');
assert.equal(stat(synthetic({ type: 'order', text: { 'zh-Hans': '抽1张牌。' } }), 'supply') <= 60, true, 'cycling cannot masquerade as net refill');
assert.ok(stat(synthetic({ type: 'order', text: { 'zh-Hans': '对1个单位造成1点伤害。' } }), 'interaction') <= 50);
assert.ok(stat(synthetic({ kredits: 1 }), 'opening') >= stat(synthetic({ kredits: 4 }), 'opening'));
assert.ok(stat(synthetic({ operationCost: 0 }), 'pressure') >= stat(synthetic({ operationCost: 3 }), 'pressure'));
assert.equal(stat(synthetic({ attack: 0 }), 'opening'), 0);
assert.equal(stat(synthetic({ text: { 'zh-Hans': '部署：抽0张牌。' } }), 'supply'), 0);
assert.equal(stat(synthetic({ text: { 'zh-Hans': '无法攻击。' } }), 'opening'), 0);
assert.ok(stat(synthetic({ text: { 'zh-Hans': '部署：使1个敌方单位无法攻击。' } }), 'opening') > 0, 'an enemy attack restriction does not disable this unit');
assert.ok(stat(synthetic({ text: { 'zh-Hans': '无法攻击敌方总部。' } }), 'opening') > 0, 'HQ-only restrictions still allow board deployment');

// Full-catalogue compatibility, not just the 241 manually reviewed cards.
const allCards = mergeWeatherCardRecords(catalog);
for (const candidate of allCards) {
  const mixed = new Map(counts), removedId = [...mixed.keys()].find(id => id !== candidate.importId)!;
  mixed.set(removedId, mixed.get(removedId)! - 1);
  mixed.set(candidate.importId, (mixed.get(candidate.importId) || 0) + 1);
  const result = analyzeDeckAbilities(mixed, new Map([...cardsById, [candidate.importId, candidate]]));
  assert.equal(result.status, 'ready', candidate.cardId);
  assert.equal(result.axes.length, 5, candidate.cardId);
  assert.ok(result.axes.every(axis => Number.isFinite(axis.score) && axis.score >= 0 && axis.score <= 100), candidate.cardId);
}
const order = (text: string, english = false) => synthetic({ type: 'order', text: { [english ? 'en-EN' : 'zh-Hans']: text } });
for (const text of ['抽2张牌。使友方总部获得+4防御力。', 'Draw two cards. Your HQ gains +4 defense.']) {
  const result = order(text, text.startsWith('Draw'));
  assert.ok(stat(result, 'supply') > 0, text);
  assert.ok(stat(result, 'defense') > 0, text);
}
for (const text of ['消灭1个敌方单位。抽1张牌。', 'Destroy an enemy unit. Draw a card.', '对1个单位造成3点伤害。', 'Deal three damage to an enemy unit.']) {
  assert.ok(stat(order(text, /^[A-Z]/.test(text)), 'interaction') > 50, text);
}
for (const text of ['对友方总部造成3点伤害。', '消灭1个友方单位。', '敌方额外抽1张牌时，对其总部造成1点伤害。', '授予其他牌：“抽3张牌。”', 'When the enemy draws a card, pin a friendly unit.', 'Give a unit: \\"Draw three cards.\\"']) {
  const result = order(text, /^[A-Z]/.test(text));
  assert.equal(stat(result, 'supply'), 0, text);
  assert.equal(stat(result, 'interaction'), 0, text);
}
for (const text of ['友方回合结束时，抽1张牌，将其弃掉。', '选择并弃1张牌，抽1张牌。', 'Draw and discard the top card of your deck.']) {
  assert.equal(stat(order(text, /^[A-Z]/.test(text)), 'supply'), 0, text);
}
assert.ok(stat(order('亡计：抽2张牌。'), 'supply') < stat(order('抽2张牌。'), 'supply'), 'inferred triggers must be discounted');
assert.ok(stat(order('将3张“测试卡”加入手中，获得：“亡计：抽6张牌。”'), 'supply') > 0, 'count generated cards, not their granted effects');
assert.ok(stat(order('将1个“测试单位”加入支援阵线。'), 'opening') > 0, 'generated units contribute to deployment');
assert.ok(stat(synthetic({ text: { 'zh-Hans': '', 'en-EN': 'Deployment: Draw two cards.' } }), 'supply') > 0, 'empty Chinese text must allow English fallback');

const card = (id: string) => catalog.find(c => c.cardId === id)!;
const payoff = card('32nd_infantry_regiment'), blank = { ...filler, json: { ...filler.json, type: 'order' } };
const ownCopy = new Map([[payoff.importId, 1], ['zz', 38]]);
const index = new Map([[payoff.importId, payoff], ['zz', blank]]);
assert.equal(stat(analyzeDeckAbilities(ownCopy, index), 'supply'), 0, 'one physical copy cannot supply its own tutor requirement');
assert.ok(stat(analyzeDeckAbilities(new Map([[payoff.importId, 2], ['zz', 37]]), index), 'supply') > 0);
const stale = { ...payoff, json: { ...payoff.json, text: { 'zh-Hans': '部署：无法量化的新效果。' } } };
assert.equal(stat(analyzeDeckAbilities(new Map([[payoff.importId, 2], ['zz', 37]]), new Map<string, KardsCardRecord>([[payoff.importId, stale], ['zz', blank]])), 'supply'), 0, 'stale reviewed roles must not leak into inferred scores');
const leaked = analyzeDeckAbilities(counts, cardsById); leaked.axes[0].median = -1;
assert.ok(analyzeDeckAbilities(counts, cardsById).axes[0].median > 0, 'returned axes do not share mutable reference records');
console.log(`Deck ability tests passed: 16 score fixtures, ${allCards.length} catalogue cards, bilingual effect estimates, stale/quoted/enemy effects, fixed reference and invalid input`);
