import type { KardsCardRecord } from '../types/card';
import type { HeadquartersAsset } from './cardAssets';
import { captureCardDetailOrigin, type CardDetailOrigin } from './cardDetailOrigin';

export type CardDetailItem = { card: KardsCardRecord; headquarters?: never } | { headquarters: HeadquartersAsset; card?: never };
export const detailItemId = (item: CardDetailItem) => item.card ? item.card.cardId : `hq:${item.headquarters.id}`;
export const nextDetailFrame = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

/** Wait for a page change, then reveal and recapture the current source. */
export async function revealDetailItem(item: CardDetailItem, kind: 'pool' | 'strip', root: HTMLElement | null): Promise<CardDetailOrigin | undefined> {
  await nextDetailFrame();
  const selector = kind === 'pool' ? `[data-detail-source="${CSS.escape(detailItemId(item))}"]`
    : item.card ? `[data-deck-card-id="${CSS.escape(item.card.importId)}"]` : '.deck-headquarters-strip';
  const element = root?.querySelector<HTMLElement>(selector) || null;
  // Scroll only the source's own containers, never the application viewport.
  element?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
  return captureCardDetailOrigin(element, kind, item.headquarters?.image);
}
