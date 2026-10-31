import localforage from 'localforage';
import { useSyncExternalStore } from 'react';
import { cardImageUrl, type CardImageKind, type KardsCardRecord } from '../types/card';
import { downloadCardImage } from './cardImageDownload';
import { weatherCardFamily } from './weatherCards';
import { cardPackCacheKey, readCardPackCacheKey, type CardImageMetadata, type CardImageReference } from './cacheBundleFormat';

const desktopPack = () => typeof window !== 'undefined' && !!window.kardsDesktop?.listCardImageKeys;
const packIndex = new Map<string, CardImageMetadata>();
let indexLoaded: Promise<void> | undefined;
let indexRequest = 0;
let packDeadBytes = 0, packFileBytes = 0;
export async function initializeCardImageIndex(refresh = false) {
  if (!desktopPack()) return;
  if (refresh) indexLoaded = undefined;
  if (!indexLoaded) {
    const request = ++indexRequest, before = new Map(packIndex);
    indexLoaded = window.kardsDesktop!.listCardImageKeys().then(stats => {
      if (request !== indexRequest) return;
      // Preserve downloads/deletions that completed while IPC was in flight.
      const next = new Map(stats.entries.map(entry => [entry.key, entry]));
      for (const [key, entry] of packIndex) if (entry !== before.get(key)) next.set(key, entry);
      for (const key of before.keys()) if (!packIndex.has(key)) next.delete(key);
      packIndex.clear(); next.forEach((entry, key) => packIndex.set(key, entry));
      packDeadBytes = stats.deadBytes; packFileBytes = stats.fileBytes;
    }).catch(error => { if (request === indexRequest) indexLoaded = undefined; throw error; });
  }
  return indexLoaded;
}
const protocolImageUrl = (ref: CardImageReference, stamp: string) => `kards://app/card-image?${new URLSearchParams({ ...ref, v: stamp })}`;
export function cachedImageByteLength(value: string) {
  if (value.startsWith('kards://')) {
    const url = new URL(value), ref = { cardId: url.searchParams.get('cardId')!, variant: url.searchParams.get('variant') as 'full' | 'thumb', url: url.searchParams.get('url')! };
    return packIndex.get(cardPackCacheKey(ref))?.size || 0;
  }
  return Math.floor((value.length - value.indexOf(',') - 1) * 0.75);
}

const inflight = new Map<string, Promise<string>>();
const FAILURE_KEY = 'kards_card_image_failures_v1';
const BATCH_KEY = 'kards_card_image_batch_v1';
interface ImageFailure { message: string; at: string; attempts?: number }
export interface ImageCacheBatch { importIds: string[]; startedAt: string }
let failures: Record<string, ImageFailure> = {};
let failuresLoaded: Promise<void> | undefined;
let recordWrite: Promise<unknown> = Promise.resolve();
let recordError = '';
let deleting = false;
const listeners = new Set<() => void>();
let revision = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
function changed() {
  if (timer) return;
  timer = setTimeout(() => { timer = undefined; revision++; listeners.forEach(listener => listener()); }, 150);
}
export const useCardImageCacheRevision = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => revision);
const loadFailures = () => failuresLoaded ||= localforage.getItem<Record<string, ImageFailure>>(FAILURE_KEY).then(value => { failures = value || {}; }).catch(error => { failuresLoaded = undefined; throw error; });
async function recordResult(key: string, error?: unknown) {
  try {
    await loadFailures();
    if (error) failures[key] = { message: error instanceof Error ? error.message : String(error), at: new Date().toISOString(), attempts: (failures[key]?.attempts || 0) + 1 };
    else if (failures[key]) delete failures[key];
    else { changed(); return; }
    const snapshot = { ...failures };
    recordWrite = recordWrite.catch(() => {}).then(() => localforage.setItem(FAILURE_KEY, snapshot));
    await recordWrite;
    recordError = '';
  } catch { recordError = '缓存结果记录未能保存，重启后可能无法查看本次失败原因。请刷新后重试。'; }
  changed();
}

let bundledImages: Promise<Map<string, KardsCardRecord>> | undefined;
function loadBundledImages() {
  return bundledImages ||= fetch(new URL('./data/cards.json', window.location.href)).then(async response => {
    if (!response.ok) throw new Error('读取随包缩略图资料失败');
    const data = await response.json() as { cards: KardsCardRecord[] };
    return new Map(data.cards.map(card => [card.cardId, card]));
  }).catch(error => { bundledImages = undefined; throw error; });
}

async function imageReference(card: KardsCardRecord, kind: CardImageKind) {
  let imageCard = card;
  let resolutionError: unknown;
  if (kind === 'thumbnail' && !card.thumbUrl && !card.imageUrl) {
    try {
      const bundled = (await loadBundledImages()).get(card.cardId);
      if (bundled?.importId === card.importId) imageCard = bundled;
    } catch (error) { resolutionError = error; }
  }
  const url = cardImageUrl(imageCard, kind);
  // Weather forms share the base thumbnail file and download, while keeping
  // their own full artwork. Use a stable family ID even after local ID allocation.
  const importId = kind === 'thumbnail' ? weatherCardFamily(card.cardId)?.thumbnailImportId || card.importId : card.importId;
  const key = imageCard.imageUrl || imageCard.thumbUrl || kind === 'thumbnail'
    ? `kards_card_image_v2_${importId}_${encodeURIComponent(url || `missing-thumbnail:${card.cardId}:zh-Hans:current`)}`
    : `kards_card_image_v1_54_zh-Hans_${card.importId}`;
  const ref: CardImageReference = { cardId: kind === 'thumbnail' ? weatherCardFamily(card.cardId)?.baseId || card.cardId : card.cardId, variant: kind === 'thumbnail' ? 'thumb' : 'full', url };
  return { key: desktopPack() && url ? cardPackCacheKey(ref) : key, url, resolutionError, ref };
}

export async function getCachedCardImage(card: KardsCardRecord, kind: CardImageKind = 'full'): Promise<string | null> {
  const { key, ref } = await imageReference(card, kind);
  if (desktopPack()) { await initializeCardImageIndex(); const image = packIndex.get(key); return image ? protocolImageUrl(ref, image.updatedAt) : null; }
  return localforage.getItem<string>(key);
}

export async function getCardImageFailureAttempts(card: KardsCardRecord) {
  await loadFailures();
  const references = await Promise.all((['full', 'thumbnail'] as const).map(kind => imageReference(card, kind)));
  return Math.max(0, ...references.map(({ key }) => failures[key] ? failures[key].attempts || 1 : 0));
}

async function cacheImageSource(card: KardsCardRecord, kind: CardImageKind): Promise<string> {
  const { key, url, resolutionError, ref } = await imageReference(card, kind);
  if (deleting) throw new Error('正在删除缓存，请稍后重试');
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await getCachedCardImage(card, kind);
    if (cached) return cached;
    if (resolutionError) throw resolutionError;
    if (!url) throw new Error(kind === 'thumbnail' ? '此卡缺少缩略图地址，请在设置中更新卡牌数据' : '此卡没有可用的卡图路径');
    if (desktopPack()) {
      const image = await window.kardsDesktop!.cacheCardImage(ref);
      packIndex.set(key, image); await recordResult(key);
      return protocolImageUrl(ref, image.updatedAt);
    }
    // The desktop downloads the original URL outside renderer CORS. Keep the
    // existing public image proxy only for the browser development preview.
    const data = window.kardsDesktop?.fetchCardImage
      ? await window.kardsDesktop.fetchCardImage(url)
      : await downloadCardImage(url, (source, options) => fetch(`https://images.weserv.nl/?url=${encodeURIComponent(String(source))}&q=85`, options));
    await localforage.setItem(key, data);
    await recordResult(key);
    return data;
  })().catch(async error => { await recordResult(key, error); throw error; });
  inflight.set(key, job);
  changed();
  void job.finally(() => { inflight.delete(key); changed(); }).catch(() => {});
  return job;
}

// Viewing either image also fills its companion cache. A failed thumbnail must
// not hide a usable full card (and vice versa); the bulk queue awaits both.
export function cacheCardImage(card: KardsCardRecord, kind: CardImageKind = 'full', cacheCompanion = true): Promise<string> {
  const requested = cacheImageSource(card, kind);
  if (cacheCompanion) void cacheImageSource(card, kind === 'full' ? 'thumbnail' : 'full').catch(() => {});
  return requested;
}

export async function recordImageCacheBatch(cards: KardsCardRecord[]) {
  try {
    await localforage.setItem<ImageCacheBatch>(BATCH_KEY, { importIds: cards.map(card => card.importId), startedAt: new Date().toISOString() });
  } catch { recordError = '最近一次批量缓存范围未能保存，重启后请在全部牌库中查看缓存结果。'; }
  changed();
}

export interface CardCacheEntry {
  card: KardsCardRecord;
  status: 'cached' | 'missing' | 'failed';
  full: { key: string; status: 'cached' | 'missing' | 'failed' | 'running'; error?: ImageFailure };
  thumbnail: CardCacheEntry['full'];
}

function imageCacheKind(key: string): CardImageKind | null {
  const ref = readCardPackCacheKey(key); if (ref) return ref.variant === 'thumb' ? 'thumbnail' : 'full';
  if (key.startsWith('kards_card_image_v2_')) {
    return key.includes('%2Fthumb%2F') || key.includes('missing-thumbnail') ? 'thumbnail' : 'full';
  }
  return /^kards_card_image_v1_\d+_[^_]+_/.test(key) ? 'full' : null;
}

export async function deleteCachedImages(keys: string[]) {
  if (deleting || inflight.size) throw new Error('请等待卡图缓存任务结束后再删除');
  const selected = [...new Set(keys)];
  if (selected.some(key => !readCardPackCacheKey(key) && !/^kards_card_image_v[12]_/.test(key) && !key.startsWith('deck_img_'))) throw new Error('无效的图片缓存项');
  deleting = true;
  try {
    await loadFailures();
    if (desktopPack()) {
      const refs = selected.map(readCardPackCacheKey).filter((ref): ref is CardImageReference => !!ref);
      if (refs.length) await window.kardsDesktop!.deleteCardImages(refs);
      refs.forEach(ref => packIndex.delete(cardPackCacheKey(ref)));
      await initializeCardImageIndex(true);
    }
    const results = await Promise.allSettled(selected.map(key => localforage.removeItem(key)));
    results.forEach((result, index) => { if (result.status === 'fulfilled') delete failures[selected[index]]; });
    const snapshot = { ...failures };
    recordWrite = recordWrite.catch(() => {}).then(() => localforage.setItem(FAILURE_KEY, snapshot));
    await recordWrite;
    recordError = '';
    if (results.some(result => result.status === 'rejected')) throw new Error('部分缓存未能删除，请刷新清单后重试');
  } finally { deleting = false; changed(); }
}

export async function readCardImageCache(cards: KardsCardRecord[]) {
  await Promise.all([loadFailures(), initializeCardImageIndex(true)]);
  const [storedKeys, batch, refs, decks] = await Promise.all([
    localforage.keys(), localforage.getItem<ImageCacheBatch>(BATCH_KEY),
    Promise.all(cards.map(async card => ({ card, full: await imageReference(card, 'full'), thumbnail: await imageReference(card, 'thumbnail') }))),
    localforage.getItem<{ name: string; code: string }[]>('kards_decks'),
  ]);
  const allStoredKeys = desktopPack() ? [...storedKeys.filter(key => !/^kards_card_image_v[12]_/.test(key)), ...packIndex.keys()] : storedKeys;
  const keys = new Set(allStoredKeys);
  const entries: CardCacheEntry[] = refs.map(({ card, full, thumbnail }) => {
    const status = (key: string): CardCacheEntry['full'] => ({ key, ...(keys.has(key) ? { status: 'cached' as const } : inflight.has(key) ? { status: 'running' as const } : failures[key] ? { status: 'failed' as const, error: failures[key] } : { status: 'missing' as const }) });
    const parts = { full: status(full.key), thumbnail: status(thumbnail.key) };
    return { card, ...parts, status: parts.full.status === 'cached' && parts.thumbnail.status === 'cached' ? 'cached' : parts.full.status === 'failed' || parts.thumbnail.status === 'failed' ? 'failed' : 'missing' };
  });
  const imageKeys: Record<CardImageKind, string[]> = { full: [], thumbnail: [] };
  for (const key of new Set([...allStoredKeys, ...Object.keys(failures)])) {
    const kind = imageCacheKind(key);
    if (!kind) continue;
    imageKeys[kind].push(key);
  }
  const currentKeys = new Set(refs.flatMap(ref => [ref.full.key, ref.thumbnail.key]));
  const unusedImageKeys = [...imageKeys.full, ...imageKeys.thumbnail].filter(key => !currentKeys.has(key));
  const cachedCards = (kind: CardImageKind) => new Set(entries.filter(entry => entry[kind].status === 'cached').map(entry => entry.card.importId)).size;
  const deckImageEntries = storedKeys.filter(key => key.startsWith('deck_img_')).map(key => ({ key, name: decks?.find(deck => key === `deck_img_local_v1_${deck.code}` || key === `deck_img_${deck.code}`)?.name || key.replace(/^deck_img_(local_v1_)?/, '') }));
  return { entries, batch, imageKeys, unusedImageKeys, cachedFull: cachedCards('full'), cachedThumbnail: cachedCards('thumbnail'), deckImages: deckImageEntries.length, deckImageEntries, downloading: inflight.size > 0, recordError, packDeadBytes, packFileBytes };
}

export async function compactCardImageCache() {
  if (deleting || inflight.size) throw new Error('请等待卡图缓存任务结束后再整理');
  if (desktopPack()) { await window.kardsDesktop!.compactCardPack(); await initializeCardImageIndex(true); changed(); }
}
