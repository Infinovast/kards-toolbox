import type { DeckCostCategory } from './deckCostCurve';

export interface DeckRenderStatistics { curve: number[]; totals: Record<DeckCostCategory, number> }
export interface DeckRenderCard { id: string; name: string; rarity: string; count: number; image: string | null; faction?: string; cardId?: string; imageUrl?: string; }
export interface DeckRenderRequest { title: string; code: string; headquartersId?: string; cardBackId?: string; mainNation: string; allyNation: string; cards: DeckRenderCard[]; background?: string | null; headquartersImage?: string | null; limit?: number; statistics?: DeckRenderStatistics; }
