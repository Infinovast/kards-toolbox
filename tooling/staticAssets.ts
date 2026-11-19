import fs from 'node:fs/promises';
import path from 'node:path';
import { Kpak, hashPackKey, mimeForFile, normalizeAssetPath, packSalt } from './kpak';
import { STATIC_PACK_FILE, type CardImageReference } from '../src/lib/cacheBundleFormat';
import { validateCardImageUrl } from '../src/lib/cardImageDownload';

export function validateImageReference(value: CardImageReference): CardImageReference {
  if (!value || typeof value.cardId !== 'string' || !/^[\w.-]{1,200}$/.test(value.cardId) || !['full', 'thumb'].includes(value.variant) || typeof value.url !== 'string') throw new Error('卡图缓存标识无效');
  return { cardId: value.cardId, variant: value.variant, url: validateCardImageUrl(value.url) };
}

export async function insideFile(root: string, relative: string) {
  const absolute = path.resolve(root, relative);
  if (!absolute.startsWith(path.resolve(root) + path.sep)) throw new Error('资源路径无效');
  const [base, real] = await Promise.all([fs.realpath(root), fs.realpath(absolute)]);
  if (!real.startsWith(base + path.sep)) throw new Error('资源路径无效');
  return real;
}

export function staticAssetReader(root: string, salt = packSalt(), packPath = path.join(root, 'dist-packs', STATIC_PACK_FILE)) {
  const privateRoot = path.join(root, 'assets-private', 'static');
  let staticPack: Promise<Kpak> | undefined;
  return async (relativePath: string) => {
    const normalized = normalizeAssetPath(relativePath);
    try {
      const file = await insideFile(privateRoot, normalized);
      return { buffer: await fs.readFile(file), mime: mimeForFile(file) || 'application/octet-stream' };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    staticPack ||= Kpak.open(packPath, { salt }).catch(error => { staticPack = undefined; throw error; });
    return (await staticPack).read(hashPackKey(normalized, salt));
  };
}
