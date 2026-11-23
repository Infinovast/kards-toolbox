import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_RARITIES, type KardsCardRecord } from '../types/card';
import { CARD_PACKS, type CardPackAsset, type CardPackKind } from './assetCatalog';
import { cardPackPool, drawCardPack, packRewardRarity, PACK_RULES } from './cardPacks';
import { isGeneratedCard } from './cardFilters';

const cards: KardsCardRecord[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards;
const ordinary = cards.filter(card => !isGeneratedCard(card));
const onePerRarity = ['Standard', 'Limited', 'Special', 'Elite'].map(rarity => ordinary.find(card => card.json.rarity === rarity)!);
const standardPack = CARD_PACKS.find(pack => pack.id === 'Core_standard')!;
const officerPack = CARD_PACKS.find(pack => pack.id === 'Core_officer')!;
const allyOfficerPack = CARD_PACKS.find(pack => pack.id === 'Ally_officer')!;
const testPacks: Record<CardPackKind, CardPackAsset> = { standard: standardPack, officer: officerPack };
for (const pack of CARD_PACKS) {
  const pool = cardPackPool(cards, pack);
  assert.ok(pool.length > 0, pack.id);
  assert.ok(pool.every(card => !isGeneratedCard(card)), `${pack.id} excludes generated cards`);
  if (pack.source === 'Core') {
    assert.deepEqual(pool, ordinary.filter(card => card.json.permanent_pool
      && CARD_RARITIES.some(rarity => rarity === card.json.rarity)));
    assert.ok(pool.some(card => card.json.set !== pack.set), 'Core includes permanent cards from other sets');
    assert.ok(cards.some(card => card.json.set === pack.set && !card.json.permanent_pool && !pool.includes(card)),
      'Core excludes nonpermanent cards from Base');
  } else {
    assert.ok(pool.every(card => pack.category === 'expansion' ? card.json.set === pack.set
      : pack.nations!.some(nation => nation.toLowerCase() === card.json.faction?.toLowerCase())));
  }
  const drawn = drawCardPack(pool, pack, () => 0);
  assert.equal(drawn.length, PACK_RULES[pack.kind].count);
  assert.ok(drawn.every(reward => reward.kind === 'card' ? pool.includes(reward.card) : pack.kind === 'officer'));
  assert.ok(drawn.filter(reward => packRewardRarity(reward) !== 'Standard').length >= (pack.kind === 'standard' ? 1 : 2));
  if (pack.kind === 'officer') {
    assert.ok(drawn.some(reward => ['Special', 'Elite'].includes(packRewardRarity(reward))));
    const nation = pack.source === 'Ally' ? 'USA' : pack.category === 'nation' ? pack.source : undefined;
    for (const [roll, rarity] of [[0, 'Standard'], [0.6, 'Limited'], [0.9, 'Special'], [0.99, 'Elite']] as const) {
      let calls = 0;
      const expected = { kind: 'wildcard', rarity, nation };
      const [first] = drawCardPack(onePerRarity, pack, () => ++calls === 1 ? roll : 0.99999);
      assert.deepEqual(first, expected, `${pack.id} ${rarity}`);
    }
  }
}
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  // The first draw remains untouched by pity replacement. Check every weighted
  // interval boundary rather than relying on random samples.
  let previous = 0;
  for (const card of onePerRarity) {
    const rarity = card.json.rarity as keyof typeof PACK_RULES.standard.probabilities;
    const weight = PACK_RULES[kind].probabilities[rarity];
    for (const roll of [(previous + 0.0001) / 100, (previous + weight - 0.0001) / 100]) {
      assert.equal(packRewardRarity(drawCardPack(onePerRarity, testPacks[kind], () => roll)[0]), rarity);
    }
    previous += weight;
  }
  assert.ok(Math.abs(previous - 100) < 1e-10, 'probabilities sum to 100% within floating-point precision');
}
assert.throws(() => drawCardPack([], standardPack), /暂无可用卡牌/);
assert.throws(() => drawCardPack([onePerRarity[0]], standardPack), /保底/);
assert.throws(() => drawCardPack(onePerRarity.slice(0, 2), officerPack), /保底/);
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  const drawn = drawCardPack([onePerRarity[3]], testPacks[kind], () => 0);
  assert.equal(drawn.length, PACK_RULES[kind].count, 'sparse pools retain exact pack size');
  assert.ok(drawn.every(reward => reward.kind === 'card' && reward.card === onePerRarity[3]));
}
assert.deepEqual(Object.values(PACK_RULES.standard.probabilities), [74.6, 19.9, 4, 1.5]);
assert.deepEqual(Object.values(PACK_RULES.officer.probabilities), [50.6, 32.1, 12.4, 4.9]);
// Within each officer rarity bucket, every card and the one Common wildcard
// occupy intervals of exactly the same width, including the interval edges.
let preceding = 0;
for (const card of onePerRarity) {
  const rarity = card.json.rarity as keyof typeof PACK_RULES.officer.probabilities;
  const pool = [...onePerRarity, { ...card, cardId: `${card.cardId}_second`, importId: 'fixture' }];
  const rarityRoll = (preceding + PACK_RULES.officer.probabilities[rarity] / 2) / 100;
  for (let candidate = 0; candidate < 3; candidate++) {
    for (const position of [0.00001, 0.99999]) {
      let calls = 0;
      const first = drawCardPack(pool, officerPack, () => ++calls === 1 ? rarityRoll : calls === 2 ? (candidate + position) / 3 : 0)[0];
      assert.equal(packRewardRarity(first), rarity);
      assert.equal(first.kind, candidate === 2 ? 'wildcard' : 'card');
      if (first.kind === 'card') assert.equal(first.card, candidate === 0 ? card : pool.at(-1));
    }
  }
  preceding += PACK_RULES.officer.probabilities[rarity];
}
assert.ok(drawCardPack(onePerRarity, standardPack, () => 0.99999).every(reward => reward.kind === 'card'), 'standard packs never contain wildcards');
for (const [pack, nation] of [[officerPack, undefined], [CARD_PACKS.find(pack => pack.id === 'Britain_officer')!, 'Britain'], [allyOfficerPack, 'USA']] as const) {
  const wildcardPack = drawCardPack(onePerRarity, pack, () => 0.99999);
  assert.ok(wildcardPack.every(reward => reward.kind === 'wildcard' && reward.rarity === 'Elite' && reward.nation === nation));
  let pityCalls = 0;
  const pityWildcardPack = drawCardPack(onePerRarity, pack, () => ++pityCalls <= 14 ? 0 : 0.99999);
  assert.equal(pityWildcardPack.length, 7);
  assert.deepEqual(pityWildcardPack.filter(reward => reward.kind === 'wildcard'),
    Array.from({ length: 2 }, () => ({ kind: 'wildcard', rarity: 'Elite', nation })), 'pity wildcards follow the pack nation rule');
}
const allyRolls = [...Array.from({ length: 14 }, () => 0.99999), 0, 0.2, 0.4, 0.6, 0.8, 0.19999, 0.99999].values();
const allyWildcards = drawCardPack(cardPackPool(cards, allyOfficerPack), allyOfficerPack,
  () => allyRolls.next().value!);
assert.deepEqual(allyWildcards.map(reward => reward.kind === 'wildcard' ? reward.nation : undefined),
  ['Germany', 'Britain', 'Japan', 'Soviet', 'USA', 'Germany', 'USA'], 'each Ally wildcard rolls its own main nation');
console.log('card pack pools, exact probabilities, national and common wildcards and guarantees passed');
