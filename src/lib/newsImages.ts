import localforage from 'localforage';
import type { NewsImage } from './newsSource';

const newsImageStore = localforage.createInstance({ name: 'kards_toolbox', storeName: 'news_images' });
let writes = Promise.resolve();
let generation = 0;

export async function readNewsImageCache() {
  await writes;
  const stats = { count: 0, bytes: 0 };
  await newsImageStore.iterate<Blob, void>(blob => {
    stats.count += 1;
    stats.bytes += blob.size;
  });
  return stats;
}

export function clearNewsImageCache() {
  generation += 1;
  const clear = writes.then(() => newsImageStore.clear());
  writes = clear.catch(() => {});
  return clear;
}

function resizeImage(src: string, width: number, quality: number) {
  const url = new URL(src);
  url.searchParams.set('auto', 'format,compress');
  if (!url.searchParams.has('fit')) url.searchParams.set('fit', 'max');
  url.searchParams.set('w', String(width));
  url.searchParams.set('q', String(quality));
  return url.href;
}

function isNewsImageCdn(src: string) {
  return ['datocms.kardsplayer.com', 'www.datocms-assets.com'].includes(new URL(src).hostname);
}

export function newsImageVersions(src: string, width: number) {
  return isNewsImageCdn(src) ? [resizeImage(src, Math.min(480, width), 34), resizeImage(src, width, 78)] : [src];
}

function decodeImage(src: string, signal: AbortSignal) {
  if (signal.aborted) return Promise.resolve(null);
  return new Promise<HTMLImageElement | null>(resolve => {
    const image = new Image();
    image.referrerPolicy = 'no-referrer';
    const cancel = () => {
      image.removeAttribute('src');
      resolve(null);
    };
    const finish = (decoded: HTMLImageElement | null) => {
      signal.removeEventListener('abort', cancel);
      resolve(decoded);
    };
    signal.addEventListener('abort', cancel, { once: true });
    image.src = src;
    void image.decode().then(() => finish(image), () => finish(null));
  });
}

const readCachedImage = (src: string) => newsImageStore.getItem<Blob>(src).catch(() => null);

async function decodeBlob(blob: Blob, signal: AbortSignal) {
  const url = URL.createObjectURL(blob);
  try { return await decodeImage(url, signal); }
  finally { URL.revokeObjectURL(url); }
}

export async function loadNewsImage(src: string, signal: AbortSignal) {
  const startedGeneration = generation;
  await writes;
  const cached = await readCachedImage(src);
  if (signal.aborted) return null;
  if (cached) {
    const decoded = await decodeBlob(cached, signal);
    if (decoded || signal.aborted) return decoded;
  }

  const timedSignal = AbortSignal.any([signal, AbortSignal.timeout(12_000)]);
  const blob = await fetch(src, { signal: timedSignal, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' })
    .then(response => response.ok && response.headers.get('Content-Type')?.startsWith('image/') ? response.blob() : null)
    .catch(() => null);
  if (signal.aborted) return null;
  if (!blob) return decodeImage(src, timedSignal);

  const image = await decodeBlob(blob, timedSignal);
  if (image) {
    writes = writes.then(async () => {
      if (generation === startedGeneration && !signal.aborted) await newsImageStore.setItem(src, blob);
    }).catch(() => {});
    await writes;
  }
  return image;
}

export async function fillNewsCover(container: HTMLElement, cover: NewsImage, width: number, signal: AbortSignal) {
  const cdn = isNewsImageCdn(cover.src);
  const preview = cdn ? resizeImage(cover.src, 360, 34) : cover.src;
  const list = cdn ? resizeImage(cover.src, 640, 68) : cover.src;
  const full = cdn && width > 640 ? resizeImage(cover.src, width, 78) : list;
  await writes;
  const cachedFull = await readCachedImage(full);
  const cachedList = full !== list && await readCachedImage(list);
  const versions = cachedFull ? [full] : [...new Set([cachedList ? list : preview, full])];
  for (const src of versions) {
    if (signal.aborted) return;
    const image = await loadNewsImage(src, signal);
    if (signal.aborted) return;
    if (!image) continue;
    image.alt = '';
    container.replaceChildren(image);
  }
}
