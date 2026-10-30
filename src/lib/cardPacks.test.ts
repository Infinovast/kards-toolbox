import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { KardsCardRecord } from '../types/card';
import { CARD_PACKS, type CardPackKind } from './assetCatalog';
import { cardPackPool, drawCardPack, PACK_RULES } from './cardPacks';
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
  assert.ok(drawn.every(card => pool.includes(card)));
  assert.ok(drawn.filter(card => card.json.rarity !== 'Standard').length >= (pack.kind === 'standard' ? 1 : 2));
  if (pack.kind === 'officer') assert.ok(drawn.some(card => ['Special', 'Elite'].includes(card.json.rarity!)));
}
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  // The first draw remains untouched by pity replacement. Check every weighted
  // interval boundary rather than relying on random samples.
  let previous = 0;
  for (const card of onePerRarity) {
    const rarity = card.json.rarity as keyof typeof PACK_RULES.standard.probabilities;
    const weight = PACK_RULES[kind].probabilities[rarity];
    for (const roll of [(previous + 0.0001) / 100, (previous + weight - 0.0001) / 100]) {
      assert.equal(drawCardPack(onePerRarity, kind, () => roll)[0].json.rarity, rarity);
    }
    previous += weight;
  }
  assert.equal(previous, 100);
}
assert.throws(() => drawCardPack([], 'standard'), /暂无可用卡牌/);
assert.throws(() => drawCardPack([onePerRarity[0]], 'standard'), /保底/);
assert.throws(() => drawCardPack(onePerRarity.slice(0, 2), 'officer'), /保底/);
for (const kind of ['standard', 'officer'] as CardPackKind[]) {
  const drawn = drawCardPack([onePerRarity[3]], kind, () => 0);
  assert.equal(drawn.length, PACK_RULES[kind].count, 'sparse pools retain exact pack size');
  assert.ok(drawn.every(card => card === onePerRarity[3]));
}
console.log('card pack pools, probability boundaries and guarantees passed');
