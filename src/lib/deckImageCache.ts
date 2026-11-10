import localforage from 'localforage';
import { decodeDeckCode } from './deckCode';

export type DeckImageKind = 'full' | 'mini';
const PREFIXES = { full: 'deck_img_local_v1_', mini: 'deck_img_mini_v1_' };

export async function saveDeckImage(code: string, image: string, kind: DeckImageKind = 'full') {
  // A new full image may have a different title, headquarters or background.
  if (kind === 'full') await localforage.removeItem(`${PREFIXES.mini}${code}`);
  return localforage.setItem(`${PREFIXES[kind]}${code}`, image);
}

export async function readDeckImage(code: string, kind: DeckImageKind = 'full'): Promise<string | null> {
  const image = await localforage.getItem<unknown>(`${PREFIXES[kind]}${code}`);
  return typeof image === 'string' && image.startsWith('data:image/png;base64,') ? image : null;
}

/** Discover existing full-image caches without loading every PNG into memory. */
export async function listDeckImageCodes(): Promise<string[]> {
  const keys = await localforage.keys();
  return keys.filter(key => key.startsWith(PREFIXES.full)).flatMap(key => {
    const code = key.slice(PREFIXES.full.length);
    try {
      const deck = decodeDeckCode(code);
      const count = [...deck.counts.values()].reduce((sum, value) => sum + value, 0);
      return count > 0 && count <= 999 ? [code] : [];
    } catch { return []; }
  });
}
