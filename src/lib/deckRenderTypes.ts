export interface DeckRenderCard { id: string; name: string; rarity: string; count: number; image: string | null; faction?: string; }
export interface DeckRenderRequest { title: string; code: string; headquartersId?: string; mainNation: string; allyNation: string; cards: DeckRenderCard[]; background?: string | null; headquartersImage?: string | null; limit?: number; }
