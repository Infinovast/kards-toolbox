import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { READY_DECKS } from '../data/readyDecks';
import { decodeDeckCode } from './deckCode';
import { analyzeDeckAbilities, createCardAbilityReader, DECK_ABILITY_REFERENCE } from './deckAnalysis';
import { mergeWeatherCardRecords } from './cardData';
import type { KardsCardRecord } from '../types/card';

const catalog = mergeWeatherCardRecords(JSON.parse(readFileSync(new URL('../../public/data/cards.json', import.meta.url), 'utf8')).cards as KardsCardRecord[]);
const cardsById = new Map(catalog.map(card => [card.importId, card]));
const read = createCardAbilityReader(catalog);
const before = JSON.stringify(catalog);
const samples = DECK_ABILITY_REFERENCE.decks.map(code => ({ code, result: analyzeDeckAbilities(decodeDeckCode(code).counts, cardsById) }));
for (const code of [...READY_DECKS.map(deck => deck.code), ...DECK_ABILITY_REFERENCE.decks]) {
  const counts = decodeDeckCode(code).counts;
  const result = analyzeDeckAbilities(counts, cardsById);
  assert.equal(result.status, 'ready', code);
  assert.deepEqual(analyzeDeckAbilities(new Map([...counts].reverse()), cardsById), result, 'map order cannot change scores');
  assert.deepEqual(analyzeDeckAbilities(counts, new Map([...cardsById].reverse())), result, 'catalogue order cannot change name resolution');
}
assert.deepEqual(DECK_ABILITY_REFERENCE.axes.map(axis => axis.name), ['前期展开', '进攻能力', '解牌能力', '手牌续航', '防守抗压']);
// Recompute descriptive bands only on an explicit developer command after a model/catalogue change.
const quantile = (values: number[], p: number) => {
  const sorted = [...values].sort((a, b) => a - b), h = (sorted.length - 1) * p;
  return Math.round((sorted[Math.floor(h)] + (sorted[Math.ceil(h)] - sorted[Math.floor(h)]) * (h % 1)) * 1e6) / 1e6;
};
const recalibrated = DECK_ABILITY_REFERENCE.axes.map((axis, i) => ({ ...axis,
  low: quantile(samples.map(s => s.result.axes[i].score), 0.25), high: quantile(samples.map(s => s.result.axes[i].score), 0.75),
}));
if (!process.argv.includes('--update-reference')) assert.deepEqual(DECK_ABILITY_REFERENCE.axes, recalibrated, 'reference bands must use the current model and the recorded sample decks');

const counts = decodeDeckCode(READY_DECKS[0].code).counts;
const firstId = counts.keys().next().value!;
const short = new Map(counts); short.set(firstId, short.get(firstId)! - 1);
assert.deepEqual(analyzeDeckAbilities(short, cardsById), { status: 'incomplete', axes: [] });
assert.equal(analyzeDeckAbilities(new Map(), cardsById).status, 'incomplete');
assert.equal(analyzeDeckAbilities(counts, new Map()).status, 'unsupported');
for (const count of [-1, 1.5, NaN, Infinity]) assert.equal(analyzeDeckAbilities(new Map([[firstId, count]]), cardsById).status, 'unsupported');

const filler: KardsCardRecord = { id: -1, cardId: 'filler', importId: 'zz', json: { faction: 'Germany', type: 'infantry', kredits: 2, attack: 2, defense: 3, operationCost: 1 } };
const makeCard = (text: string, unit = false, english = false): KardsCardRecord => ({ ...filler,
  json: { ...filler.json, type: unit ? 'infantry' : 'order', text: { [english ? 'en-EN' : 'zh-Hans']: text } },
});
const inspect = (text: string, unit = false, english = false) => read(makeCard(text, unit, english));
const roles = (text: string, unit = false, english = false) => inspect(text, unit, english).roles;
const has = (text: string, role: string, unit = false, english = false) => roles(text, unit, english).some(e => e.role === role);
const score = (json: KardsCardRecord['json']) => analyzeDeckAbilities(new Map([['zz', 39]]), new Map([['zz', { ...filler, json: { ...filler.json, ...json } }]]));
const axis = (result: ReturnType<typeof score>, id: string) => result.axes.find(axis => axis.id === id)!.score;

// Verify meaning, not just finite output. Every family is exercised in both languages.
for (const [zh, en, role] of [
  ['抽2张牌。', 'Draw two cards.', 'supply'],
  ['消灭1个敌方单位。', 'Destroy an enemy unit.', 'interaction'],
  ['对1个单位造成3点伤害。', 'Deal three damage to a unit.', 'interaction'],
  ['对敌方总部造成3点伤害。', 'Deal three damage to the enemy HQ.', 'offense'],
  ['压制所有敌方单位。', 'Pin all enemy units.', 'interaction'],
  ['使1个敌方单位撤退。', 'Retreat an enemy unit.', 'interaction'],
  ['将1个“测试单位”加入支援阵线。', 'Add a TEST UNIT to your support line.', 'board'],
  ['使1个友方单位获得+2+2。', 'Give a friendly unit +2+2.', 'offense'],
  ['使友方总部获得+4防御力。', 'Your HQ gains +4 defense.', 'defense'],
  ['开发1张英国指令。', 'Develop a British order.', 'supply'],
  ['预报。', 'Forecast.', 'supply'],
] as const) {
  assert.ok(has(zh, role), zh); assert.ok(has(en, role, false, true), en);
}
for (const text of ['对友方总部造成3点伤害。', '消灭所有友方单位。', '使1个敌方单位获得+2+2。',
  '敌方额外抽1张牌时，对其总部造成1点伤害。', '授予其他牌：“抽3张牌。”',
  '抽取：使所有友方单位具有+1攻击力。', '若其具有闪击，将其消灭。',
  'When the enemy draws a card, pin a friendly unit.', 'Destroy a friendly unit.']) {
  const found = roles(text, false, /^[A-Z]/.test(text));
  assert.ok(!found.some(e => e.role === 'supply' || e.role === 'fast'), text);
  if (/友方.*伤害|消灭所有友方|friendly unit\./.test(text)) assert.ok(!found.some(e => e.role === 'interaction'), text);
}
for (const text of ['友方回合结束时，抽1张牌，将其弃掉。', '选择并弃1张牌，抽1张牌。', '选择1张手牌洗入卡组，抽1张牌。', 'Draw and discard the top card of your deck.', '部署：抽0张牌。']) {
  assert.ok(!has(text, 'supply', false, /^[A-Z]/.test(text)), text);
}
assert.ok(!has('将1个敌方单位返回手牌。', 'supply'), 'bouncing an enemy unit does not replenish your hand');
assert.ok(!has('将1个友方单位返回手牌。', 'supply'), 'returning your own unit is not net hand generation');
assert.ok(roles('亡计：抽2张牌。', true).filter(e => e.role === 'supply').every(e => e.conditional));
assert.ok(roles('部署：抽2张牌。', true).some(e => e.role === 'supply' && !e.conditional));
assert.ok(roles('部署：抽1张牌。亡计：抽2张牌。', true).some(e => e.role === 'supply' && !e.conditional));
assert.ok(has('单位攻击后，将其压制。', 'interaction'));
assert.ok(!has('若其具有闪击，将其消灭。', 'fast'), 'a condition cannot grant Blitz to this card');
assert.ok(has('抉择：使友方总部获得+8防御力 或 抽2张牌。', 'supply'));
assert.ok(has('获得闪击并抽1张牌。', 'supply', true));
assert.ok(inspect('新型复杂机制：重新定义胜利条件。').unmodeled.length, 'unmodeled text must remain visible in the developer audit');
assert.equal(score({ operationCost: NaN }).status, 'unsupported');
assert.ok(axis(score({ kredits: 1 }), 'opening') > axis(score({ kredits: 4 }), 'opening'));
assert.ok(axis(score({ operationCost: 0 }), 'pressure') > axis(score({ operationCost: 3 }), 'pressure'));
assert.equal(axis(score({ attack: 0 }), 'opening'), 0);
assert.equal(axis(score({ text: { 'zh-Hans': '无法攻击。' } }), 'opening'), 0);
assert.ok(axis(score({ text: { 'zh-Hans': '部署：使1个敌方单位无法攻击。' } }), 'opening') > 0);
assert.ok(axis(score({ text: { 'zh-Hans': '无法攻击敌方总部。' } }), 'opening') > 0);
assert.equal(axis(score({ text: { 'zh-Hans': '若友方指挥点槽数小于6，无法部署。' } }), 'opening'), 0);
assert.ok(axis(score({ text: { 'zh-Hans': '', 'en-EN': 'Deployment: Draw two cards.' } }), 'supply') > 0);

const card = (id: string) => catalog.find(c => c.cardId === id)!;
for (const id of ['against_the_odds', 'sally', 'direct_hit', 'carpet_bombing', 'dive_bombing', '15th_wolves_regiment', 'orp_general_haller']) {
  assert.ok(read(card(id)).roles.some(e => e.role === 'interaction'), id);
}
for (const id of ['no_46_commando', '7075_aluminium', 'plan', 'lesser_of_two_evils', '16th_tarnow_regiment', 'materials']) {
  assert.ok(read(card(id)).roles.some(e => e.role === 'supply'), id);
}
for (const id of ['bocage_warfare', '50_infantry_regiment', '16th_infantry_brigade']) {
  assert.ok(read(card(id)).roles.some(e => e.role === 'offense' && e.conditional), id);
}
for (const id of ['15th_motor_rifles', '845th_rifles', '289th_gatchina', '593rd_jasco']) {
  assert.ok(read(card(id)).roles.some(e => e.role === 'defense'), id);
}

// An external tutor must find another physical copy, never the payoff copy itself.
const payoff = card('32nd_infantry_regiment'), blank = { ...filler, json: { ...filler.json, type: 'order' } };
const ownCopy = new Map([[payoff.importId, 1], ['zz', 38]]), index = new Map([[payoff.importId, payoff], ['zz', blank]]);
assert.equal(axis(analyzeDeckAbilities(ownCopy, index), 'supply'), 0);
assert.ok(axis(analyzeDeckAbilities(new Map([[payoff.importId, 2], ['zz', 37]]), index), 'supply') > 0);
const stale = { ...payoff, json: { ...payoff.json, text: { 'zh-Hans': '部署：完全不同的新效果。' } } };
assert.equal(axis(analyzeDeckAbilities(new Map([[payoff.importId, 2], ['zz', 37]]), new Map<string, KardsCardRecord>([[payoff.importId, stale], ['zz', blank]])), 'supply'), 0);

// All cards take the same path. A formerly reviewed ID cannot confer special treatment.
const audit = catalog.map(candidate => {
  const abilities = read(candidate);
  assert.deepEqual(read({ ...candidate, cardId: `unknown:${candidate.cardId}` }), abilities, candidate.cardId);
  const mixed = new Map(counts), removedId = [...mixed.keys()].find(id => id !== candidate.importId)!;
  mixed.set(removedId, mixed.get(removedId)! - 1);
  mixed.set(candidate.importId, (mixed.get(candidate.importId) || 0) + 1);
  const result = analyzeDeckAbilities(mixed, cardsById);
  assert.equal(result.status, 'ready', candidate.cardId);
  assert.equal(result.axes.length, 5, candidate.cardId);
  assert.ok(result.axes.every(a => Number.isFinite(a.score) && a.score >= 0 && a.score <= 100), candidate.cardId);
  return { cardId: candidate.cardId, importId: candidate.importId, printed: {
    type: candidate.json.type, kredits: candidate.json.kredits, operationCost: candidate.json.operationCost,
    attack: candidate.json.attack, defense: candidate.json.defense, attributes: candidate.json.attributes || [],
  }, text: candidate.json.text?.['zh-Hans'] || candidate.json.text?.['en-EN'] || '', ...abilities };
});
assert.equal(JSON.stringify(catalog), before, 'analysis cannot mutate catalogue data');
const leaked = analyzeDeckAbilities(counts, cardsById); leaked.axes[0].low = -1;
assert.ok(analyzeDeckAbilities(counts, cardsById).axes[0].low >= 0);
const scoresBefore = analyzeDeckAbilities(counts, cardsById).axes.map(a => a.score);
const originalLow = DECK_ABILITY_REFERENCE.axes[0].low;
try {
  DECK_ABILITY_REFERENCE.axes[0].low = 99;
  assert.deepEqual(analyzeDeckAbilities(counts, cardsById).axes.map(a => a.score), scoresBefore, 'reference values do not enter the score formulas');
} finally { DECK_ABILITY_REFERENCE.axes[0].low = originalLow; }
if (process.argv.includes('--update-reference')) {
  const path = new URL('../data/deckAnalysis.json', import.meta.url), data = JSON.parse(readFileSync(path, 'utf8'));
  data.reference.axes = recalibrated;
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);
}
if (process.argv.includes('--audit')) {
  const path = new URL('../../references/deck-analysis/', import.meta.url); mkdirSync(path, { recursive: true });
  writeFileSync(new URL('card-ability-audit.json', path), `${JSON.stringify({ model: 'kards-capacity-3',
    note: 'Deterministic model output, not a manual semantic review. Unmodeled text receives no invented bonus; matching a clause does not simulate all of its constraints.',
    cardsWithUnmodeledText: audit.filter(c => c.unmodeled.length).length, cards: audit, referenceBands: recalibrated,
    referenceDecks: samples.map(({ code, result }) => ({ code, scores: result.axes.map(({ id, name, score }) => ({ id, name, score })) })),
  }, null, 2)}\n`);
}
console.log(`Deck ability tests passed: ${catalog.length} uniform card profiles, ${samples.length + READY_DECKS.length} decks, semantic and ID-invariance regressions, independent fixed reference bands`);
