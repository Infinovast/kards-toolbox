import { useSyncExternalStore } from 'react';
import { collectCardData, fetchKardsplayerCardPage, type CardDataStorage } from './cardData';
import { readCardDataStorage, writeCardDataStorage } from './cardDatabase';
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

export async function checkCardData() {
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
      ? window.kardsDesktop.fetchCardDataPage(offset) : fetchKardsplayerCardPage(offset),
    (completed, total) => publish({ completed, total }), signal);
    signal.throwIfAborted();
    const fetchedAt = new Date().toISOString();
    const next: CardDataStorage = { ...stored, pending: { cards, source: 'kardsplayer', fetchedAt }, lastCheckedAt: fetchedAt };
    await writeCardDataStorage(next);
    publish({ stored: next, status: 'ready', message: '最新数据已获取，尚未应用。请核对差异后应用更新。' });
  } catch (error) {
    if (signal.aborted) publish({ status: 'idle', message: '已取消获取，当前卡牌数据未改变。' });
    else publish({ status: 'error', error: error instanceof Error ? error.message : '获取失败，请检查网络后重试' });
  } finally { controller = undefined; }
}

export function cancelCardDataCheck() { controller?.abort(); }

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
