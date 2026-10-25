export interface DeckRenderCard { id: string; name: string; rarity: string; count: number; image: string | null; }
export interface DeckRenderRequest { title: string; mainNation: string; allyNation: string; cards: DeckRenderCard[]; background?: string | null; }
