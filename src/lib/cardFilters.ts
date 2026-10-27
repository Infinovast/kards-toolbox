import type { KardsCardRecord } from '../types/card';

export interface CardFilters {
  query: string;
  factions: string[];
  cardType: string[];
  cost: string[];
  rarity: string[];
  expansion: string;
  status: string;
}

export const EMPTY_CARD_FILTERS: CardFilters = { query: '', factions: [], cardType: [], cost: [], rarity: [], expansion: 'All', status: 'All' };

export function isGeneratedCard(card: KardsCardRecord) {
  return ['OnlySpawnable', 'Special'].includes(card.json.set || '');
}

export function matchesCardFilters(card: KardsCardRecord, filters: CardFilters) {
  const term = filters.query.trim().toLocaleLowerCase();
  return (!term || [card.cardId, card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || {}), ...Object.values(card.json.description || {})]
    .some(value => value.toLocaleLowerCase().includes(term)))
    && (!filters.factions.length || filters.factions.some(faction => faction.toLowerCase() === card.json.faction?.toLowerCase()))
    && (!filters.cardType.length || filters.cardType.includes(card.json.type || ''))
    && (!filters.rarity.length || filters.rarity.includes(card.json.rarity || ''))
    && (!filters.cost.length || filters.cost.some(cost => cost === '7' ? (card.json.kredits ?? 0) >= 7 : String(card.json.kredits ?? 0) === cost))
    && (filters.expansion === 'All' || card.json.set === filters.expansion)
    && (filters.status === 'All' || (filters.status === 'reserved' ? !!card.reserved : filters.status === 'generated' ? isGeneratedCard(card) : !card.reserved && !isGeneratedCard(card)));
}

export function isInBuilderPool(card: KardsCardRecord, mainNation: string, allyNation: string) {
  if (isGeneratedCard(card)) return false;
  const faction = card.json.faction?.toLocaleLowerCase();
  return faction === mainNation.toLocaleLowerCase()
    || (faction === allyNation.toLocaleLowerCase() && card.json.rarity !== 'Elite');
}
