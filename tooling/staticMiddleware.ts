import type { IncomingMessage, ServerResponse } from 'node:http';
import { staticAssetReader } from './staticAssets';
export function staticAssetMiddleware(root: string, salt?: string) {
  const readAsset = staticAssetReader(root, salt);
  return async (request: IncomingMessage, response: ServerResponse, next: () => void) => {
    const url = new URL(request.url || '/', 'http://localhost');
    if (!url.pathname.startsWith('/assets/') || /\.(js|css|map)$/.test(url.pathname)) { next(); return; }
    if (!['GET', 'HEAD'].includes(request.method || '')) { response.statusCode = 405; response.end(); return; }
    try {
      const asset = await readAsset(decodeURIComponent(url.pathname));
      if (!asset) { response.statusCode = 404; response.end(); return; }
      response.setHeader('Content-Type', asset.mime); response.setHeader('Cache-Control', 'no-cache'); response.setHeader('X-Content-Type-Options', 'nosniff');
      response.end(request.method === 'HEAD' ? undefined : asset.buffer);
    } catch (error) { response.statusCode = 404; response.end(); }
  };
}
