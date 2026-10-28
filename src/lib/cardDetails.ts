import type { KardsCardRecord } from '../types/card';
export { cardKeywords } from './cardKeywords';

export function cardRelations(card: KardsCardRecord) {
  const attributes = card.json.attributes || [];
  const related = (prefix: string) => attributes.filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
  return [
    ...related('BecomesVeteran:').map(cardId => ({ cardId, label: '老兵形态' })),
    ...related('VeteranOf:').map(cardId => ({ cardId, label: '原卡' })),
    ...(card.json.can_create || []).map(cardId => ({ cardId, label: '可生成' })),
  ];
}
