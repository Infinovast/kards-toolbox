import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { KardsCardRecord } from '../types/card';
import { CARD_PACKS, type CardPackKind } from './assetCatalog';
import { cardPackPool, drawCardPack, packRewardRarity, PACK_RULES } from './cardPacks';
import { isGeneratedCard } from './cardFilters';

const cards: KardsCardRecord[] = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards;
const ordinary = cards.filter(card => !isGeneratedCard(card));
const onePerRarity = ['Standard', 'Limited', 'Special', 'Elite'].map(rarity => ordinary.find(card => card.json.rarity === rarity)!);
for (const pack of CARD_PACKS) {
  const pool = cardPackPool(cards, pack);
  assert.ok(pool.length > 0, pack.id);
  assert.ok(pool.every(card => !isGeneratedCard(card)), `${pack.id} excludes generated cards`);
  assert.ok(pool.every(card => pack.category === 'expansion' ? card.json.set === pack.set
    : pack.nations!.some(nation => nation.toLowerCase() === card.json.faction?.toLowerCase())));
  const drawn = drawCardPack(pool, pack.kind, () => 0);
  assert.equal(drawn.length, PACK_RULES[pack.kind].count);
  assert.ok(drawn.every(reward => reward.kind === 'card' ? pool.includes(reward.card) : pack.kind === 'officer'));
  assert.ok(drawn.filter(reward => packRewardRarity(reward) !== 'Standard').length >= (pack.kind === 'standard' ? 1 : 2));
  if (pack.kind === 'officer') assert.ok(drawn.some(reward => ['Special', 'Elite'].includes(packRewardRarity(reward))));
}
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  // The first draw remains untouched by pity replacement. Check every weighted
  // interval boundary rather than relying on random samples.
  let previous = 0;
  for (const card of onePerRarity) {
    const rarity = card.json.rarity as keyof typeof PACK_RULES.standard.probabilities;
    const weight = PACK_RULES[kind].probabilities[rarity];
    for (const roll of [(previous + 0.0001) / 100, (previous + weight - 0.0001) / 100]) {
      assert.equal(packRewardRarity(drawCardPack(onePerRarity, kind, () => roll)[0]), rarity);
    }
    previous += weight;
  }
  assert.ok(Math.abs(previous - 100) < 1e-10, 'probabilities sum to 100% within floating-point precision');
}
assert.throws(() => drawCardPack([], 'standard'), /暂无可用卡牌/);
assert.throws(() => drawCardPack([onePerRarity[0]], 'standard'), /保底/);
assert.throws(() => drawCardPack(onePerRarity.slice(0, 2), 'officer'), /保底/);
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  const drawn = drawCardPack([onePerRarity[3]], kind, () => 0);
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
      const first = drawCardPack(pool, 'officer', () => ++calls === 1 ? rarityRoll : calls === 2 ? (candidate + position) / 3 : 0)[0];
      assert.equal(packRewardRarity(first), rarity);
      assert.equal(first.kind, candidate === 2 ? 'wildcard' : 'card');
      if (first.kind === 'card') assert.equal(first.card, candidate === 0 ? card : pool.at(-1));
    }
  }
  preceding += PACK_RULES.officer.probabilities[rarity];
}
const wildcardPack = drawCardPack(onePerRarity, 'officer', () => 0.99999);
assert.ok(wildcardPack.every(reward => reward.kind === 'wildcard' && reward.rarity === 'Elite'));
assert.ok(drawCardPack(onePerRarity, 'standard', () => 0.99999).every(reward => reward.kind === 'card'), 'standard packs never contain wildcards');
let pityCalls = 0;
const pityWildcardPack = drawCardPack(onePerRarity, 'officer', () => ++pityCalls <= 14 ? 0 : 0.99999);
assert.equal(pityWildcardPack.length, 7);
assert.equal(pityWildcardPack.filter(reward => reward.kind === 'wildcard' && reward.rarity === 'Elite').length, 2, 'pity replacements can also be Common wildcards');
console.log('card pack pools, exact probabilities, Common wildcards and guarantees passed');
