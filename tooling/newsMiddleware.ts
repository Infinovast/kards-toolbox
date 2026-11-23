import type { IncomingMessage, ServerResponse } from 'node:http';
import { NEWS_SOURCE } from '../src/lib/newsSource';

const maxPageBytes = 4 * 1024 * 1024;
const newsRoute = /^\/api\/news(?:\/([a-z0-9]+(?:-[a-z0-9]+)*))?$/;

export async function newsMiddleware(req: IncomingMessage, res: ServerResponse, next: () => void) {
  const path = (req.url ?? '').split('?', 1)[0];
  if (path !== '/api/news' && !path.startsWith('/api/news/')) return next();

  const route = newsRoute.exec(path);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (!route || (route[1]?.length ?? 0) > 256) {
    res.statusCode = 404;
    return res.end();
  }
  if (req.method !== 'GET') {
    res.statusCode = 405;
    res.setHeader('Allow', 'GET');
    return res.end();
  }

  const controller = new AbortController();
  const cancel = () => controller.abort();
  res.once('close', cancel);
  try {
    const response = await fetch(route[1] ? `${NEWS_SOURCE}/${route[1]}` : NEWS_SOURCE, {
      cache: 'no-store', redirect: 'error', signal: AbortSignal.any([controller.signal, AbortSignal.timeout(12_000)]),
    });
    if (!response.ok || !response.body) throw new Error('News source unavailable');
    const chunks: Uint8Array[] = [];
    let bytes = 0;
    const body = response.body.getReader();
    for (;;) {
      const { value, done } = await body.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxPageBytes) throw new Error('News page too large');
      chunks.push(value);
    }
    res.end(Buffer.concat(chunks));
  } catch {
    if (!res.destroyed) {
      res.statusCode = 502;
      res.end();
    }
  } finally {
    res.off('close', cancel);
    cancel();
  }
}
