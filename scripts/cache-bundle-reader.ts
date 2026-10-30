// Build-time browser entry. Use the application's own catalogue/cache semantics
// and return only the active cards and their currently usable artwork.
import localforage from 'localforage';
import { readCardDataStorage } from '../src/lib/cardDatabase';
import { loadCardDatabase } from '../src/types/card';
import { readCardImageCache } from '../src/lib/cardImages';
import { CACHE_BUNDLE_FORMAT, isBundleImageKey, type CacheBundleHeader } from '../src/lib/cacheBundleFormat';

export async function getManifest() {
  const [stored, cards] = await Promise.all([readCardDataStorage(), loadCardDatabase()]);
  const cache = await readCardImageCache(cards);
  const keys = [...new Set(cache.entries.flatMap(entry => [entry.full, entry.thumbnail]
    .filter(image => image.status === 'cached' && isBundleImageKey(image.key)).map(image => image.key)))];
  const database = stored.active;
  const header: CacheBundleHeader = {
    format: CACHE_BUNDLE_FORMAT,
    schemaVersion: 1,
    createdAt: new Date().toISOString(),
    database: {
      cards,
      source: database?.source || 'bundled',
      fetchedAt: database?.fetchedAt || null,
      ...(database?.appliedAt ? { appliedAt: database.appliedAt } : {}),
    },
  };
  return {
    header, keys,
    full: cache.cachedFull,
    thumbnail: cache.cachedThumbnail,
  };
}

export const readImage = (key: string) => localforage.getItem<string>(key);
