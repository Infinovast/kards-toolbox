import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { READY_DECKS } from '../data/readyDecks';
import { decodeDeckCode } from './deckCode';
import { analyzeDeckAbilities, createCardAbilityReader, DECK_ABILITY_MODEL, DECK_ABILITY_SCENARIO, DECK_ABILITY_REFERENCE } from './deckAnalysis';
import { mergeWeatherCardRecords } from './cardData';
import type { KardsCardRecord } from '../types/card';

const catalog = mergeWeatherCardRecords(JSON.parse(readFileSync(new URL('../../public/data/cards.json', import.meta.url), 'utf8')).cards as KardsCardRecord[]);
const cardsById = new Map(catalog.map(card => [card.importId, card]));
const read = createCardAbilityReader(catalog);
const before = JSON.stringify(catalog);
assert.equal(JSON.parse(readFileSync(new URL('../data/deckAnalysis.json', import.meta.url), 'utf8')).model, DECK_ABILITY_MODEL);
const samples = DECK_ABILITY_REFERENCE.decks.map(code => ({ code, result: analyzeDeckAbilities(decodeDeckCode(code).counts, cardsById) }));
for (const code of [...READY_DECKS.map(deck => deck.code), ...DECK_ABILITY_REFERENCE.decks]) {
  const counts = decodeDeckCode(code).counts;
  const result = analyzeDeckAbilities(counts, cardsById);
  assert.equal(result.status, 'ready', code);
  assert.deepEqual(analyzeDeckAbilities(new Map([...counts].reverse()), cardsById), result, 'map order cannot change scores');
  assert.deepEqual(analyzeDeckAbilities(counts, new Map([...cardsById].reverse())), result, 'catalogue order cannot change name resolution');
}
assert.deepEqual(DECK_ABILITY_REFERENCE.axes.map(axis => axis.name), ['展开节奏', '进攻能力', '解场控制', '手牌续航', '防守抗压']);
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
const has = (text: string, role: string, unit = false, english = false) => roles(text, unit, english).some(e => e.role === role && e.points > 0);
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
for (const text of ['友方回合结束时，抽1张牌，将其弃掉。', 'Draw and discard the top card of your deck.', '部署：抽0张牌。']) {
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
assert.equal(axis(score({ text: { 'zh-Hans': '无法攻击敌方总部。' } }), 'pressure'), 0, 'HQ restrictions remove HQ pressure, not board presence');
const textScore = (text: string) => score({ text: { 'zh-Hans': text } });
assert.ok(axis(textScore('抽2张牌。选择并弃1张牌。'), 'supply') < axis(textScore('抽2张牌。'), 'supply'), 'discard costs reduce net supply');
assert.ok(axis(textScore('选择并弃1张牌，抽1张牌。'), 'supply') > 0, 'zero-net filtering has a small selection benefit');
assert.ok(axis(textScore('选择并弃1张牌，抽1张牌。'), 'supply') < axis(textScore('抽1张牌。'), 'supply'), 'filtering is not net card generation');
assert.ok(axis(textScore('抽2张牌，然后弃掉1张牌。'), 'supply') > 0, 'discarding one of two drawn cards is not discarding both');
assert.ok(axis(textScore('选择1张手牌。将其返回卡组顶。抽2张牌。'), 'supply') < axis(textScore('抽2张牌。'), 'supply'), 'returning a selected hand card is a cost, not deck generation');
assert.ok(axis(textScore('将所有手牌洗入卡组，抽取洗入数量加1的卡牌。'), 'supply') > 0, 'whole-hand redraw counts its actual net gain');
assert.ok(axis(textScore('消灭1个敌方单位。敌方抽2张牌。'), 'interaction') < axis(textScore('消灭1个敌方单位。'), 'interaction'), 'enemy refill is a real control cost');
assert.ok(axis(textScore('对友方总部造成3点伤害。'), 'defense') < axis(textScore(''), 'defense'), 'self damage is a real defensive cost');
assert.ok(axis(textScore('使1个敌方单位获得+3+3。'), 'pressure') < axis(textScore(''), 'pressure'), 'buffing an enemy costs pressure');
assert.ok(axis(textScore('使1个敌方单位获得+3+3。'), 'defense') < axis(textScore(''), 'defense'), 'buffing an enemy costs defense');
assert.ok(axis(textScore('消灭所有单位。'), 'pressure') < axis(textScore('消灭所有敌方单位。'), 'pressure'), 'symmetric clears also remove your own pressure');
assert.ok(axis(textScore('敌方指令具有+2花费。'), 'interaction') > 0, 'taxing enemy orders does not require orders in your own deck');
assert.ok(axis(textScore('失去1个指挥点槽。'), 'opening') < axis(textScore(''), 'opening'), 'lost slots reduce tempo');
assert.ok(axis(textScore('部署：抽1张牌。亡计：抽2张牌。'), 'supply') > axis(textScore('部署：抽1张牌。'), 'supply'), 'different events add their expected payloads');
assert.equal(axis(textScore('抉择：抽1张牌 或 抽2张牌。'), 'supply'), axis(textScore('抽2张牌。'), 'supply'), 'mutually exclusive modes are not summed');
assert.equal(axis(textScore('抉择：抽1张牌并抽1张牌 或 抽3张牌。'), 'supply'), axis(textScore('抽3张牌。'), 'supply'), 'payloads add within an option, then options compete');
assert.ok(roles('抽1张步兵，坦克，炮兵和战斗机。').filter(e => e.role === 'supply').reduce((n, e) => n + e.points, 0) >= 2, 'commas inside a list cannot truncate a four-card draw');
assert.ok(has('从3张随机美国精英单位中选择1张加入手牌。', 'supply'));
assert.ok(has('额外开发1张英国指令。', 'supply'));
assert.ok(inspect('将1个“未知的新单位”加入支援阵线。').unmodeled.some(s => s.includes('未找到生成牌资料')), 'missing generated identities remain explicit');
assert.ok(!has('将1个“未知的新单位”加入支援阵线。', 'offense'), 'missing generated stats cannot receive a made-up offensive bonus');
assert.ok(has('敌方随机弃2张牌。', 'interaction'));
assert.ok(has('敌方无法部署单位。', 'interaction'));
assert.ok(has('使敌方手牌获得+3花费。', 'interaction'));
assert.ok(inspect('获得1个指挥点槽。').roles.some(e => e.economy?.kind === 'slots'));
assert.ok(inspect('下个友方回合，获得10个指挥点。').roles.some(e => e.economy?.kind === 'temporary'));
assert.ok(inspect('使友方手牌中的指令获得-1花费。').roles.some(e => e.economy?.kind === 'discount'));
assert.ok(roles('造成6点伤害，随机分配至所有敌方目标。').filter(e => e.role === 'interaction').reduce((n, e) => n + e.points, 0)
  < roles('对所有敌方单位造成6点伤害。').filter(e => e.role === 'interaction').reduce((n, e) => n + e.points, 0), 'split total damage is not full damage to every target');

const contextDeck = (text: string, supportingOrders: number, friendlyCost = 1) => {
  const engine = { ...makeCard(text, true), cardId: 'engine', importId: 'en' };
  const order = { ...makeCard('', false), cardId: 'blank-order', importId: 'or', json: { ...makeCard('', false).json, kredits: 1 } };
  const unit = { ...filler, json: { ...filler.json, kredits: friendlyCost } };
  return analyzeDeckAbilities(new Map([['en', 1], ['or', supportingOrders], ['zz', 38 - supportingOrders]]),
    new Map([['en', engine], ['or', order], ['zz', unit]]));
};
assert.equal(axis(contextDeck('每次友方使用指令，抽1张牌。', 0), 'supply'), 0);
assert.ok(axis(contextDeck('每次友方使用指令，抽1张牌。', 16), 'supply') > axis(contextDeck('每次友方使用指令，抽1张牌。', 4), 'supply'), 'repeated draws depend on actual supporting cards');
assert.ok(axis(contextDeck('友方单位具有-2花费。', 0, 4), 'opening') > axis(contextDeck('', 0, 4), 'opening'), 'global discounts change availability');
assert.ok(axis(contextDeck('友方单位具有+2花费。', 0, 1), 'opening') < axis(contextDeck('', 0, 1), 'opening'), 'cost increases are not positive discounts');
assert.equal(axis(contextDeck('使友方手牌花费为4。', 0, 1), 'opening') < axis(contextDeck('', 0, 1), 'opening'), true, 'setting costs can harm cheap decks');
assert.equal(roles('抽1张牌，然后若没有敌方单位，抽2张牌。').find(e => e.role === 'supply')!.conditions, undefined,
  'a later condition must not discount an earlier unconditional effect');
assert.ok(axis(contextDeck('抽1张牌，然后若没有敌方单位，抽2张牌。', 0), 'supply') > axis(contextDeck('抽1张牌。', 0), 'supply'));
assert.ok(axis(contextDeck('抽1张牌，然后若没有敌方单位，抽2张牌。', 0), 'supply') < axis(contextDeck('抽3张牌。', 0), 'supply'));
assert.ok(axis(textScore('对1个单位造成1点伤害。若其在支援阵线，改为造成2点伤害。'), 'interaction')
  <= axis(textScore('对1个单位造成2点伤害。'), 'interaction'), 'conditional replacement is not additive damage');
assert.ok(roles('对1个单位造成1点伤害。若其在支援阵线，改为造成2点伤害。')[0].conditions?.includes('NOT:其在支援阵线'),
  'replacement excludes the original payload in the same scenario');
assert.equal(axis(contextDeck('开发1张英国指令。若有友方突击队，额外抽1张牌。', 0), 'supply'),
  axis(contextDeck('开发1张英国指令。', 0), 'supply'), 'unavailable commando support cannot enable a bonus draw');
assert.ok(axis(contextDeck('若没有友方谢尔曼，抽1张牌。', 0), 'supply') > 0, 'absence conditions need no external support card');
assert.equal(axis(contextDeck('若具有动员，抽1张牌。', 0), 'supply'), 0, 'a source keyword is not automatically present');
assert.equal(axis(contextDeck('友方失去1个指挥点槽时，抽1张牌。', 0), 'supply'), 0, 'slot-loss engines need actual slot-loss sources');
assert.ok(!roles('使1个友方坦克获得+2+1。回合结束时，若其当回合没有攻击，将其消灭。')
  .some(e => e.role === 'interaction'), 'sacrificing the previously buffed ally is not enemy removal');
assert.ok(roles('使1个友方坦克获得+2+1。回合结束时，若其当回合没有攻击，将其消灭。')
  .some(e => e.cost === 'sacrifice' && e.points < 0), 'delayed friendly sacrifice remains a real cost');
assert.ok(roles('友方失去1个指挥点槽时，若在场上，获得+2+1，若在手中，获得-2花费。')
  .find(e => e.economy)!.conditions?.every(c => c !== '在场上'), 'mutually exclusive location branches must not be conjoined');

const upgradeScore = (tanks: number, threshold = false) => {
  const text = threshold ? '友方部署坦克时，获得+1攻击力，然后若攻击力不小于4，升为老兵。' : '友方部署坦克时，升为老兵。';
  const base = { ...makeCard(text, true), cardId: 'upgrade-base', importId: 'ub',
    json: { ...makeCard(text, true).json, attributes: ['BecomesVeteran:upgrade-result'] } };
  const upgraded = { ...makeCard('部署：抽9张牌。升为老兵时，抽1张牌。', true), cardId: 'upgrade-result', importId: 'ur' };
  const tank = { ...filler, cardId: 'upgrade-support', importId: 'us', json: { ...filler.json, type: 'tank' } };
  const blankOrder = { ...makeCard(''), cardId: 'upgrade-blank', importId: 'uo' };
  const index = new Map([base, upgraded, tank, blankOrder].map(c => [c.importId, c]));
  const inspected = createCardAbilityReader(index.values())(base);
  assert.ok(!inspected.roles.some(e => e.role === 'supply' && e.points > 0.5), 'upgrading cannot replay veteran deployment');
  return analyzeDeckAbilities(new Map([['ub', 1], ['us', tanks], ['uo', 38 - tanks]]), index);
};
assert.equal(axis(upgradeScore(0), 'supply'), 0);
assert.ok(axis(upgradeScore(16), 'supply') > axis(upgradeScore(4), 'supply'), 'veteran activation follows actual tank support');
assert.ok(axis(upgradeScore(8, true), 'supply') > 0, 'source growth can cross a veteran stat threshold');
assert.ok(axis(upgradeScore(8, true), 'supply') < axis(upgradeScore(8), 'supply'), 'a multi-trigger stat threshold reduces upgrade reliability');

const card = (id: string) => catalog.find(c => c.cardId === id)!;
for (const id of ['front_and_homeland', 'temp_monsoon_rain_1']) assert.equal(read(card(id)).unmodeled.length, 0, id);
assert.ok(!read(card('critical_damage')).roles.some(e => e.role === 'offense'), 'replacement damage retains the original unit target');
assert.equal(read(card('partisans')).unmodeled.length, 0);
assert.equal(read(card('partisans')).roles.filter(e => e.role === 'interaction').length, 1, 'returning a temporarily stolen unit is not a second removal');
const firstCopy = card('ki45_dragon_slayer');
const firstCopyRead = read(firstCopy);
assert.ok(firstCopyRead.roles.filter(e => e.event === 'veteran').every(e => !e.activation?.requires?.length),
  'being the first copy cannot require finding a second physical copy');
assert.ok(axis(analyzeDeckAbilities(new Map([[firstCopy.importId, 1], ['zz', 38]]), new Map([...cardsById, ['zz', filler]])), 'pressure')
  > axis(analyzeDeckAbilities(new Map([[firstCopy.importId, 1], ['zz', 38]]), new Map([...cardsById, ['zz', filler],
    [firstCopy.importId, { ...firstCopy, json: { ...firstCopy.json, attributes: [], text: {} } }]])), 'pressure'));
assert.ok(read(card('advanced_royal_research')).roles.some(e => e.responses?.includes('control')), 'can_create resolves the catalogue-supported 声纳/声呐 translation typo');
const plane = card('aichi_d3a2'), planeDeck = new Map([[plane.importId, 1], ['zz', 38]]);
const planeIndex = new Map([...cardsById, ['zz', filler]] as [string, KardsCardRecord][]);
const planeWithoutText = { ...plane, json: { ...plane.json, text: {} } };
assert.ok(read(plane).roles.some(e => e.requires?.some(tag => tag.includes('aichi_d3a1') && tag.includes('aichi_d3a2'))), 'the D3A family is an OR group of its actual variants');
assert.equal(axis(analyzeDeckAbilities(planeDeck, planeIndex), 'pressure'),
  axis(analyzeDeckAbilities(planeDeck, new Map([...planeIndex, [plane.importId, planeWithoutText]])), 'pressure'),
  'unrelated units cannot supply a named aircraft-family synergy');
const thresholdDeck = (attack: number) => {
  const effect = card('ats'), unit = { ...filler, json: { ...filler.json, attack } };
  return analyzeDeckAbilities(new Map([[effect.importId, 1], ['zz', 38]]), new Map([[effect.importId, effect], ['zz', unit]]));
};
assert.ok(read(card('ats')).roles.some(e => e.role === 'supply' && e.event === 'hq-threshold'), 'enemy-HQ attachment rewards its original caster');
assert.equal(axis(thresholdDeck(1), 'supply'), 0, 'two one-attack units cannot reach the three-damage threshold without other damage');
assert.ok(axis(thresholdDeck(4), 'supply') > axis(thresholdDeck(1), 'supply'), 'HQ damage engines depend on deck damage potential');
assert.equal(axis(thresholdDeck(3), 'supply'), axis(thresholdDeck(30), 'supply'), 'threshold rewards trigger once per turn, not once per three damage');
for (const id of ['ats', 'road_to_berlin', 'ride_of_the_valkyries', 'rule_the_skies', 'island_hopping']) {
  assert.equal(read(card(id)).unmodeled.length, 0, id);
  assert.ok(read(card(id)).roles.some(e => e.event === 'hq-threshold'), id);
}
assert.equal(read(card('new_doctrine')).cannotAttackHQ, false, 'ignoring a restriction does not grant that restriction');
assert.equal(read(card('new_doctrine')).unmodeled.length, 0);
assert.ok(read(card('kokuras_sword')).assumptions.some(s => s.includes('三层')));
assert.ok(read(card('kokuras_sword')).roles.length < 50, 'inherited death effects have finite expansion');
assert.ok(read(card('surveil')).roles.some(e => e.mechanic === 'random-transform'));
assert.ok(read(card('123s')).roles.some(e => e.mechanic === 'next-copy'));
assert.ok(read(card('victory_banners')).roles.some(e => e.mechanic === 'mass-copy'));
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
  writeFileSync(new URL('card-ability-audit.json', path), `${JSON.stringify({ model: DECK_ABILITY_MODEL, scenario: DECK_ABILITY_SCENARIO,
    note: 'Finite neutral-scenario estimates, not a game simulator or a proof of semantic completeness. Unsupported text and explicit approximations are reported separately. Zero unsupported fragments does not mean exact simulation.',
    cardsWithUnmodeledText: audit.filter(c => c.unmodeled.length).length,
    unmodeledFragments: audit.reduce((n, c) => n + c.unmodeled.length, 0),
    cardsWithAssumptions: audit.filter(c => c.assumptions.length).length,
    cards: audit, referenceBands: recalibrated,
    referenceDecks: samples.map(({ code, result }) => ({ code, scores: result.axes.map(({ id, name, score }) => ({ id, name, score })) })),
  }, null, 2)}\n`);
}
console.log(`Deck ability tests passed: ${catalog.length} uniform card profiles, ${samples.length + READY_DECKS.length} decks, semantic and ID-invariance regressions, independent fixed reference bands`);
