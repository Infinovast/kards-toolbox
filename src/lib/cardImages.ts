import localforage from 'localforage';
import { cardImageUrl, type CardImageKind, type CardImageVersion, type CardLanguage, type KardsCardRecord } from '../types/card';
import { downloadCardImage } from './cardImageDownload';

const inflight = new Map<string, Promise<string>>();
const keyFor = (card: KardsCardRecord, language: CardLanguage, version: CardImageVersion, kind: CardImageKind) => card.imageUrl || (kind === 'thumbnail' && card.thumbUrl)
  ? `kards_card_image_v2_${card.importId}_${encodeURIComponent(cardImageUrl(card, language, version === 'current' ? version : `v${version}`, kind))}`
  : `kards_card_image_v1_${version === 'current' ? 54 : version}_${language}_${card.importId}`;

export async function getCachedCardImage(card: KardsCardRecord, language: CardLanguage = 'zh-Hans', version: CardImageVersion = 'current', kind: CardImageKind = 'full'): Promise<string | null> {
  return localforage.getItem<string>(keyFor(card, language, version, kind));
}

function cacheImageSource(card: KardsCardRecord, language: CardLanguage, version: CardImageVersion, kind: CardImageKind): Promise<string> {
  const key = keyFor(card, language, version, kind);
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await getCachedCardImage(card, language, version, kind);
    if (cached) return cached;
    const url = cardImageUrl(card, language, version === 'current' ? version : `v${version}`, kind);
    if (!url) throw new Error('此卡没有可用的卡图路径');
    // The desktop downloads the original URL outside renderer CORS. Keep the
    // existing public image proxy only for the browser development preview.
    const data = window.kardsDesktop?.fetchCardImage
      ? await window.kardsDesktop.fetchCardImage(url)
      : await downloadCardImage(url, (source, options) => fetch(`https://images.weserv.nl/?url=${encodeURIComponent(String(source))}&q=85`, options));
    await localforage.setItem(key, data);
    return data;
  })();
  inflight.set(key, job);
  void job.finally(() => inflight.delete(key)).catch(() => {});
  return job;
}

// Viewing either image also fills its companion cache. A failed thumbnail must
// not hide a usable full card (and vice versa); the bulk queue awaits both.
export function cacheCardImage(card: KardsCardRecord, language: CardLanguage, version: CardImageVersion = 'current', kind: CardImageKind = 'full'): Promise<string> {
  const requested = cacheImageSource(card, language, version, kind);
  void cacheImageSource(card, language, version, kind === 'full' ? 'thumbnail' : 'full').catch(() => {});
  return requested;
}
