import weatherCards from '../data/weatherCards.json';

interface WeatherCardFamily {
  baseId: string;
  variant: number;
  thumbnailImportId: string;
}

const baseCards = new Map(weatherCards.map(card => [card.cardId, card]));
const families = new Map<string, WeatherCardFamily>(weatherCards.map(card => {
  const variant = /^temp_(.+)_([12])$/.exec(card.cardId);
  const base = baseCards.get(variant?.[1] || card.cardId)!;
  return [card.cardId, { baseId: base.cardId, variant: Number(variant?.[2] || 0), thumbnailImportId: base.importId }];
}));

export const weatherCardFamily = (cardId: string) => families.get(cardId);
