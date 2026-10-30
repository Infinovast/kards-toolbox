import type { KardsCardRecord } from '../types/card';
import { weatherCardFamily } from './weatherCards';

export const CARD_SORT_OPTIONS = [
  { value: 'kredits', label: '费用' },
  { value: 'operationCost', label: '行动费用' },
  { value: 'attack', label: '攻击力' },
  { value: 'defense', label: '防御力' },
  { value: 'nameZh', label: '中文名' },
  { value: 'nameEn', label: '英文名' },
] as const;

export type CardSortKey = typeof CARD_SORT_OPTIONS[number]['value'];
export type CardSortDirection = 'asc' | 'desc';
const typeOrder = ['infantry', 'artillery', 'tank', 'bomber', 'fighter', 'order', 'countermeasure'];
const chineseNames = new Intl.Collator('zh-Hans-u-co-pinyin', { sensitivity: 'base' });
const englishNames = new Intl.Collator('en', { sensitivity: 'base' });

export function sortCards(cards: KardsCardRecord[], key: CardSortKey = 'kredits', direction: CardSortDirection = 'asc') {
  const positions = new Map(cards.map((card, index) => [card.cardId, index]));
  const familyPositions = new Map<string, number>();
  for (const [index, card] of cards.entries()) {
    const family = weatherCardFamily(card.cardId);
    if (family && !familyPositions.has(family.baseId)) familyPositions.set(family.baseId, positions.get(family.baseId) ?? index);
  }
  const position = (card: KardsCardRecord) => {
    const family = weatherCardFamily(card.cardId);
    return family ? familyPositions.get(family.baseId)! : positions.get(card.cardId)!;
  };
  return [...cards].sort((a, b) => {
    let primary: number;
    if (key === 'nameZh' || key === 'nameEn') {
      const language = key === 'nameZh' ? 'zh-Hans' : 'en-EN';
      primary = (key === 'nameZh' ? chineseNames : englishNames).compare(a.json.title?.[language] || a.cardId, b.json.title?.[language] || b.cardId);
    } else {
      const left = a.json[key], right = b.json[key];
      // Orders have no attack/operation values. Missing stats stay at the end
      // in either direction, rather than pretending to be zero-cost units.
      if (left === undefined && right !== undefined) return 1;
      if (right === undefined && left !== undefined) return -1;
      primary = (left ?? 0) - (right ?? 0);
    }
    const rank = (card: KardsCardRecord) => {
      const index = typeOrder.indexOf(card.json.type || '');
      return index < 0 ? typeOrder.length : index;
    };
    return primary * (direction === 'asc' ? 1 : -1)
      || (a.json.kredits ?? 0) - (b.json.kredits ?? 0)
      || rank(a) - rank(b)
      || position(a) - position(b)
      || (weatherCardFamily(a.cardId)?.variant ?? 0) - (weatherCardFamily(b.cardId)?.variant ?? 0);
  });
}
