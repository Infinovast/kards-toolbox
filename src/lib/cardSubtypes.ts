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
  return cardSubtypes(cardId).map(subtype => subtype.name[language] || subtype.name['en-EN']);
}

export function cardSubtypes(cardId: string) {
  return CARD_SUBTYPES.filter(subtype => cardHasSubtype(cardId, subtype.id));
}
