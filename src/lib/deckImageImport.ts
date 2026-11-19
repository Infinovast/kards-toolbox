import { decodeDeckCode } from './deckCode';
import { readImageDeckCode, type ImageDeckCode } from './deckImageCode';

export interface ImageDeckResult extends ImageDeckCode { total: number; }

export function decodeImageQr(file: Blob, signal?: AbortSignal): Promise<string | null> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(new DOMException('已取消', 'AbortError')); return; }
    const worker = new Worker(new URL('./deckImageQr.worker.ts', import.meta.url), { type: 'module' });
    const finish = (result: string | null) => { cleanup(); resolve(result); };
    const abort = () => { cleanup(); reject(new DOMException('已取消', 'AbortError')); };
    const timeout = window.setTimeout(() => finish(null), 20000);
    const cleanup = () => { worker.terminate(); window.clearTimeout(timeout); signal?.removeEventListener('abort', abort); };
    signal?.addEventListener('abort', abort, { once: true });
    worker.onmessage = event => finish(typeof event.data === 'string' ? event.data : null);
    worker.onerror = () => finish(null);
    worker.postMessage(file);
  });
}

export async function importDeckImage(file: File, onStage: (stage: string) => void, signal?: AbortSignal): Promise<ImageDeckResult> {
  if (file.size > 25 * 1024 * 1024) throw new Error('卡组图片不能超过 25 MB');
  onStage('识别二维码…');
  const qr = await decodeImageQr(file, signal);
  const decoded = qr ? readImageDeckCode(qr) : null;
  if (signal?.aborted) throw new DOMException('已取消', 'AbortError');
  if (!decoded) throw new Error('图片中未找到可用的卡组二维码');
  const total = 1 + [...decodeDeckCode(decoded.code).counts.values()].reduce((sum, count) => sum + count, 0);
  return { ...decoded, total };
}
