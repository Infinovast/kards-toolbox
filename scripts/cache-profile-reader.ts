// Read-only browser entry used by the disposable legacy IndexedDB exporter.
import localforage from 'localforage';
import { readCardDataStorage } from '../src/lib/cardDatabase';
import { cardImageUrl, loadCardDatabase } from '../src/types/card';
import { readCardImageCache } from '../src/lib/cardImages';
import { isBundleImageKey } from '../src/lib/cacheBundleFormat';
import { weatherCardFamily } from '../src/lib/weatherCards';
import { mergeWeatherCardRecords, validateCardRecords, type CardDataSnapshot } from '../src/lib/cardData';
export async function getManifest(fallback?: CardDataSnapshot) {
  const stored = await readCardDataStorage();
  const snapshot = stored.active || fallback;
  const cards = snapshot ? mergeWeatherCardRecords(validateCardRecords(snapshot.cards)) : await loadCardDatabase();
  const cache = await readCardImageCache(cards);
  const images = new Map<string, { key: string; cardId: string; variant: 'full' | 'thumb'; url: string }>();
  for (const entry of cache.entries) for (const variant of ['full', 'thumb'] as const) {
    const image = variant === 'full' ? entry.full : entry.thumbnail;
    if (image.status !== 'cached' || !isBundleImageKey(image.key)) continue;
    const match = /^kards_card_image_v2_[^_]+_(.+)$/.exec(image.key)!;
    images.set(image.key, { key: image.key, cardId: variant === 'thumb' ? weatherCardFamily(entry.card.cardId)?.baseId || entry.card.cardId : entry.card.cardId, variant, url: decodeURIComponent(match[1]) });
  }
  const references = [...new Map(cards.flatMap(card => (['full', 'thumb'] as const).map(variant => {
    const ref = { cardId: variant === 'thumb' ? weatherCardFamily(card.cardId)?.baseId || card.cardId : card.cardId, variant, url: cardImageUrl(card, variant === 'thumb' ? 'thumbnail' : 'full') };
    return [JSON.stringify(ref), ref] as const;
  }))).values()].filter(ref => ref.url);
  return { database: { cards, source: snapshot?.source || 'bundled', fetchedAt: snapshot?.fetchedAt || null }, images: [...images.values()], references, full: cache.cachedFull, thumbnail: cache.cachedThumbnail };
}
export const readImage = (key: string) => localforage.getItem<string>(key);
