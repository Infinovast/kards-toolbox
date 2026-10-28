import type { KardsCardRecord } from '../types/card';
import { isVeteranCard } from '../types/card';
import { isGeneratedCard } from './cardFilters';
export { cardKeywords } from './cardKeywords';

export function cardStatusLabel(card: KardsCardRecord) {
  const form = isVeteranCard(card) ? '老兵形态' : isGeneratedCard(card) ? '衍生卡' : undefined;
  return [card.reserved ? '预备卡' : '现役', form].filter(Boolean).join('，');
}

export function cardRelations(card: KardsCardRecord) {
  const attributes = card.json.attributes || [];
  const related = (prefix: string) => attributes.filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
  return [
    ...related('BecomesVeteran:').map(cardId => ({ cardId, label: '老兵形态' })),
    ...related('VeteranOf:').map(cardId => ({ cardId, label: '原卡' })),
    ...(card.json.can_create || []).map(cardId => ({ cardId, label: '可生成' })),
  ];
}
