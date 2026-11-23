import type { KardsCardRecord } from '../types/card';
import { isVeteranCard } from '../types/card';
import { EMPTY_CARD_FILTERS, isGeneratedCard, matchesCardFilters } from './cardFilters';
export { cardKeywords } from './cardKeywords';

const specialUnitIds = new Set([
  'no_1_commando', 'no_9_commando', 'no_10_commando', 'no_3_commando', 'no_43_commando',
  '10th_para_battalion', '1st_airborne', '2nd_parachute', '5th_parachute_brigade',
  '2nd_para_c', '6th_airlanding_brigade', '7th_scottish_borderers', 'ox_and_bucks',
]);
const britishCards = { ...EMPTY_CARD_FILTERS, factions: ['Britain'] };
const germanTanks = { ...EMPTY_CARD_FILTERS, factions: ['Germany'], cardType: ['tank'] };

const relatedSubtypes = new Map<string, {
  matches: (card: KardsCardRecord) => boolean;
  generatedException?: string;
}>([
  ['baker_street_irregulars', {
    matches: card => specialUnitIds.has(card.cardId) && matchesCardFilters(card, britishCards),
    generatedException: '2nd_parachute',
  }],
  ['blitz_doctrine', {
    matches: card => matchesCardFilters(card, germanTanks)
      && (card.json.kredits ?? 0) >= 1 && (card.json.kredits ?? 0) <= 3,
  }],
  ['contest_doctrine', {
    matches: card => matchesCardFilters(card, germanTanks) && (card.json.kredits ?? 0) >= 4,
  }],
]);

export function cardStatusLabel(card: KardsCardRecord) {
  const form = isVeteranCard(card) ? '老兵形态' : isGeneratedCard(card) ? '衍生卡' : undefined;
  return [card.reserved ? '预备卡' : '现役', form].filter(Boolean).join('，');
}

export function cardRelations(card: KardsCardRecord, cards: readonly KardsCardRecord[] = []) {
  const attributes = card.json.attributes || [];
  const related = (prefix: string) => attributes.filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
  const relations = [
    ...related('BecomesVeteran:').map(cardId => ({ cardId, label: '老兵形态' })),
    ...related('VeteranOf:').map(cardId => ({ cardId, label: '原卡' })),
    ...(card.json.can_create || []).map(cardId => ({ cardId, label: '可生成' })),
  ];
  const subtype = relatedSubtypes.get(card.cardId);
  if (!subtype) return relations;

  const existingIds = new Set(relations.map(relation => relation.cardId));
  for (const candidate of cards) {
    if (existingIds.has(candidate.cardId)) continue;
    if ((candidate.cardId === subtype.generatedException || !isGeneratedCard(candidate)) && subtype.matches(candidate)) {
      relations.push({ cardId: candidate.cardId, label: '可开发' });
    }
  }
  return relations;
}
