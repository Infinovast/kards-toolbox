import { useSyncExternalStore } from 'react';
import { cacheCardImage, getCachedCardImage, getCardImageFailureAttempts, recordImageCacheBatch } from './cardImages';
import { cardDisplayTitle, type CardImageKind, type CardLanguage, type KardsCardRecord } from '../types/card';

interface CurrentDownload { importId: string; title: string; kinds: CardImageKind[] }
export interface ImageDownload {
  status: 'idle' | 'running' | 'paused' | 'done' | 'canceled'; total: number; completed: number;
  cached: number; downloaded: number; failed: number; bytes: number; startedAt: number; endedAt: number;
  pausedAt: number; pausedMs: number; intervalMs: number; threads: number;
  language: CardLanguage; failedCards: KardsCardRecord[]; current: CurrentDownload[];
}
let state: ImageDownload = { status: 'idle', total: 0, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: 0, endedAt: 0, pausedAt: 0, pausedMs: 0, intervalMs: 500, threads: 1, language: 'zh-Hans', failedCards: [], current: [] };
const listeners = new Set<() => void>();
const publish = (patch: Partial<ImageDownload>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export const useImageDownload = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
let canceled = false;
let paused = false;
export function setImageDownloadInterval(milliseconds: number) {
  if (Number.isFinite(milliseconds)) publish({ intervalMs: Math.max(100, Math.min(30000, Math.round(milliseconds / 100) * 100)) });
}
export function setImageDownloadThreads(threads: number) {
  if (Number.isFinite(threads)) publish({ threads: Math.max(1, Math.min(8, Math.round(threads))) });
}
export function cancelImageDownload() { canceled = true; }
export function pauseImageDownload() {
  if (state.status !== 'running' || canceled) return;
  paused = true;
  publish({ status: 'paused', pausedAt: Date.now() });
}
export function resumeImageDownload() {
  if (state.status !== 'paused' || canceled) return;
  paused = false;
  publish({ status: 'running', pausedMs: state.pausedMs + Date.now() - state.pausedAt, pausedAt: 0 });
}
export function dismissImageDownload() { if (state.status !== 'running' && state.status !== 'paused') publish({ status: 'idle' }); }
const sleep = () => new Promise(resolve => globalThis.setTimeout(resolve, 100));
const activeTime = () => Date.now() - state.pausedMs - (paused ? Date.now() - state.pausedAt : 0);

// One dispatcher controls live concurrency and the shared interval/backoff.
// Already-started requests finish when paused or when the thread limit is reduced.
export async function startImageDownload(cards: KardsCardRecord[], language: CardLanguage, retry = false) {
  if (state.status === 'running' || state.status === 'paused' || !cards.length) return;
  canceled = false; paused = false;
  const queue = [...new Map(cards.map(card => [card.importId, card])).values()];
  publish({ status: 'running', total: queue.length, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: Date.now(), endedAt: 0, pausedAt: 0, pausedMs: 0, language, failedCards: [], current: [] });
  if (!retry) await recordImageCacheBatch(queue, language);
  const jobs = new Set<Promise<void>>();
  const kinds = ['full', 'thumbnail'] as const;
  let cursor = 0;
  let failureStreak = 0;
  let lastStarted = 0;
  let lastFinished = 0;
  let lastFailure = 0;
  let prepared: { card: KardsCardRecord; cached: (string | null)[]; failures: number; at: number } | undefined;
  const failed = (card: KardsCardRecord) => {
    failureStreak++; lastFailure = activeTime();
    publish({ failed: state.failed + 1, failedCards: [...state.failedCards, card] });
  };
  const download = async (card: KardsCardRecord, cached: (string | null)[]) => {
    const missing = kinds.filter((_, index) => !cached[index]);
    publish({ current: [...state.current, { importId: card.importId, title: cardDisplayTitle(card, language), kinds: missing }] });
    try {
      const results = await Promise.allSettled(missing.map(async kind => {
        try { return await cacheCardImage(card, language, kind, false); }
        finally { publish({ current: state.current.flatMap(item => {
          if (item.importId !== card.importId) return [item];
          const remaining = item.kinds.filter(value => value !== kind);
          return remaining.length ? [{ ...item, kinds: remaining }] : [];
        }) }); }
      }));
      const bytes = results.reduce((sum, result) => sum + (result.status === 'rejected' ? 0 : Math.floor((result.value.length - result.value.indexOf(',') - 1) * 0.75)), 0);
      publish({ bytes: state.bytes + bytes });
      if (results.some(result => result.status === 'rejected')) {
        failed(card);
        failureStreak = Math.max(failureStreak, await getCardImageFailureAttempts(card, language).catch(() => failureStreak));
      } else { failureStreak = 0; publish({ downloaded: state.downloaded + 1 }); }
    } finally {
      publish({ completed: state.completed + 1, current: state.current.filter(item => item.importId !== card.importId) });
    }
  };
  while (cursor < queue.length || jobs.size) {
    if (canceled) { await Promise.all(jobs); break; }
    if (paused || jobs.size >= state.threads || cursor >= queue.length) { await sleep(); continue; }
    if (!prepared) {
      const card = queue[cursor];
      try {
        const [cached, failures] = await Promise.all([Promise.all(kinds.map(kind => getCachedCardImage(card, language, kind))), getCardImageFailureAttempts(card, language)]);
        prepared = { card, cached, failures, at: activeTime() };
      } catch { failed(card); publish({ completed: state.completed + 1 }); cursor++; continue; }
      continue;
    }
    if (prepared.cached.every(Boolean)) {
      publish({ cached: state.cached + 1, completed: state.completed + 1 }); cursor++; prepared = undefined; continue;
    }
    const interval = Math.min(30000, state.intervalMs * 2 ** Math.max(failureStreak, prepared.failures));
    const anchor = Math.max(lastStarted, lastFailure, jobs.size ? 0 : lastFinished);
    const readyAt = Math.max(anchor ? anchor + interval : 0, prepared.failures ? prepared.at + interval : 0);
    if (activeTime() < readyAt) { await sleep(); continue; }
    const { card, cached } = prepared;
    cursor++; prepared = undefined; lastStarted = activeTime();
    const job = download(card, cached).finally(() => { jobs.delete(job); lastFinished = activeTime(); });
    jobs.add(job);
  }
  const endedAt = Date.now();
  const pausedMs = state.pausedMs + (paused && state.pausedAt ? endedAt - state.pausedAt : 0);
  paused = false;
  publish({ status: canceled ? 'canceled' : 'done', pausedAt: 0, pausedMs, endedAt, current: [] });
}
