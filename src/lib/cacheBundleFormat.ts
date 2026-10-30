import type { CardDataSnapshot } from './cardData';

export const CACHE_BUNDLE_FILE = 'kards-toolbox-cache.br';
export const CACHE_BUNDLE_FORMAT = 'kards-toolbox-cache';
export const CACHE_BUNDLE_MARKER = 'full-cache-applied.json';

export interface CacheBundleHeader {
  format: typeof CACHE_BUNDLE_FORMAT;
  schemaVersion: 1;
  createdAt: string;
  database: CardDataSnapshot;
}

export interface CacheBundleInfo {
  database: CardDataSnapshot;
  imageCount: number;
}

// Only ordinary card artwork is distributable; no user images or cache history.
export function isBundleImageKey(key: string) {
  return /^kards_card_image_v2_[^_]+_https%3A%2F%2F/.test(key);
}

export function isBundleImageData(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 14 * 1024 * 1024
    && /^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/]+={0,2}$/.test(value);
}
