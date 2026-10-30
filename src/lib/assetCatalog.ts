import manifest from '../data/assets.json';

export interface FactionAsset {
  icon: string;
  white?: string;
  air?: string;
  flag?: string;
  stripColor: string;
  darkText?: boolean;
}

export interface WildcardAsset {
  file: string;
  crop: { x: number; y: number; width: number; height: number };
}

export const FACTION_ASSETS: Record<string, FactionAsset> = manifest.factions;
export const LOGOS = manifest.logos;
export const RESERVE_ICON = manifest.reserve;
export const TYPE_ICONS: Record<string, string> = manifest.types;
export const SUBCLASS_ICONS: Record<string, string> = manifest.subclasses;
export const RARITY_ICONS: Record<string, string> = manifest.rarities;
export const SET_ICONS: Record<string, string> = manifest.sets;
export const WILDCARDS: Record<string, Record<string, WildcardAsset>> = manifest.wildcards;
export const CARD_PACKS = manifest.cardpacks;

export function wildcardAsset(nation?: string, rarity?: string): WildcardAsset | undefined {
  if (rarity === 'Standard') return WILDCARDS.Common.Standard;
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
