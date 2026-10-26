import { useSyncExternalStore } from 'react';
import localforage from 'localforage';
import { collectCardData, fetchCardDataPage, validateCardRecords, type CardDataSource, type CardDataStorage } from './cardData';
import { CARD_DATABASE_KEY, readCardDataStorage, writeCardDataStorage } from './cardDatabase';
import type { KardsCardRecord } from '../types/card';

interface CardSyncState {
  status: 'idle' | 'fetching' | 'ready' | 'applying' | 'applied' | 'error';
  stored: CardDataStorage;
  completed: number;
  total: number;
  error: string | null;
  message: string;
}
let state: CardSyncState = { status: 'idle', stored: { schemaVersion: 1 }, completed: 0, total: 0, error: null, message: '' };
const listeners = new Set<() => void>();
const publish = (patch: Partial<CardSyncState>) => { state = { ...state, ...patch }; listeners.forEach(listener => listener()); };
export const useCardDataSync = () => useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => state);
let initialized: Promise<void> | undefined;
let controller: AbortController | undefined;

export function initializeCardDataSync() {
  return initialized ||= readCardDataStorage().then(stored => publish({ stored, status: stored.pending ? 'ready' : 'idle' }))
    .catch(error => { publish({ status: 'error', error: String(error) }); initialized = undefined; });
}

export async function checkCardData(source: CardDataSource = 'kardsplayer') {
  await initializeCardDataSync();
  if (state.status === 'fetching' || state.status === 'applying') return;
  controller = new AbortController();
  const signal = controller.signal;
  publish({ status: 'fetching', completed: 0, total: 0, error: null, message: '' });
  try {
    const stored = { ...await readCardDataStorage(), pending: undefined };
    await writeCardDataStorage(stored);
    publish({ stored });
    const cards = await collectCardData(offset => window.kardsDesktop?.fetchCardDataPage
      ? window.kardsDesktop.fetchCardDataPage(offset, source) : fetchCardDataPage(offset, source),
    (completed, total) => publish({ completed, total }), signal);
    signal.throwIfAborted();
    const fetchedAt = new Date().toISOString();
    const next: CardDataStorage = { ...stored, pending: { cards, source, fetchedAt }, lastCheckedAt: fetchedAt };
    await writeCardDataStorage(next);
    publish({ stored: next, status: 'ready', message: `${source === 'kardscom' ? 'KARDS 官方' : 'Kardsplayer'} 数据已获取，核对差异后可应用。` });
  } catch (error) {
    if (signal.aborted) publish({ status: 'idle', message: '已取消获取，当前卡牌数据未改变。' });
    else publish({ status: 'error', error: error instanceof Error ? error.message : '获取失败，请检查网络后重试' });
  } finally { controller = undefined; }
}

export function cancelCardDataCheck() { controller?.abort(); }

export async function deleteDownloadedCardData(part: 'all' | 'active' | 'pending' | 'previous' = 'all') {
  await initializeCardDataSync();
  if (state.status === 'fetching' || state.status === 'applying') throw new Error('请等待卡牌数据操作结束后再删除');
  const previousStatus = state.status;
  publish({ status: 'applying', error: null });
  try {
    const stored = await readCardDataStorage();
    let cards: KardsCardRecord[] | undefined;
    if (part === 'all' || part === 'active') {
      const response = await fetch(new URL('./data/cards.json', window.location.href));
      if (!response.ok) throw new Error('读取随包卡牌数据失败');
      const bundled = await response.json() as { cards: KardsCardRecord[] };
      cards = validateCardRecords(bundled.cards);
    }
    const next: CardDataStorage = part === 'all' ? { schemaVersion: 1 } : { ...stored, [part]: undefined };
    if (part === 'all') await localforage.removeItem(CARD_DATABASE_KEY);
    else await writeCardDataStorage(next);
    const label = { all: '全部下载的卡牌数据及更新记录', active: '当前已应用的更新数据', pending: '待应用数据', previous: '回退数据' }[part];
    publish({ status: next.pending ? 'ready' : 'idle', stored: next, completed: 0, total: 0, error: null, message: `已删除${label}。${cards ? '当前使用随包牌库。' : ''}` });
    return cards;
  } catch (error) {
    publish({ status: previousStatus, error: error instanceof Error ? error.message : '删除卡牌数据失败，请重试' });
    throw error;
  }
}

export async function applyCardData(current: KardsCardRecord[]) {
  if (state.status !== 'ready' || !state.stored.pending) throw new Error('请先获取并检查最新数据');
  publish({ status: 'applying', error: null });
  try {
    const stored = await readCardDataStorage();
    if (!stored.pending) throw new Error('待应用数据已改变，请重新获取');
    const next: CardDataStorage = { ...stored, previous: stored.active || (current.length ? { cards: current, source: 'bundled', fetchedAt: null } : undefined),
      active: { ...stored.pending, appliedAt: new Date().toISOString() }, pending: undefined };
    await writeCardDataStorage(next);
    publish({ status: 'applied', stored: next, message: '更新已应用，卡牌库和构筑已使用新数据。当前卡图按新地址加载，已有缓存保留。' });
    return next.active.cards;
  } catch (error) {
    publish({ status: 'ready', error: error instanceof Error ? error.message : '写入失败，当前数据未改变' });
    throw error;
  }
}

export async function rollbackCardData() {
  if (state.status === 'fetching' || state.status === 'applying') throw new Error('请等待当前操作结束');
  publish({ status: 'applying', error: null });
  try {
    const stored = await readCardDataStorage();
    if (!stored.previous) throw new Error('没有可以回退的数据');
    const next: CardDataStorage = { ...stored, active: { ...stored.previous, appliedAt: new Date().toISOString() }, previous: stored.active, pending: undefined };
    await writeCardDataStorage(next);
    publish({ status: 'applied', stored: next, message: '已回退至上次卡牌数据，用户卡组和卡图缓存未改变。' });
    return next.active.cards;
  } catch (error) {
    publish({ status: 'error', error: error instanceof Error ? error.message : '回退失败，当前数据未改变' });
    throw error;
  }
}
