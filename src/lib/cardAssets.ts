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
  previousFiles?: string[];
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
  englishName: string;
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
  cardId?: string;
  cardType?: string;
  nation?: string;
  previousFiles?: string[];
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
export const DEFAULT_TABLECLOTH = TABLECLOTHS.find(item => item.id === tableclothManifest.defaultTableclothId)?.file
  || TABLECLOTHS.find(item => item.type === 'default')?.file || '';

export function resolveSelectedTablecloth(value: string | null | undefined, customTablecloths: string[] = []): string {
  if (!value) return DEFAULT_TABLECLOTH;
  if (customTablecloths.includes(value)) return value;
  return USER_TABLECLOTHS.find(item => item.file === value || item.previousFiles?.includes(value))?.file || DEFAULT_TABLECLOTH;
}

export const DEFAULT_CARD_BACK = CARD_BACKS.find(back => back.id === cardBackData.defaultBackId)?.file || '';
export const DEFAULT_HEADQUARTERS_BY_NATION: Record<string, string> = {
  USA: 'USA/cherbourg', Soviet: 'Soviet/stalingrad', Britain: 'Britain/alam_el_halfa',
  Japan: 'Japan/truk', Germany: 'Germany/danzig',
};
export const BUNKER_HEADQUARTERS = HEADQUARTERS.find(item => item.groupId === 'Common/concrete_bunker_neutral' && item.nation === 'Blank');

export function defaultHeadquartersForNation(nation: string): HeadquartersAsset | undefined {
  const groupId = DEFAULT_HEADQUARTERS_BY_NATION[nation];
  return HEADQUARTERS.find(item => item.groupId === groupId && item.nation === nation) || BUNKER_HEADQUARTERS;
}

export function defaultCardBackForNation(nation: string): string {
  const canonical = Object.keys(cardBackData.defaultBackByNation).find(key => key.toLowerCase() === nation.toLowerCase());
  const id = cardBackData.defaultBackByNation[canonical || nation];
  return CARD_BACKS.find(back => back.id === id)?.file || DEFAULT_CARD_BACK;
}

export function cardBackIsAvailable(back: CardBackAsset, mainNation: string, allyNation?: string): boolean {
  return back.scope === 'common' || back.nation === mainNation || back.nation === allyNation;
}

export function cardBackForDeck(deck: { mainNation: string; allyNation?: string; cardBackUrl?: string }): string {
  if (!deck.cardBackUrl) return defaultCardBackForNation(deck.mainNation);
  const catalogBack = CARD_BACKS.find(back => back.file === deck.cardBackUrl || back.previousFiles?.includes(deck.cardBackUrl!));
  if (catalogBack) return cardBackIsAvailable(catalogBack, deck.mainNation, deck.allyNation) ? catalogBack.file : defaultCardBackForNation(deck.mainNation);
  return deck.cardBackUrl.startsWith('/assets/cardbacks/') ? defaultCardBackForNation(deck.mainNation) : deck.cardBackUrl;
}

export function headquartersForDeck(groupId: string | undefined, nation: string): HeadquartersAsset | undefined {
  if (groupId && groupId !== 'default') {
    const selected = HEADQUARTERS.find(item => item.groupId === groupId && item.nation === nation);
    if (selected) return selected;
  }
  return defaultHeadquartersForNation(nation);
}

export function headquartersOptions(nation: string): HeadquartersAsset[] {
  return HEADQUARTERS.filter(item => item.nation === nation)
    .filter((item, index, list) => list.findIndex(candidate => candidate.groupId === item.groupId) === index)
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans'));
}

export function tableclothForHeadquarters(groupId: string | undefined): string | undefined {
  return TABLECLOTHS.find(item => item.type === 'headquarters' && item.headquartersId === groupId)?.file;
}

export const HEADQUARTERS_STACKS = [
  { id: 'USA', label: '美国', nation: 'USA', scope: 'main' as const },
  { id: 'Soviet', label: '苏联', nation: 'Soviet', scope: 'main' as const },
  { id: 'Britain', label: '英国', nation: 'Britain', scope: 'main' as const },
  { id: 'Japan', label: '日本', nation: 'Japan', scope: 'main' as const },
  { id: 'Germany', label: '德国', nation: 'Germany', scope: 'main' as const },
  { id: 'Common', label: '中立', nation: 'Blank', scope: 'common' as const },
].map(category => ({
  ...category,
  cards: HEADQUARTERS.filter(item => item.scope === category.scope && item.nation === category.nation)
    .sort((a, b) => {
      const first = category.id === 'Common' ? 'Common/supply_train_neutral' : DEFAULT_HEADQUARTERS_BY_NATION[category.nation];
      return Number(b.groupId === first) - Number(a.groupId === first);
    }),
}));
