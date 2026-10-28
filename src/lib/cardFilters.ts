import type { KardsCardRecord } from '../types/card';
import { cardHasSubtype } from './cardSubtypes';
import { cardHasKeyword } from './cardKeywords';
import cardStatusGroups from '../data/cardStatusGroups.json';

export interface CardFilters {
  query: string;
  factions: string[];
  cardType: string[];
  subtypes: string[];
  keywords: string[];
  cost: string[];
  rarity: string[];
  expansion: string;
  status: string[];
}

export const EMPTY_CARD_FILTERS: CardFilters = { query: '', factions: [], cardType: [], subtypes: [], keywords: [], cost: [], rarity: [], expansion: 'All', status: [] };

const weatherCardIds = new Set(cardStatusGroups.weather);
const researchCardIds = new Set(cardStatusGroups.research);
const punishmentCardIds = new Set(cardStatusGroups.punishment);

export function isGeneratedCard(card: KardsCardRecord) {
  return ['OnlySpawnable', 'Special'].includes(card.json.set || '');
}

function generatedCategory(card: KardsCardRecord) {
  if (card.json.attributes?.some(attribute => attribute.startsWith('VeteranOf:'))) return 'veteran';
  if (weatherCardIds.has(card.cardId)) return 'weather';
  if (researchCardIds.has(card.cardId)) return 'research';
  if (punishmentCardIds.has(card.cardId)) return 'punishment';
  return 'other';
}

function matchesStatus(card: KardsCardRecord, status: string) {
  if (status === 'All') return true;
  if (status === 'active') return !card.reserved && !isGeneratedCard(card);
  if (status === 'reserved') return !!card.reserved;
  if (status === 'permanent') return !!card.json.permanent_pool && !isGeneratedCard(card);
  if (status === 'generated') return isGeneratedCard(card);
  return isGeneratedCard(card) && generatedCategory(card) === status;
}

export function matchesCardFilters(card: KardsCardRecord, filters: CardFilters) {
  const term = filters.query.trim().toLocaleLowerCase();
  return (!term || [card.cardId, card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || {}), ...Object.values(card.json.description || {})]
    .some(value => value.toLocaleLowerCase().includes(term)))
    && (!filters.factions.length || filters.factions.some(faction => faction.toLowerCase() === card.json.faction?.toLowerCase()))
    && (!filters.cardType.length || filters.cardType.includes(card.json.type || ''))
    && (!filters.subtypes.length || filters.subtypes.some(subtype => cardHasSubtype(card.cardId, subtype)))
    && (!filters.keywords.length || filters.keywords.some(keyword => cardHasKeyword(card, keyword)))
    && (!filters.rarity.length || filters.rarity.includes(card.json.rarity || ''))
    && (!filters.cost.length || filters.cost.some(cost => cost === '7' ? (card.json.kredits ?? 0) >= 7 : String(card.json.kredits ?? 0) === cost))
    && (filters.expansion === 'All' || card.json.set === filters.expansion)
    && (!filters.status.length || filters.status.some(status => matchesStatus(card, status)));
}

export function isInBuilderPool(card: KardsCardRecord, mainNation: string, allyNation: string) {
  if (isGeneratedCard(card)) return false;
  const faction = card.json.faction?.toLocaleLowerCase();
  return faction === mainNation.toLocaleLowerCase()
    || (faction === allyNation.toLocaleLowerCase() && card.json.rarity !== 'Elite');
}
