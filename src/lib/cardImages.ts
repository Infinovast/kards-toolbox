import localforage from 'localforage';
import { cardImageUrl, type CardLanguage, type KardsCardRecord } from '../types/card';

const inflight = new Map<string, Promise<string>>();
const keyFor = (id: string, language: CardLanguage, version: number) => `kards_card_image_v1_${version}_${language}_${id}`;

export async function getCachedCardImage(id: string, language: CardLanguage = 'zh-Hans', version = 54): Promise<string | null> {
  return localforage.getItem<string>(keyFor(id, language, version));
}

export function cacheCardImage(card: KardsCardRecord, language: CardLanguage, version: number): Promise<string> {
  const key = keyFor(card.importId, language, version);
  const running = inflight.get(key);
  if (running) return running;
  const job = (async () => {
    const cached = await getCachedCardImage(card.importId, language, version);
    if (cached) return cached;
    const url = cardImageUrl(card, language, `v${version}`);
    if (!url) throw new Error('此卡没有可用的卡图路径');
    const response = await fetch(url, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`卡图下载失败（${response.status}）`);
    const blob = await response.blob();
    if (!blob.type.startsWith('image/')) throw new Error('卡图响应不是图片');
    const data = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('无法读取卡图'));
      reader.readAsDataURL(blob);
    });
    await localforage.setItem(key, data);
    return data;
  })();
  inflight.set(key, job);
  void job.finally(() => inflight.delete(key)).catch(() => {});
  return job;
}
