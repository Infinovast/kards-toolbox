import { CARD_RARITIES, type KardsCardRecord } from '../types/card';
import type { CardPackAsset, CardPackKind } from './assetCatalog';
import { isGeneratedCard, isPermanentPoolCard } from './cardFilters';

export const PACK_RULES = {
  standard: { count: 5, probabilities: { Standard: 74.6, Limited: 19.9, Special: 4, Elite: 1.5 }, guarantee: '至少 1 张限定或以上' },
  officer: { count: 7, probabilities: { Standard: 50.6, Limited: 32.1, Special: 12.4, Elite: 4.9 }, guarantee: '至少 2 张限定或以上，其中 1 张特殊或以上' },
} as const;

export type PackRarity = typeof CARD_RARITIES[number];
export type PackReward = { kind: 'card'; card: KardsCardRecord } | { kind: 'wildcard'; rarity: PackRarity };
export function packRewardRarity(reward: PackReward): PackRarity {
  return reward.kind === 'wildcard' ? reward.rarity : reward.card.json.rarity as PackRarity;
}

export const PACK_FLIP_TIMINGS = {
  Standard: { lift: 125, flip: 265, settle: 115, impact: null },
  Limited: { lift: 195, flip: 435, settle: 160, impact: null },
  Special: { lift: 550, flip: 1120, settle: 430, impact: { distance: 8, duration: 420 } },
  Elite: { lift: 840, flip: 1550, settle: 380, impact: { distance: 17, duration: 570 } },
} as const;

export function cardPackPool(cards: KardsCardRecord[], pack: CardPackAsset): KardsCardRecord[] {
  return cards.filter(card => {
    if (!CARD_RARITIES.includes(card.json.rarity as PackRarity)) return false;
    if (pack.source === 'Core') return isPermanentPoolCard(card);
    if (isGeneratedCard(card)) return false;
    return pack.category === 'nation'
      ? pack.nations?.some(nation => nation.toLowerCase() === card.json.faction?.toLowerCase())
      : card.json.set === pack.set;
  });
}

export function drawCardPack(pool: KardsCardRecord[], kind: CardPackKind, random = Math.random): PackReward[] {
  if (!pool.length) throw new Error('这个卡包暂无可用卡牌，请先更新卡牌数据');
  const rules = PACK_RULES[kind];
  const buckets = CARD_RARITIES.map(rarity => {
    const cards = pool.filter(card => card.json.rarity === rarity);
    // One Common wildcard is one additional candidate, not a separate rarity
    // roll or a faction-specific wildcard. Pity uses the same candidate pool.
    const rewards: PackReward[] = cards.map(card => ({ kind: 'card', card }));
    if (kind === 'officer' && cards.length) rewards.push({ kind: 'wildcard', rarity });
    return { rarity, rewards, weight: rules.probabilities[rarity] };
  }).filter(bucket => bucket.rewards.length);
  const limited = buckets.filter(bucket => bucket.rarity !== 'Standard').flatMap(bucket => bucket.rewards);
  const special = buckets.filter(bucket => ['Special', 'Elite'].includes(bucket.rarity)).flatMap(bucket => bucket.rewards);
  if (!limited.length || (kind === 'officer' && !special.length)) throw new Error('这个卡池无法满足卡包保底，请先更新卡牌数据');
  const pick = (rewards: PackReward[]) => rewards[Math.floor(random() * rewards.length)];
  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  const drawn = Array.from({ length: rules.count }, () => {
    let roll = random() * total;
    const selected = buckets.find(bucket => { roll -= bucket.weight; return roll < 0; }) || buckets.at(-1)!;
    return pick(selected.rewards);
  });
  const minimumLimited = kind === 'standard' ? 1 : 2;
  while (drawn.filter(reward => packRewardRarity(reward) !== 'Standard').length < minimumLimited) {
    const index = drawn.length - 1 - [...drawn].reverse().findIndex(reward => packRewardRarity(reward) === 'Standard');
    drawn[index] = pick(limited);
  }
  if (kind === 'officer' && !drawn.some(reward => ['Special', 'Elite'].includes(packRewardRarity(reward)))) {
    const offset = [...drawn].reverse().findIndex(reward => packRewardRarity(reward) === 'Standard');
    drawn[offset < 0 ? drawn.length - 1 : drawn.length - 1 - offset] = pick(special);
  }
  return drawn;
}
