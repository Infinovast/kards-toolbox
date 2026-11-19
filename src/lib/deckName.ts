import { factionLabel } from '../types/card';

export function defaultDeckName(mainNation: string, allyNation = mainNation): string {
  const main = factionLabel(mainNation).slice(0, 1);
  const ally = mainNation.toLowerCase() === allyNation.toLowerCase() ? '' : factionLabel(allyNation).slice(0, 1);
  return `${main}${ally}卡组`;
}

export function normalizeDeckName(name: string, fallback: string): string {
  const trimmed = name.trim();
  return /[\p{L}\p{N}]/u.test(trimmed) ? trimmed : fallback;
}
