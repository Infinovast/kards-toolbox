import localforage from 'localforage';
import { useSyncExternalStore } from 'react';
import { cardImageUrl, type CardImageKind, type CardLanguage, type KardsCardRecord } from '../types/card';
import { downloadCardImage } from './cardImageDownload';

const inflight = new Map<string, Promise<string>>();
const FAILURE_KEY = 'kards_card_image_failures_v1';
const BATCH_KEY = 'kards_card_image_batch_v1';
interface ImageFailure { message: string; at: string; attempts?: number }
export interface ImageCacheBatch { importIds: string[]; language: CardLanguage; startedAt: string }
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

async function imageReference(card: KardsCardRecord, language: CardLanguage, kind: CardImageKind) {
  let imageCard = card;
  let resolutionError: unknown;
  if (kind === 'thumbnail' && !card.thumbUrl && !card.imageUrl) {
    try {
      const bundled = (await loadBundledImages()).get(card.cardId);
      if (bundled?.importId === card.importId) imageCard = bundled;
    } catch (error) { resolutionError = error; }
  }
  const url = cardImageUrl(imageCard, language, kind);
  const key = imageCard.imageUrl || imageCard.thumbUrl || kind === 'thumbnail'
    ? `kards_card_image_v2_${card.importId}_${encodeURIComponent(url || `missing-thumbnail:${card.cardId}:${language}:current`)}`
    : `kards_card_image_v1_54_${language}_${card.importId}`;
  return { key, url, resolutionError };
}

export async function getCachedCardImage(card: KardsCardRecord, language: CardLanguage = 'zh-Hans', kind: CardImageKind = 'full'): Promise<string | null> {
  return localforage.getItem<string>((await imageReference(card, language, kind)).key);
}

export async function getCardImageFailureAttempts(card: KardsCardRecord, language: CardLanguage) {
  await loadFailures();
  const references = await Promise.all((['full', 'thumbnail'] as const).map(kind => imageReference(card, language, kind)));
  return Math.max(0, ...references.map(({ key }) => failures[key] ? failures[key].attempts || 1 : 0));
}

async function cacheImageSource(card: KardsCardRecord, language: CardLanguage, kind: CardImageKind): Promise<string> {
  const { key, url, resolutionError } = await imageReference(card, language, kind);
  if (deleting) throw new Error('正在删除缓存，请稍后重试');
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await localforage.getItem<string>(key);
    if (cached) return cached;
    if (resolutionError) throw resolutionError;
    if (!url) throw new Error(kind === 'thumbnail' ? '此卡缺少缩略图地址，请在设置中更新卡牌数据' : '此卡没有可用的卡图路径');
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
export function cacheCardImage(card: KardsCardRecord, language: CardLanguage, kind: CardImageKind = 'full', cacheCompanion = true): Promise<string> {
  const requested = cacheImageSource(card, language, kind);
  if (cacheCompanion) void cacheImageSource(card, language, kind === 'full' ? 'thumbnail' : 'full').catch(() => {});
  return requested;
}

export async function recordImageCacheBatch(cards: KardsCardRecord[], language: CardLanguage) {
  try {
    await localforage.setItem<ImageCacheBatch>(BATCH_KEY, { importIds: cards.map(card => card.importId), language, startedAt: new Date().toISOString() });
  } catch { recordError = '最近一次批量缓存范围未能保存，重启后请在全部牌库中查看缓存结果。'; }
  changed();
}

export interface CardCacheEntry {
  card: KardsCardRecord;
  status: 'cached' | 'missing' | 'failed';
  full: { key: string; status: 'cached' | 'missing' | 'failed' | 'running'; error?: ImageFailure };
  thumbnail: CardCacheEntry['full'];
}

function imageCacheGroup(key: string) {
  if (key.startsWith('kards_card_image_v2_')) {
    const separator = key.indexOf('_', 'kards_card_image_v2_'.length);
    try {
      const source = decodeURIComponent(key.slice(separator + 1));
      if (source.startsWith('missing-thumbnail:')) return { kind: 'thumbnail' as const, language: source.split(':')[2] || '未知语言' };
      const match = new URL(source).pathname.match(/\/card\/(v\d+)\/([^/]+)\/(thumb\/)?/);
      if (match) return { language: match[2], kind: match[3] ? 'thumbnail' as const : 'full' as const };
      return { language: '未知语言', kind: source.includes('/thumb/') ? 'thumbnail' as const : 'full' as const };
    } catch { /* Ignore keys that do not describe a card image. */ }
    return { language: '未知语言', kind: 'full' as const };
  }
  const legacy = key.match(/^kards_card_image_v1_(\d+)_([^_]+)_/);
  return legacy ? { language: legacy[2], kind: 'full' as const } : null;
}

export async function deleteCachedImages(keys: string[]) {
  if (deleting || inflight.size) throw new Error('请等待卡图缓存任务结束后再删除');
  const selected = [...new Set(keys)];
  if (selected.some(key => !/^kards_card_image_v[12]_/.test(key) && !key.startsWith('deck_img_'))) throw new Error('无效的图片缓存项');
  deleting = true;
  try {
    await loadFailures();
    const results = await Promise.allSettled(selected.map(key => localforage.removeItem(key)));
    results.forEach((result, index) => { if (result.status === 'fulfilled') delete failures[selected[index]]; });
    const snapshot = { ...failures };
    recordWrite = recordWrite.catch(() => {}).then(() => localforage.setItem(FAILURE_KEY, snapshot));
    await recordWrite;
    recordError = '';
    if (results.some(result => result.status === 'rejected')) throw new Error('部分缓存未能删除，请刷新清单后重试');
  } finally { deleting = false; changed(); }
}

export async function readCardImageCache(cards: KardsCardRecord[], language: CardLanguage) {
  await loadFailures();
  const [storedKeys, batch, refs, decks] = await Promise.all([
    localforage.keys(), localforage.getItem<ImageCacheBatch>(BATCH_KEY),
    Promise.all(cards.map(async card => ({ card, full: await imageReference(card, language, 'full'), thumbnail: await imageReference(card, language, 'thumbnail') }))),
    localforage.getItem<{ name: string; code: string }[]>('kards_decks'),
  ]);
  const keys = new Set(storedKeys);
  const entries: CardCacheEntry[] = refs.map(({ card, full, thumbnail }) => {
    const status = (key: string): CardCacheEntry['full'] => ({ key, ...(keys.has(key) ? { status: 'cached' as const } : inflight.has(key) ? { status: 'running' as const } : failures[key] ? { status: 'failed' as const, error: failures[key] } : { status: 'missing' as const }) });
    const parts = { full: status(full.key), thumbnail: status(thumbnail.key) };
    return { card, ...parts, status: parts.full.status === 'cached' && parts.thumbnail.status === 'cached' ? 'cached' : parts.full.status === 'failed' || parts.thumbnail.status === 'failed' ? 'failed' : 'missing' };
  });
  const imageKeys: Record<CardImageKind, string[]> = { full: [], thumbnail: [] };
  const groups = new Map<string, { language: string; full: number; thumbnail: number; fullKeys: string[]; thumbnailKeys: string[] }>();
  for (const key of new Set([...storedKeys, ...Object.keys(failures)])) {
    const info = imageCacheGroup(key);
    if (!info) continue;
    const { language, kind } = info;
    imageKeys[kind].push(key);
    const group = groups.get(language) || { language, full: 0, thumbnail: 0, fullKeys: [], thumbnailKeys: [] };
    if (kind === 'thumbnail') { group.thumbnailKeys.push(key); if (keys.has(key)) group.thumbnail++; }
    else { group.fullKeys.push(key); if (keys.has(key)) group.full++; }
    groups.set(language, group);
  }
  const deckImageEntries = storedKeys.filter(key => key.startsWith('deck_img_')).map(key => ({ key, name: decks?.find(deck => key === `deck_img_local_v1_${deck.code}` || key === `deck_img_${deck.code}`)?.name || key.replace(/^deck_img_(local_v1_)?/, '') }));
  return { entries, batch, imageKeys, groups: [...groups.values()].sort((a, b) => a.language.localeCompare(b.language)), deckImages: deckImageEntries.length, deckImageEntries, downloading: inflight.size > 0, recordError };
}
