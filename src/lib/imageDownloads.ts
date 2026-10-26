import { useSyncExternalStore } from 'react';
import { cacheCardImage, getCachedCardImage } from './cardImages';
import type { CardImageVersion, CardLanguage, KardsCardRecord } from '../types/card';

export interface ImageDownload {
  status: 'idle' | 'running' | 'done' | 'canceled'; total: number; completed: number;
  cached: number; downloaded: number; failed: number; bytes: number; startedAt: number;
  language: CardLanguage; version: CardImageVersion; failedCards: KardsCardRecord[];
}
let state: ImageDownload = { status: 'idle', total: 0, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: 0, language: 'zh-Hans', version: 'current', failedCards: [] };
const listeners = new Set<() => void>();
const publish = (patch: Partial<ImageDownload>) => { state = { ...state, ...patch }; listeners.forEach(fn => fn()); };
export const useImageDownload = () => useSyncExternalStore(fn => { listeners.add(fn); return () => { listeners.delete(fn); }; }, () => state);
let canceled = false;
export function cancelImageDownload() { canceled = true; }
export function dismissImageDownload() { if (state.status !== 'running') publish({ status: 'idle' }); }

// The queue lives outside the library component, so navigation does not interrupt it.
export async function startImageDownload(cards: KardsCardRecord[], language: CardLanguage, version: CardImageVersion) {
  if (state.status === 'running' || !cards.length) return;
  canceled = false;
  const queue = [...new Map(cards.map(card => [card.importId, card])).values()];
  publish({ status: 'running', total: queue.length, completed: 0, cached: 0, downloaded: 0, failed: 0, bytes: 0, startedAt: Date.now(), language, version, failedCards: [] });
  let cursor = 0;
  const worker = async () => {
    while (!canceled && cursor < queue.length) {
      const card = queue[cursor++];
      try {
        const kinds = ['full', 'thumbnail'] as const;
        const cached = await Promise.all(kinds.map(kind => getCachedCardImage(card, language, version, kind)));
        if (cached.every(Boolean)) publish({ cached: state.cached + 1 });
        else {
          const data = await Promise.all(kinds.map(kind => cacheCardImage(card, language, version, kind)));
          const bytes = data.reduce((total, image, index) => total + (cached[index] || (index === 1 && image === data[0] && !card.thumbUrl) ? 0 : Math.floor((image.length - image.indexOf(',') - 1) * 0.75)), 0);
          publish({ downloaded: state.downloaded + 1, bytes: state.bytes + bytes });
        }
      } catch { publish({ failed: state.failed + 1, failedCards: [...state.failedCards, card] }); }
      publish({ completed: state.completed + 1 });
    }
  };
  await Promise.all(Array.from({ length: 4 }, worker));
  publish({ status: canceled ? 'canceled' : 'done' });
}
