import type { KardsCardRecord } from '../types/card';
import bundledWeatherCards from '../data/weatherCards.json';

export const CARD_DATA_URL = 'https://api.kardsplayer.com/graphql';
export const KARDS_COM_DATA_URL = 'https://herokuapi.kards.com/graphql';
export const CARD_DATA_PAGE_SIZE = 100;
export type CardDataSource = 'kardsplayer' | 'kardscom';
// Image URLs are metadata; fetching the catalogue never downloads image files.
export const CARD_DATA_QUERY = `query getCards($language: String, $offset: Int, $first: Int, $showSpawnables: Boolean, $showExiles: Boolean, $showReserved: Boolean) {
  cards(language: $language, first: $first, offset: $offset, showSpawnables: $showSpawnables, showExiles: $showExiles, showReserved: $showReserved) {
    pageInfo { count hasNextPage }
    edges { node { id cardId importId json reserved imageUrl: image(language: $language) thumbUrl: image(type: thumb, language: $language) } }
  }
}`;

export const KARDS_COM_DATA_QUERY = `query getCards($language: String, $offset: Int, $first: Int, $showSpawnables: Boolean, $showExiles: Boolean, $showReserved: Boolean) {
  cards(language: $language, first: $first, offset: $offset, showSpawnables: $showSpawnables, showExiles: $showExiles, showReserved: $showReserved) {
    pageInfo { count hasNextPage }
    edges { node { id cardId importId json reserved imageUrl: image(language: $language) thumbUrl: image(type: thumb, language: $language) } }
  }
}`;

export interface CardDataPage { cards: KardsCardRecord[]; total: number; hasNextPage: boolean }
export interface CardDataSnapshot {
  cards: KardsCardRecord[];
  source: 'bundled' | 'official' | CardDataSource;
  fetchedAt: string | null;
  appliedAt?: string;
}
export interface CardDataStorage {
  schemaVersion: 1;
  active?: CardDataSnapshot;
  previous?: CardDataSnapshot;
  pending?: CardDataSnapshot;
  lastCheckedAt?: string;
}
export interface CardFieldChange { field: string; before: unknown; after: unknown }
export interface CardDataChange {
  importId: string;
  kind: 'added' | 'changed' | 'removed';
  before?: KardsCardRecord;
  after?: KardsCardRecord;
  fields: CardFieldChange[];
}

export function normalizeCardRecord(value: unknown, source: CardDataSource = 'kardsplayer'): KardsCardRecord {
  const card = value as KardsCardRecord;
  if (!card || (typeof card.id !== 'number' && typeof card.id !== 'string') || !String(card.id)
    || typeof card.cardId !== 'string' || !card.cardId
    || typeof card.importId !== 'string' || !card.importId || !card.json || Array.isArray(card.json) || typeof card.json !== 'object') {
    throw new Error('卡牌数据格式无效，已停止更新');
  }
  const json = { ...card.json };
  for (const field of ['title', 'text', 'description'] as const) {
    const content = json[field];
    if (content !== undefined && (!content || typeof content !== 'object' || Array.isArray(content) || Object.values(content).some(text => typeof text !== 'string'))) {
      throw new Error(`卡牌 ${card.importId} 的多语言资料无效`);
    }
  }
  for (const field of ['kredits', 'attack', 'defense', 'operationCost']) {
    if (json[field] !== undefined && (typeof json[field] !== 'number' || !Number.isFinite(json[field]))) throw new Error(`卡牌 ${card.importId} 的数值无效`);
  }
  for (const field of ['id', 'import_id', 'faction', 'type', 'rarity', 'set', 'image']) {
    if (json[field] !== undefined && typeof json[field] !== 'string') throw new Error(`卡牌 ${card.importId} 的 ${field} 字段无效`);
  }
  if (json.attributes !== undefined && (!Array.isArray(json.attributes) || json.attributes.some(value => typeof value !== 'string'))) throw new Error(`卡牌 ${card.importId} 的词条无效`);
  if (json.can_create !== undefined && (!Array.isArray(json.can_create) || json.can_create.some(value => typeof value !== 'string'))) throw new Error(`卡牌 ${card.importId} 的衍生卡关联无效`);
  const reserved = card.reserved ?? json.reserved ?? false;
  if (typeof reserved !== 'boolean') throw new Error(`卡牌 ${card.importId} 的预备状态无效`);
  // The official API duplicates this flag inside json; our bundled snapshot does not.
  delete json.reserved;
  const images: Partial<Pick<KardsCardRecord, 'imageUrl' | 'thumbUrl'>> = {};
  for (const field of ['imageUrl', 'thumbUrl'] as const) {
    if (card[field] === undefined) continue; // Existing offline snapshots remain readable.
    if (typeof card[field] !== 'string' || !card[field]) throw new Error(`卡牌 ${card.importId} 的卡图地址无效`);
    const url = new URL(card[field], source === 'kardscom' ? 'https://www.kards.com' : 'https://www.kardsplayer.com');
    const catalogueImage = ['https://www.kardsplayer.com', 'https://www.kards.com'].includes(url.origin)
      && /^\/images\/card\/v\d+\/[\w-]+\/(thumb\/)?[\w.-]+\.(avif|png|webp)$/.test(url.pathname);
    const weatherImage = url.origin === 'https://kards-assets.kardsdecker.com'
      && /^\/CardImgs\/temporary_weathers\/(?:[\w.-]|%[\da-f]{2})+\.png$/i.test(url.pathname);
    if ((!catalogueImage && !weatherImage) || url.search || url.hash || url.username || url.password) throw new Error(`卡牌 ${card.importId} 的卡图地址无效`);
    images[field] = url.href;
  }
  const recordId = Number(card.id);
  return { id: Number.isInteger(recordId) ? recordId : 0, cardId: card.cardId, importId: card.importId, reserved, ...images, json };
}

export function validateCardRecords(values: unknown, source: CardDataSource = 'kardsplayer'): KardsCardRecord[] {
  if (!Array.isArray(values) || !values.length) throw new Error('牌库为空或格式无效，已保留当前数据');
  const seen = new Set<string>();
  const seenCardIds = new Set<string>();
  return values.map(value => {
    const card = normalizeCardRecord(value, source);
    if (seen.has(card.importId) || seenCardIds.has(card.cardId)) throw new Error(`牌库存在重复卡牌 ${card.importId}，请重新获取`);
    seen.add(card.importId);
    seenCardIds.add(card.cardId);
    return card;
  });
}

const weatherSupplement = validateCardRecords(bundledWeatherCards as unknown);

export function mergeWeatherCardRecords(values: unknown, source: CardDataSource = 'kardsplayer'): KardsCardRecord[] {
  const weatherIds = new Set(weatherSupplement.map(card => card.cardId));
  const records = validateCardRecords(values, source).filter(card => !weatherIds.has(card.cardId));
  const merged = new Map(records.map(card => [card.cardId, card]));
  const usedImportIds = new Set(records.map(card => card.importId));
  const alphabet = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const allocateImportId = () => {
    for (const first of alphabet) for (const second of alphabet) {
      const candidate = first + second;
      if (!usedImportIds.has(candidate)) return candidate;
    }
    throw new Error('没有可分配给本地天气卡的卡组码编号');
  };

  for (const card of weatherSupplement) {
    const importId = usedImportIds.has(card.importId) ? allocateImportId() : card.importId;
    usedImportIds.add(importId);
    merged.set(card.cardId, importId === card.importId ? card : {
      ...card,
      importId,
      json: { ...card.json, import_id: importId },
    });
  }
  return validateCardRecords([...merged.values()], source);
}

export function parseCardDataPage(payload: unknown, source: CardDataSource = 'kardsplayer'): CardDataPage {
  const response = payload as { errors?: { message?: string }[]; data?: { cards?: { pageInfo?: { count?: number; hasNextPage?: boolean }; edges?: { node?: unknown }[] } } };
  const sourceName = source === 'kardscom' ? 'KARDS 官方' : 'Kardsplayer';
  if (response?.errors?.length) throw new Error(`${sourceName} 接口返回错误：${response.errors.map(error => error.message || '未知错误').join('；')}`);
  const page = response?.data?.cards;
  if (!page || !Number.isInteger(page.pageInfo?.count) || page.pageInfo.count < 1 || page.pageInfo.count > 100000
    || typeof page.pageInfo.hasNextPage !== 'boolean' || !Array.isArray(page.edges) || !page.edges.length || page.edges.length > CARD_DATA_PAGE_SIZE) {
    throw new Error(`${sourceName} 接口分页数据不完整，请重试；当前牌库未改变`);
  }
  const cards = validateCardRecords(page.edges.map(edge => edge.node), source);
  for (const card of cards) {
    if (!card.imageUrl || !card.thumbUrl || !card.json.title?.['zh-Hans'] || card.json.kredits === undefined) throw new Error(`卡牌 ${card.cardId} 缺少名称、费用或图片地址，已停止更新`);
    if (['infantry', 'tank', 'artillery', 'fighter', 'bomber'].includes(card.json.type)) {
      if (['operationCost', 'attack', 'defense'].some(field => card.json[field] === undefined)) throw new Error(`单位卡 ${card.cardId} 缺少行动费用或攻防数值，已停止更新`);
    }
  }
  return { cards, total: page.pageInfo.count, hasNextPage: page.pageInfo.hasNextPage };
}

export async function fetchKardsplayerCardPage(offset: number, fetcher: typeof fetch = fetch): Promise<CardDataPage> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error('分页参数无效');
  const response = await fetcher(CARD_DATA_URL, {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ operationName: 'getCards', query: CARD_DATA_QUERY, variables: {
      language: 'zh', first: CARD_DATA_PAGE_SIZE, offset, showSpawnables: true, showExiles: false, showReserved: true,
    } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`获取 Kardsplayer 卡牌数据失败（HTTP ${response.status}）`);
  return parseCardDataPage(await response.json());
}

export async function fetchKardsComCardPage(offset: number, fetcher: typeof fetch = fetch): Promise<CardDataPage> {
  if (!Number.isInteger(offset) || offset < 0 || offset > 100000) throw new Error('分页参数无效');
  const response = await fetcher(KARDS_COM_DATA_URL, {
    method: 'POST',
    headers: {
      accept: '*/*',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'cache-control': 'no-cache',
      'content-type': 'application/json',
      origin: 'https://www.kards.com',
      pragma: 'no-cache',
      referer: 'https://www.kards.com/',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/144.0.0.0 Safari/537.36',
    },
    body: JSON.stringify({ operationName: 'getCards', query: KARDS_COM_DATA_QUERY, variables: {
      language: 'zh', first: CARD_DATA_PAGE_SIZE, offset, showSpawnables: true, showExiles: true, showReserved: true,
    } }),
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error(`获取 KARDS 官方卡牌数据失败（HTTP ${response.status}）`);
  return parseCardDataPage(await response.json(), 'kardscom');
}

export function fetchCardDataPage(offset: number, source: CardDataSource = 'kardsplayer', fetcher: typeof fetch = fetch): Promise<CardDataPage> {
  return source === 'kardscom' ? fetchKardsComCardPage(offset, fetcher) : fetchKardsplayerCardPage(offset, fetcher);
}

function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

function fieldChanges(before: unknown, after: unknown, prefix = ''): CardFieldChange[] {
  if (stable(before) === stable(after)) return [];
  if ((before === undefined || (before && typeof before === 'object' && !Array.isArray(before)))
    && (after === undefined || (after && typeof after === 'object' && !Array.isArray(after)))) {
    const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])].sort();
    return keys.flatMap(key => fieldChanges(before?.[key], after?.[key], prefix ? `${prefix}.${key}` : key));
  }
  return [{ field: prefix, before, after }];
}

export function compareCardData(local: KardsCardRecord[], remote: KardsCardRecord[]): CardDataChange[] {
  const oldCards = new Map(local.map(card => [card.importId, normalizeCardRecord(card)]));
  const newCards = new Map(validateCardRecords(remote).map(card => [card.importId, card]));
  const changes: CardDataChange[] = [];
  for (const [importId, after] of newCards) {
    const before = oldCards.get(importId);
    // Numeric API record IDs are transport metadata, not gameplay changes.
    const fields = fieldChanges(before && comparableCard(before), comparableCard(after));
    if (!before || fields.length) changes.push({ importId, kind: before ? 'changed' : 'added', before, after, fields });
  }
  for (const [importId, before] of oldCards) {
    if (!newCards.has(importId)) changes.push({ importId, kind: 'removed', before, fields: fieldChanges(comparableCard(before), undefined) });
  }
  return changes;
}

function comparableCard(card: KardsCardRecord) {
  return { ...card.json, cardId: card.cardId, reserved: card.reserved, ...(card.imageUrl ? { imageUrl: card.imageUrl } : {}), ...(card.thumbUrl ? { thumbUrl: card.thumbUrl } : {}) };
}

export async function collectCardData(fetchPage: (offset: number) => Promise<CardDataPage>, progress: (completed: number, total: number) => void, signal: AbortSignal, gapMs = 1000): Promise<KardsCardRecord[]> {
  const cards: KardsCardRecord[] = [];
  let total = 0;
  while (true) {
    signal.throwIfAborted();
    const page = await new Promise<CardDataPage>((resolve, reject) => {
      const aborted = () => reject(new DOMException('已取消获取', 'AbortError'));
      signal.addEventListener('abort', aborted, { once: true });
      fetchPage(cards.length).then(resolve, reject).finally(() => signal.removeEventListener('abort', aborted));
    });
    signal.throwIfAborted();
    if (!page.cards.length || !Number.isInteger(page.total) || page.total < 1) throw new Error('卡牌数据分页无效，已停止更新');
    if (total && total !== page.total) throw new Error('卡牌数据在获取过程中发生变化，请重新获取');
    total = page.total;
    cards.push(...page.cards);
    if (cards.length > total || (page.hasNextPage && cards.length >= total)) throw new Error('卡牌数据分页计数不一致，已停止更新');
    progress(cards.length, total);
    signal.throwIfAborted();
    if (!page.hasNextPage) {
      if (cards.length !== total) throw new Error(`只获取到 ${cards.length}/${total} 张卡牌数据，已保留当前数据，请重试`);
      return validateCardRecords(cards);
    }
    await new Promise<void>((resolve, reject) => {
      const aborted = () => { clearTimeout(timer); reject(new DOMException('已取消获取', 'AbortError')); };
      const timer = setTimeout(() => { signal.removeEventListener('abort', aborted); resolve(); }, gapMs);
      signal.addEventListener('abort', aborted, { once: true });
    });
  }
}
