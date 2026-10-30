import { decodeDeckCode } from './deckCode';
import type { KardsCardRecord } from '../types/card';

const RARITY_RANK: Record<string, number> = { Standard: 1, Limited: 2, Special: 3, Elite: 4 };

/** Shared counts, curve and featured artwork for preset covers and mini exports. */
export function summarizeDeckCover(code: string, cardsById: Map<string, KardsCardRecord>) {
  const decoded = decodeDeckCode(code);
  const curve = Array<number>(8).fill(0), rarities: Record<string, number> = {};
  let mainCount = 1, allyCount = 0, total = 1;
  let featured: KardsCardRecord | undefined;
  for (const [id, count] of decoded.counts) {
    total += count;
    const card = cardsById.get(id);
    if (!card) continue;
    const faction = card.json.faction?.toLowerCase();
    if (faction === decoded.mainNation.toLowerCase()) mainCount += count;
    else if (faction === decoded.allyNation.toLowerCase()) allyCount += count;
    curve[Math.min(7, Math.max(0, card.json.kredits || 0))] += count;
    const rarity = card.json.rarity || 'Standard';
    rarities[rarity] = (rarities[rarity] || 0) + count;
    if (faction === decoded.mainNation.toLowerCase() && (!featured
      || RARITY_RANK[rarity] > RARITY_RANK[featured.json.rarity || 'Standard'])) featured = card;
  }
  return { ...decoded, curve, rarities, mainCount, allyCount, total, featured };
}
