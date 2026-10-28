import subtypeData from '../data/cardSubtypes.json';
import type { CardLanguage } from '../types/card';

export const CARD_SUBTYPES = subtypeData.subtypes;

const subtypesByCardId = new Map<string, string[]>();
for (const subtype of CARD_SUBTYPES) {
  for (const cardId of subtype.cardIds) {
    const values = subtypesByCardId.get(cardId) || [];
    values.push(subtype.id);
    subtypesByCardId.set(cardId, values);
  }
}

export function cardHasSubtype(cardId: string, subtypeId: string) {
  return subtypesByCardId.get(cardId)?.includes(subtypeId) || false;
}

export function cardSubtypeLabels(cardId: string, language: CardLanguage = 'zh-Hans') {
  const names = new Map(CARD_SUBTYPES.map(subtype => [subtype.id, subtype.name[language] || subtype.name['en-EN']]));
  return (subtypesByCardId.get(cardId) || []).map(id => names.get(id)!).filter(Boolean);
}
