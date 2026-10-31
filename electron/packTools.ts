// Node-only build/export helpers. Never imported by the renderer.
import fs from 'node:fs/promises';
import path from 'node:path';
import { Kpak, hashPackKey, mimeForFile, normalizeAssetPath, packSalt, type PackWrite } from './kpak';
import { insideFile, validateImageReference } from './cacheBundle';
import { STATIC_PACK_FILE, cardImageIdentity, type LooseCardManifest, type CardImageReference } from '../src/lib/cacheBundleFormat';
import { cardImageMime } from '../src/lib/cardImageDownload';
export { Kpak, hashPackKey, normalizeAssetPath, packSalt, mimeForFile } from './kpak';
export { cardImageIdentity, cardPackCacheKey } from '../src/lib/cacheBundleFormat';
export { staticAssetMiddleware } from './staticMiddleware';

export async function buildStaticPack(root: string, output = path.join(root, 'dist-packs', STATIC_PACK_FILE), salt = packSalt()) {
  const source = path.join(root, 'assets-private', 'static'), assets = path.join(source, 'assets');
  try { await fs.access(assets); }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    await Kpak.open(output, { salt }); return output;
  }
  const temporary = `${output}.tmp`; await fs.mkdir(path.dirname(output), { recursive: true });
  for (const file of [temporary, `${temporary}.idx.bak`, `${temporary}.idx.bak.tmp`, `${temporary}.create.tmp`]) await fs.rm(file, { force: true });
  const pack = await Kpak.open(temporary, { salt, writable: true, create: true });
  async function* walk(relative: string): AsyncGenerator<PackWrite> {
    for (const item of (await fs.readdir(path.join(source, relative), { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const name = `${relative}/${item.name}`;
      if (item.isDirectory()) yield* walk(name);
      else {
        if (item.isSymbolicLink()) throw new Error(`不打包符号链接：${name}`);
        const mime = mimeForFile(name); if (!mime) throw new Error(`不支持的静态资源：${name}`);
        yield { key: hashPackKey(normalizeAssetPath(name), salt), buffer: await fs.readFile(await insideFile(source, name)), mime };
      }
    }
  }
  try { await pack.append(walk('assets')); await fs.rename(temporary, output); }
  finally { await fs.rm(temporary, { force: true }); }
  return output;
}

export async function buildLooseCardPack(directory: string, output: string, salt = packSalt()) {
  const manifest: LooseCardManifest = JSON.parse(await fs.readFile(path.join(directory, 'manifest.json'), 'utf8'));
  if (manifest.version !== 2 || !Array.isArray(manifest.images)) throw new Error('松散卡图 manifest 无效');
  const temporary = `${output}.tmp`; await fs.mkdir(path.dirname(output), { recursive: true });
  for (const file of [temporary, `${temporary}.idx.bak`, `${temporary}.idx.bak.tmp`, `${temporary}.create.tmp`]) await fs.rm(file, { force: true });
  const pack = await Kpak.open(temporary, { salt, writable: true, create: true }); pack.database = manifest.database;
  async function* images(): AsyncGenerator<PackWrite> {
    for (const image of manifest.images) {
      const meta = validateImageReference(image), buffer = await fs.readFile(await insideFile(directory, image.file));
      const mime = cardImageMime(buffer);
      yield { key: hashPackKey(cardImageIdentity(meta), salt), meta, buffer, mime, updatedAt: image.updatedAt };
    }
  }
  try { await pack.append(images()); await fs.rename(temporary, output); }
  finally { await fs.rm(temporary, { force: true }); }
  return output;
}

export async function exportPackToLoose(file: string, directory: string, salt = packSalt()) {
  const pack = await Kpak.open(file, { salt }); await fs.mkdir(directory, { recursive: true });
  const manifest: LooseCardManifest = { version: 2, images: [], ...(pack.database ? { database: pack.database } : {}) };
  for (const [key, entry] of pack.entries) {
    const meta = validateImageReference(entry.meta!), image = await pack.read(key);
    const name = `${key}.${entry.mime.split('/')[1]}`;
    await fs.writeFile(path.join(directory, name), image!.buffer);
    manifest.images.push({ ...meta, file: name, mime: entry.mime, updatedAt: entry.updatedAt });
  }
  await fs.writeFile(path.join(directory, 'manifest.json'), JSON.stringify(manifest, null, 2));
}

export async function writeLooseImage(directory: string, ref: CardImageReference, buffer: Buffer, salt = packSalt()) {
  validateImageReference(ref); const mime = cardImageMime(buffer);
  const file = `${hashPackKey(cardImageIdentity(ref), salt)}.${mime.split('/')[1]}`;
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, file), buffer);
  return { ...ref, file, mime, updatedAt: new Date().toISOString() };
}
