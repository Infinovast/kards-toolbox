import { CARD_RARITIES, type KardsCardRecord } from '../types/card';
import type { CardPackAsset, CardPackKind } from './assetCatalog';
import { isGeneratedCard } from './cardFilters';

export const PACK_RULES = {
  standard: { count: 5, probabilities: { Standard: 73.9, Limited: 19.3, Special: 5.1, Elite: 1.7 }, guarantee: '至少 1 张限定或以上' },
  officer: { count: 7, probabilities: { Standard: 50.6, Limited: 32, Special: 12.4, Elite: 5 }, guarantee: '至少 2 张限定或以上，其中 1 张特殊或以上' },
} as const;

export const PACK_FLIP_TIMINGS = {
  Standard: { lift: 250, flip: 500, settle: 200, impact: 0 },
  Limited: { lift: 350, flip: 700, settle: 300, impact: 0.25 },
  Special: { lift: 500, flip: 1000, settle: 450, impact: 0.4 },
  Elite: { lift: 700, flip: 1400, settle: 600, impact: 0.6 },
} as const;

export function cardPackPool(cards: KardsCardRecord[], pack: CardPackAsset): KardsCardRecord[] {
  return cards.filter(card => !isGeneratedCard(card) && CARD_RARITIES.includes(card.json.rarity as typeof CARD_RARITIES[number])
    && (pack.category === 'nation'
      ? pack.nations?.some(nation => nation.toLowerCase() === card.json.faction?.toLowerCase())
      : card.json.set === pack.set));
}

export function drawCardPack(pool: KardsCardRecord[], kind: CardPackKind, random = Math.random): KardsCardRecord[] {
  if (!pool.length) throw new Error('这个卡包暂无可用卡牌，请先更新卡牌数据');
  const rules = PACK_RULES[kind];
  const buckets = CARD_RARITIES.map(rarity => ({ rarity, cards: pool.filter(card => card.json.rarity === rarity), weight: rules.probabilities[rarity] }))
    .filter(bucket => bucket.cards.length);
  const limited = pool.filter(card => ['Limited', 'Special', 'Elite'].includes(card.json.rarity || ''));
  const special = pool.filter(card => ['Special', 'Elite'].includes(card.json.rarity || ''));
  if (!limited.length || (kind === 'officer' && !special.length)) throw new Error('这个卡池无法满足卡包保底，请先更新卡牌数据');
  const pick = (cards: KardsCardRecord[]) => cards[Math.floor(random() * cards.length)];
  const total = buckets.reduce((sum, bucket) => sum + bucket.weight, 0);
  const drawn = Array.from({ length: rules.count }, () => {
    let roll = random() * total;
    const selected = buckets.find(bucket => { roll -= bucket.weight; return roll < 0; }) || buckets.at(-1)!;
    return pick(selected.cards);
  });
  const minimumLimited = kind === 'standard' ? 1 : 2;
  while (drawn.filter(card => card.json.rarity !== 'Standard').length < minimumLimited) {
    const index = drawn.length - 1 - [...drawn].reverse().findIndex(card => card.json.rarity === 'Standard');
    drawn[index] = pick(limited);
  }
  if (kind === 'officer' && !drawn.some(card => ['Special', 'Elite'].includes(card.json.rarity || ''))) {
    const offset = [...drawn].reverse().findIndex(card => card.json.rarity === 'Standard');
    drawn[offset < 0 ? drawn.length - 1 : drawn.length - 1 - offset] = pick(special);
  }
  return drawn;
}
