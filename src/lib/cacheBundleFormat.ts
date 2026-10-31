import type { CardDataSnapshot } from './cardData';

export const PACK_MAGIC = 'KARDSPAK';
export const PACK_END_MAGIC = 'KARDSEND';
export const PACK_VERSION = 2;
export const PACK_HEADER_SIZE = 16;
// 8 + 8 + 4 + 4 + 8: the specified fields require 32 bytes, not 28.
export const PACK_FOOTER_SIZE = 32;
export const PACK_MASK_FLAG = 1;
export const DEFAULT_PACK_SALT = 'kards-toolbox-default-open-source-salt';
export const STATIC_PACK_FILE = 'static.kpak';
export const CACHE_BUNDLE_FILE = 'cards.kpak';
export const CACHE_BUNDLE_MARKER = 'full-cache-applied.json';

export type PackImageVariant = 'full' | 'thumb';
export interface CardImageReference { cardId: string; variant: PackImageVariant; url: string }
export interface CardImageMetadata extends CardImageReference { key: string; size: number; mime: string; updatedAt: string }
export interface PackEntry { offset: number; size: number; mime: string; updatedAt: string; crc32: number; meta?: CardImageReference }
export interface PackIndex { version: 2; saltId: string; entries: Record<string, PackEntry>; database?: CardDataSnapshot }
export interface CardPackStats { entries: CardImageMetadata[]; deadBytes: number; fileBytes: number }
export interface CacheBundleInfo { database?: CardDataSnapshot; imageCount: number }
export interface LooseCardImage extends CardImageReference { file: string; mime: string; updatedAt?: string }
export interface LooseCardManifest { version: 2; images: LooseCardImage[]; database?: CardDataSnapshot }

export function cardImageIdentity(ref: CardImageReference) { return JSON.stringify([ref.cardId, ref.variant, new URL(ref.url).href]); }
export function cardPackCacheKey(ref: CardImageReference) { return `kards_card_pack_v2_${encodeURIComponent(ref.cardId)}_${ref.variant}_${encodeURIComponent(ref.url)}`; }
export function readCardPackCacheKey(key: string): CardImageReference | null {
  const match = /^kards_card_pack_v2_(.+)_(full|thumb)_(https%3A%2F%2F.+)$/.exec(key);
  if (!match) return null;
  try { return { cardId: decodeURIComponent(match[1]), variant: match[2] as PackImageVariant, url: decodeURIComponent(match[3]) }; } catch { return null; }
}

// Legacy IndexedDB export/migration only. New desktop caches use binary packs.
export function isBundleImageKey(key: string) {
  return /^kards_card_image_v2_[^_]+_https%3A%2F%2F/.test(key);
}

export function isBundleImageData(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 14 * 1024 * 1024
    && /^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
