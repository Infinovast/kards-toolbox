import cardBackManifest from '../data/cardbacks.json';
import headquartersManifest from '../data/headquarters.json';
import tableclothManifest from '../data/tablecloths.json';

export interface CardBackAsset {
  id: string;
  name: string;
  file: string;
  scope: 'common' | 'main' | 'ally';
  nation?: string;
  isDefault?: boolean;
}

export interface CardBackCategory {
  id: string;
  name: string;
  scope: CardBackAsset['scope'];
  nation?: string;
  backs: CardBackAsset[];
}

export interface HeadquartersAsset {
  id: string;
  groupId: string;
  name: string;
  nation: string;
  scope: 'main' | 'common';
  sourceFaction: string;
  rarity: string;
  image: string;
  brief: string;
  history: string;
}

export interface TableclothAsset {
  id: string;
  name: string;
  file: string;
  type: 'default' | 'wallpaper' | 'headquarters';
  headquartersId?: string;
}

const cardBackData = cardBackManifest as {
  defaultBackId: string;
  defaultBackByNation: Record<string, string | null>;
  categories: CardBackCategory[];
};

export const CARD_BACK_CATEGORIES = cardBackData.categories;
export const CARD_BACKS = CARD_BACK_CATEGORIES.flatMap(category => category.backs);
export const HEADQUARTERS = (headquartersManifest as { headquarters: HeadquartersAsset[] }).headquarters;
export const TABLECLOTHS = (tableclothManifest as { tablecloths: TableclothAsset[] }).tablecloths;
export const USER_TABLECLOTHS = TABLECLOTHS.filter(item => item.type !== 'headquarters');

export const DEFAULT_CARD_BACK = CARD_BACKS.find(back => back.id === cardBackData.defaultBackId)?.file || '';

export function defaultCardBackForNation(nation: string): string {
  const id = cardBackData.defaultBackByNation[nation];
  return CARD_BACKS.find(back => back.id === id)?.file || DEFAULT_CARD_BACK;
}

export function cardBackIsAvailable(back: CardBackAsset, mainNation: string, allyNation?: string): boolean {
  return back.scope === 'common' || back.nation === mainNation || back.nation === allyNation;
}

export function cardBackForDeck(deck: { mainNation: string; allyNation?: string; cardBackUrl?: string }): string {
  if (!deck.cardBackUrl) return defaultCardBackForNation(deck.mainNation);
  const catalogBack = CARD_BACKS.find(back => back.file === deck.cardBackUrl);
  if (catalogBack) return cardBackIsAvailable(catalogBack, deck.mainNation, deck.allyNation) ? deck.cardBackUrl : defaultCardBackForNation(deck.mainNation);
  return deck.cardBackUrl.startsWith('/assets/cardbacks/') ? defaultCardBackForNation(deck.mainNation) : deck.cardBackUrl;
}

export function headquartersForDeck(groupId: string | undefined, nation: string): HeadquartersAsset | undefined {
  if (!groupId) return undefined;
  return HEADQUARTERS.find(item => item.groupId === groupId && item.nation === nation);
}

export function headquartersOptions(nation: string): HeadquartersAsset[] {
  return HEADQUARTERS.filter(item => item.nation === nation)
    .filter((item, index, list) => list.findIndex(candidate => candidate.groupId === item.groupId) === index)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
}

export function tableclothForHeadquarters(groupId: string | undefined): string | undefined {
  return TABLECLOTHS.find(item => item.type === 'headquarters' && item.headquartersId === groupId)?.file;
}

const stackNationOrder = ['Britain', 'Germany', 'Japan', 'Soviet', 'USA'];
export const HEADQUARTERS_STACK = [
  ...stackNationOrder.map(nation => HEADQUARTERS.find(item => item.scope === 'main' && item.nation === nation)).filter((item): item is HeadquartersAsset => !!item),
  HEADQUARTERS.find(item => item.scope === 'common' && item.nation === 'USA'),
].filter((item): item is HeadquartersAsset => !!item);
