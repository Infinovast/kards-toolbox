import type { KardsCardRecord } from '../types/card';

export interface CardFilters {
  query: string;
  cardType: string;
  cost: string;
  rarity: string;
  expansion: string;
  status: string;
}

export const EMPTY_CARD_FILTERS: CardFilters = { query: '', cardType: 'All', cost: 'All', rarity: 'All', expansion: 'All', status: 'All' };

export function isGeneratedCard(card: KardsCardRecord) {
  return ['OnlySpawnable', 'Special'].includes(card.json.set || '');
}

export function matchesCardFilters(card: KardsCardRecord, filters: CardFilters) {
  const term = filters.query.trim().toLocaleLowerCase();
  return (!term || [card.cardId, card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || card.json.description || {})]
    .some(value => value.toLocaleLowerCase().includes(term)))
    && (filters.cardType === 'All' || card.json.type === filters.cardType)
    && (filters.rarity === 'All' || card.json.rarity === filters.rarity)
    && (filters.cost === 'All' || (filters.cost === '7' ? (card.json.kredits ?? 0) >= 7 : String(card.json.kredits ?? 0) === filters.cost))
    && (filters.expansion === 'All' || card.json.set === filters.expansion)
    && (filters.status === 'All' || (filters.status === 'reserved' ? !!card.reserved : filters.status === 'generated' ? isGeneratedCard(card) : !card.reserved && !isGeneratedCard(card)));
}

export function isInBuilderPool(card: KardsCardRecord, mainNation: string, allyNation: string) {
  if (isGeneratedCard(card)) return false;
  const faction = card.json.faction?.toLocaleLowerCase();
  return faction === mainNation.toLocaleLowerCase()
    || (faction === allyNation.toLocaleLowerCase() && card.json.rarity !== 'Elite');
}
