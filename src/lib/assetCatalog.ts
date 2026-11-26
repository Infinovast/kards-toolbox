import manifest from '../data/assets.json';

export interface FactionAsset {
  icon: string;
  white?: string;
  air?: string;
  flag?: string;
  stripColor: string;
  darkText?: boolean;
}

export type CardPackKind = 'standard' | 'officer';
export interface CardPackAsset {
  id: string;
  source: string;
  name: string;
  category: 'nation' | 'expansion';
  kind: CardPackKind;
  file: string;
  nations?: string[];
  set?: string;
}

export const FACTION_ASSETS: Record<string, FactionAsset> = manifest.factions;
export const LOGOS = manifest.logos;
export const RESERVE_ICON = manifest.reserve;
export const COIN_ICON = manifest.coin;
export const TYPE_ICONS: Record<string, string> = manifest.types;
export const SUBCLASS_ICONS: Record<string, string> = manifest.subclasses;
export const RARITY_ICONS: Record<string, string> = manifest.rarities;
export const RARITY_COUNT_IMAGES: Record<string, string[]> = manifest.rarityCounts;
export const SET_ICONS: Record<string, string> = manifest.sets;
export const WILDCARDS: Record<string, Record<string, string>> = manifest.wildcards;
export const WILDCARD_ASPECT_RATIO = 500 / 702;
export const CARD_PACKS: CardPackAsset[] = manifest.cardpacks as CardPackAsset[];
const ALTERNATE_CARD_ART = new Map<string, readonly string[]>(Object.entries(manifest.alternateCardArt));

export function alternateCardArt(cardId: string): readonly string[] {
  return ALTERNATE_CARD_ART.get(cardId) || [];
}

export function wildcardAsset(nation?: string, rarity?: string): string | undefined {
  const key = Object.keys(WILDCARDS).find(id => id.toLowerCase() === nation?.toLowerCase());
  return (WILDCARDS[key || 'Common'] || WILDCARDS.Common)[rarity || ''];
}

export function factionAsset(nation?: string): FactionAsset {
  const key = Object.keys(FACTION_ASSETS).find(id => id.toLowerCase() === nation?.toLowerCase());
  return FACTION_ASSETS[key || 'Neutral'];
}

export function factionIcon(nation?: string, variant: 'default' | 'white' | 'air' = 'default'): string {
  const asset = factionAsset(nation);
  return (variant === 'default' ? asset.icon : asset[variant]) || asset.icon;
}

export function cardFactionIcon(nation?: string, type?: string): string {
  return factionIcon(nation, ['fighter', 'bomber'].includes(type?.toLowerCase() || '') ? 'air' : 'default');
}
