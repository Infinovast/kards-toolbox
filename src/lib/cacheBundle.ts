import localforage from 'localforage';
import { readCardDataStorage, writeCardDataStorage } from './cardDatabase';
import { initializeCardImageIndex } from './cardImages';
import { cardPackCacheKey, isBundleImageData } from './cacheBundleFormat';
import { weatherCardFamily } from './weatherCards';
import { cardImageUrl, type KardsCardRecord } from '../types/card';
import { validateCardImageUrl } from './cardImageDownload';

// Full distributions mount a binary pack; image bytes never enter IndexedDB.
export async function applyCacheBundle(progress: (completed: number, total: number) => void) {
  const desktop = window.kardsDesktop;
  if (!desktop?.prepareCacheBundle) return;
  const stored = await readCardDataStorage();
  if (desktop.importLegacyCardImage) {
    // Only existing legacy profiles pay a one-time migration cost. A new full
    // installation has no such keys and performs no per-image IPC imports.
    const failureKey = 'kards_card_image_failures_v1';
    const failures = await localforage.getItem<Record<string, unknown>>(failureKey) || {};
    const legacyKeys = [...new Set([...(await localforage.keys()), ...Object.keys(failures)])].filter(key => /^kards_card_image_v[12]_/.test(key));
    if (legacyKeys.length) {
      const response = await fetch(new URL('./data/cards.json', window.location.href));
      if (!response.ok) throw new Error('读取旧缓存迁移牌库失败');
      const bundled = (await response.json()).cards as KardsCardRecord[];
      const cards = [...bundled, ...(stored.previous?.cards || []), ...(stored.active?.cards || [])];
      const ids = new Map(cards.map(card => [card.importId, card]));
      const stats = await desktop.listCardImageKeys(), cached = new Set(stats.entries.map(entry => JSON.stringify([entry.cardId, entry.variant, entry.url])));
      for (const [index, key] of legacyKeys.entries()) {
        const match = /^kards_card_image_v2_([^_]+)_(.+)$/.exec(key), old = /^kards_card_image_v1_(\d+)_([^_]+)_(.+)$/.exec(key);
        const card = ids.get(match?.[1] || old?.[3]); if (!card) continue;
        let url: string;
        try {
          url = match ? decodeURIComponent(match[2]) : cardImageUrl({ ...card, imageUrl: undefined, thumbUrl: undefined }).replace('/v54/', `/v${old![1]}/`).replace('/zh-Hans/', `/${old![2]}/`);
          validateCardImageUrl(url);
        } catch { continue; }
        const cardId = card.cardId, variant = url.includes('/thumb/') ? 'thumb' as const : 'full' as const;
        const ref = { cardId: variant === 'thumb' ? weatherCardFamily(cardId)?.baseId || cardId : cardId, variant, url };
        if (failures[key]) { failures[cardPackCacheKey(ref)] = failures[key]; delete failures[key]; }
        if (!cached.has(JSON.stringify([ref.cardId, variant, url]))) {
          const data = await localforage.getItem(key);
          if (isBundleImageData(data)) {
            await desktop.importLegacyCardImage(ref, data);
            cached.add(JSON.stringify([ref.cardId, variant, url]));
            await localforage.removeItem(key);
          }
        } else {
          await localforage.removeItem(key);
        }
        progress(index + 1, legacyKeys.length);
      }
      await localforage.setItem(failureKey, failures);
    }
  }
  // Migrate existing artwork first; incoming full packs only fill missing keys.
  const bundle = await desktop.prepareCacheBundle();
  if (bundle?.database && !stored.active) await writeCardDataStorage({ ...stored, active: bundle.database });
  await initializeCardImageIndex(true);
  if (bundle) await desktop.finishCacheBundle();
}
