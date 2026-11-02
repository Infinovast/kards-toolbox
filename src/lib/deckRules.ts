import { cardTitle, type KardsCardRecord } from '../types/card';
import { isGeneratedCard } from './cardFilters';

export type DeckRuleSet = 'standard' | 'arena';
export interface DeckRules {
  deckSize: number;
  maxStandard: number;
  maxLimited: number;
  maxSpecial: number;
  maxElite: number;
  maxAllyCards: number;
  allowReserved: boolean;
  allowGenerated: boolean;
}

// 卡组码不含总部：39 张可用牌 + 1 张总部。
export const DEFAULT_DECK_RULES: Record<DeckRuleSet, DeckRules> = {
  standard: { deckSize: 39, maxStandard: 4, maxLimited: 3, maxSpecial: 2, maxElite: 1, maxAllyCards: 12, allowReserved: false, allowGenerated: false },
  arena: { deckSize: 39, maxStandard: 39, maxLimited: 39, maxSpecial: 39, maxElite: 39, maxAllyCards: 12, allowReserved: true, allowGenerated: false },
};

export function deckRuleSet(entries: Map<string, number>, cardsById: Map<string, KardsCardRecord>): DeckRuleSet {
  return [...entries].some(([id, count]) => count > 0 && cardsById.get(id)?.reserved) ? 'arena' : 'standard';
}

export const deckModeLabel = (ruleSet: DeckRuleSet) => ruleSet === 'arena' ? '经典模式' : '排位/休闲模式';

export function validateDeck(entries: Map<string, number>, cardsById: Map<string, KardsCardRecord>, mainNation: string, allyNation: string, rules: DeckRules): string[] {
  const warnings: string[] = [];
  const total = [...entries.values()].reduce((sum, count) => sum + count, 0);
  if (total !== rules.deckSize) warnings.push(`卡组数量不足：${total + 1}/${rules.deckSize + 1}`);
  if (!['Germany', 'Britain', 'Japan', 'Soviet', 'USA'].includes(mainNation)) warnings.push('所选主国不在五个主要国家中');
  let allyCount = 0;
  for (const [importId, count] of entries) {
    const card = cardsById.get(importId);
    if (!card) { warnings.push(`本地缺少卡牌 ${importId} 的资料，已保留数量 ${count}；请手动更新牌库`); continue; }
    const name = cardTitle(card, 'zh-Hans');
    const limit = ({ Standard: rules.maxStandard, Limited: rules.maxLimited, Special: rules.maxSpecial, Elite: rules.maxElite })[card.json.rarity || ''] ?? rules.maxStandard;
    if (count > limit) warnings.push(`${name} 有 ${count} 张，超过稀有度上限 ${limit} 张`);
    const faction = (card.json.faction || 'Neutral').toLowerCase();
    if (faction !== 'neutral' && faction !== mainNation.toLowerCase() && faction !== allyNation.toLowerCase()) warnings.push(`${name} 属于未选阵营 ${card.json.faction}`);
    if (mainNation !== allyNation && faction === allyNation.toLowerCase()) allyCount += count;
    if (card.reserved && !rules.allowReserved) warnings.push(`${name} 是预备卡`);
    if (!rules.allowGenerated && isGeneratedCard(card)) warnings.push(`${name} 是衍生卡，不能直接加入标准卡组`);
  }
  if (allyCount > rules.maxAllyCards) warnings.push('盟国牌数量过多');
  return warnings;
}
