import { useSyncExternalStore } from 'react';
import { cacheCardImage, getCachedCardImage } from './cardImages';
import type { CardLanguage, KardsCardRecord } from '../types/card';

export interface ImageDownload {
  status: 'idle' | 'running' | 'done' | 'canceled'; total: number; completed: number;
  cached: number; downloaded: number; failed: number; bytes: number; startedAt: number;
  language: CardLanguage; version: number; failedCards: KardsCardRecord[];
}
let state: ImageDownload = { status: 'idle', total: 0, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: 0, language: 'zh-Hans', version: 54, failedCards: [] };
const listeners = new Set<() => void>();
const publish = (patch: Partial<ImageDownload>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export const useImageDownload = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
let canceled = false;
export function cancelImageDownload() { canceled = true; }
export function dismissImageDownload() { if (state.status !== 'running') publish({ status: 'idle' }); }

// The queue lives outside the library component, so navigation does not interrupt it.
export async function startImageDownload(cards: KardsCardRecord[], language: CardLanguage, version: number) {
  if (state.status === 'running' || !cards.length) return;
  canceled = false;
  const queue = [...new Map(cards.map(card => [card.importId, card])).values()];
  publish({ status: 'running', total: queue.length, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: Date.now(), language, version, failedCards: [] });
  let cursor = 0;
  const worker = async () => {
    while (!canceled && cursor < queue.length) {
      const card = queue[cursor++];
      try {
        const cached = await getCachedCardImage(card.importId, language, version);
        if (cached) publish({ cached: state.cached + 1 });
        else {
          const data = await cacheCardImage(card, language, version);
          publish({ downloaded: state.downloaded + 1, bytes: state.bytes + Math.floor((data.length - data.indexOf(',') - 1) * 0.75) });
        }
      } catch { publish({ failed: state.failed + 1, failedCards: [...state.failedCards, card] }); }
      publish({ completed: state.completed + 1 });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  publish({ status: canceled ? 'canceled' : 'done' });
}
