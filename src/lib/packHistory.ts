import { CARD_RARITIES } from '../types/card';
import { packRewardRarity, type PackReward } from './cardPacks';
import type { CardPackKind } from './assetCatalog';

export interface PackHistory {
  schemaVersion: 1;
  standard: number;
  officer: number;
  rarities: Record<typeof CARD_RARITIES[number], number>;
}

export function emptyPackHistory(): PackHistory {
  return { schemaVersion: 1, standard: 0, officer: 0, rarities: { Standard: 0, Limited: 0, Special: 0, Elite: 0 } };
}

export function validatePackHistory(value: unknown): asserts value is PackHistory {
  const history = value as PackHistory;
  const count = (number: unknown) => Number.isSafeInteger(number) && (number as number) >= 0;
  if (!history || history.schemaVersion !== 1 || !count(history.standard) || !count(history.officer)
    || !history.rarities || CARD_RARITIES.some(rarity => !count(history.rarities[rarity]))
    || !Number.isSafeInteger(history.standard * 100 + history.officer * 330)
    || CARD_RARITIES.reduce((sum, rarity) => sum + history.rarities[rarity], 0) !== history.standard * 5 + history.officer * 7) {
    throw new Error('开包历史格式无效');
  }
}

export function addPackHistory(history: PackHistory, kind: CardPackKind, rewards: PackReward[]): PackHistory {
  const next = { ...history, [kind]: history[kind] + 1, rarities: { ...history.rarities } };
  for (const reward of rewards) next.rarities[packRewardRarity(reward)] += 1;
  validatePackHistory(next);
  return next;
}
