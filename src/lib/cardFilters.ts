import { isVeteranCard, type KardsCardRecord } from '../types/card';
import { cardHasSubtype } from './cardSubtypes';
import { cardHasKeyword } from './cardKeywords';
import cardStatusGroups from '../data/cardStatusGroups.json';

export interface CardFilters {
  query: string;
  factions: string[];
  cardType: string[];
  subtypes: string[];
  keywords: string[];
  keywordMode: 'or' | 'and';
  cost: string[];
  rarity: string[];
  expansion: string;
  status: string[];
}

export const EMPTY_CARD_FILTERS: CardFilters = { query: '', factions: [], cardType: [], subtypes: [], keywords: [], keywordMode: 'or', cost: [], rarity: [], expansion: 'All', status: [] };
export const CARD_SEARCH_HINT = '中文名忽略空格和符号；“.”匹配 1 个任意字符；x1404：部署/行动/攻击/防御，x104：部署/攻击/防御';

let lastSearchTerm = '';
let searchPattern: RegExp | null = null;
let nameSearchTerm = '';
let nameSearchPattern: RegExp | null = null;
const searchPatternFor = (term: string) => term.includes('.')
  ? new RegExp(term.split('.').map(part => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[\\s\\S]'), 'u') : null;
const normalizeChineseName = (text: string) => text.replace(/[\s\p{P}\p{S}]/gu, '');

function matchesCardSearch(card: KardsCardRecord, query: string) {
  const term = query.trim().toLocaleLowerCase();
  if (!term) return true;
  const statsQuery = /^x(\d{3,4})$/.exec(term);
  if (statsQuery) {
    if (!['infantry', 'artillery', 'tank', 'bomber', 'fighter'].includes(card.json.type || '')) return false;
    const stats = [card.json.kredits, ...(statsQuery[1].length === 4 ? [card.json.operationCost] : []), card.json.attack, card.json.defense];
    return stats.every(value => Number.isInteger(value) && value >= 0 && value <= 9) && stats.join('') === statsQuery[1];
  }
  if (term !== lastSearchTerm) {
    lastSearchTerm = term;
    searchPattern = searchPatternFor(term);
    // Keep dot wildcards while ignoring punctuation in Chinese localized names.
    nameSearchTerm = term.split('.').map(normalizeChineseName).join('.');
    nameSearchPattern = searchPatternFor(nameSearchTerm);
  }
  return [card.cardId, card.importId, ...Object.values(card.json.title || {}), ...Object.values(card.json.text || {}), ...Object.values(card.json.description || {})]
    .some(value => searchPattern ? searchPattern.test(value.toLocaleLowerCase()) : value.toLocaleLowerCase().includes(term))
    || !!nameSearchTerm && Object.entries(card.json.title || {}).some(([language, title]) => {
      if (!language.startsWith('zh')) return false;
      const normalized = normalizeChineseName(title.toLocaleLowerCase());
      return nameSearchPattern ? nameSearchPattern.test(normalized) : normalized.includes(nameSearchTerm);
    });
}

export function hasCardFilterConditions(filters: CardFilters) {
  return !!(filters.factions.length || filters.cardType.length || filters.subtypes.length || filters.keywords.length
    || filters.cost.length || filters.rarity.length || filters.status.length || filters.expansion !== 'All');
}

const weatherCardIds = new Set(cardStatusGroups.weather);
const researchCardIds = new Set(cardStatusGroups.research);
const punishmentCardIds = new Set(cardStatusGroups.punishment);

export function isGeneratedCard(card: KardsCardRecord) {
  return isVeteranCard(card) || ['OnlySpawnable', 'Special'].includes(card.json.set || '');
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
  return matchesCardSearch(card, filters.query)
    && (!filters.factions.length || filters.factions.some(faction => faction.toLowerCase() === card.json.faction?.toLowerCase()))
    && (!filters.cardType.length || filters.cardType.includes(card.json.type || ''))
    && (!filters.subtypes.length || filters.subtypes.some(subtype => cardHasSubtype(card.cardId, subtype)))
    && (!filters.keywords.length || (filters.keywordMode === 'and'
      ? filters.keywords.every(keyword => cardHasKeyword(card, keyword))
      : filters.keywords.some(keyword => cardHasKeyword(card, keyword))))
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
