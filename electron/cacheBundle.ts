import fs from 'node:fs/promises';
import path from 'node:path';
import { Kpak, hashPackKey, mimeForFile, normalizeAssetPath, packSalt, type PackWrite } from './kpak';
import { CACHE_BUNDLE_FILE, CACHE_BUNDLE_MARKER, STATIC_PACK_FILE, cardImageIdentity, cardPackCacheKey, type CacheBundleInfo, type CardImageMetadata, type CardImageReference, type CardPackStats, type LooseCardImage, type LooseCardManifest, type PackImageVariant } from '../src/lib/cacheBundleFormat';
import { cardImageMime, validateCardImageUrl } from '../src/lib/cardImageDownload';
import { validateCardRecords } from '../src/lib/cardData';

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
const exists = async (file: string) => fs.access(file).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; });
export interface PackManagerOptions { root?: string; packaged?: boolean; staticPack?: string; salt?: string }

export class CacheBundleInstaller {
  readonly cardsFile: string;
  private readonly privateRoot: string;
  private readonly staticFile: string;
  readonly salt: string;
  private cards?: Promise<Kpak>;
  private static?: Promise<Kpak>;
  private loose?: Promise<Map<string, LooseCardImage & { size: number }>>;
  private preparing?: Promise<CacheBundleInfo | null>;
  private mutations: Promise<unknown> = Promise.resolve();
  constructor(private profile: string, private packageDirectory: string, private options: PackManagerOptions = {}) {
    const root = options.root || path.resolve(__dirname, '..');
    this.privateRoot = options.packaged ? '' : path.join(root, 'assets-private');
    this.staticFile = options.staticPack || path.join(root, 'dist-packs', STATIC_PACK_FILE);
    this.cardsFile = path.join(profile, 'packs', CACHE_BUNDLE_FILE);
    this.salt = options.salt ?? packSalt();
  }
  private serial<T>(job: () => Promise<T>) { const next = this.mutations.catch(() => {}).then(job); this.mutations = next; return next; }
  private cardPack() { return this.cards ||= Kpak.open(this.cardsFile, { salt: this.salt, writable: true, create: true }).catch(error => { this.cards = undefined; throw error; }); }
  private async looseCards() {
    return this.loose ||= (async () => {
      const result = new Map<string, LooseCardImage & { size: number }>();
      if (!this.privateRoot) return result;
      const root = path.join(this.privateRoot, 'cards'), manifestFile = path.join(root, 'manifest.json');
      if (!await exists(manifestFile)) return result;
      const manifest: LooseCardManifest = JSON.parse(await fs.readFile(manifestFile, 'utf8'));
      if (manifest.version !== 2 || !Array.isArray(manifest.images)) throw new Error('松散卡图清单无效');
      for (const entry of manifest.images) {
        const ref = validateImageReference(entry);
        try { const file = await insideFile(root, entry.file); result.set(cardImageIdentity(ref), { ...entry, ...ref, size: (await fs.stat(file)).size }); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
      }
      return result;
    })().catch(error => { this.loose = undefined; throw error; });
  }
  async readStaticAsset(relativePath: string) {
    const normalized = normalizeAssetPath(relativePath);
    if (this.privateRoot) {
      try { const file = await insideFile(path.join(this.privateRoot, 'static'), normalized); return { buffer: await fs.readFile(file), mime: mimeForFile(file) || 'application/octet-stream' }; }
      catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    }
    const pack = await (this.static ||= Kpak.open(this.staticFile, { salt: this.salt }).catch(error => { this.static = undefined; throw error; }));
    return pack.read(hashPackKey(normalized, this.salt));
  }
  async readCardImage(cardId: string, variant: PackImageVariant, url: string) {
    const ref = validateImageReference({ cardId, variant, url });
    return this.serial(async () => {
      const loose = (await this.looseCards()).get(cardImageIdentity(ref));
      if (loose) { const file = await insideFile(path.join(this.privateRoot, 'cards'), loose.file); return { buffer: await fs.readFile(file), mime: loose.mime }; }
      return (await this.cardPack()).read(hashPackKey(cardImageIdentity(ref), this.salt));
    });
  }
  async appendCardImages(items: Array<CardImageReference & { buffer: Buffer; mime: string }>) {
    return this.serial(async () => {
      const writes = items.map(item => {
        const meta = validateImageReference(item);
        if (item.buffer.length > 10 * 1024 * 1024 || cardImageMime(item.buffer) !== item.mime) throw new Error('卡图内容无效');
        return { key: hashPackKey(cardImageIdentity(meta), this.salt), buffer: item.buffer, mime: item.mime, meta };
      });
      await (await this.cardPack()).append(writes);
    });
  }
  async listCardImageKeys(): Promise<CardPackStats> {
    await this.mutations.catch(() => {});
    const pack = await this.cardPack(), entries = new Map<string, CardImageMetadata>();
    for (const [hash, entry] of pack.entries) {
      const meta = validateImageReference(entry.meta!);
      if (hashPackKey(cardImageIdentity(meta), this.salt) !== hash) throw new Error('卡图索引标识不匹配');
      entries.set(cardImageIdentity(meta), { ...meta, key: cardPackCacheKey(meta), size: entry.size, mime: entry.mime, updatedAt: entry.updatedAt });
    }
    for (const [identity, entry] of await this.looseCards()) entries.set(identity, { cardId: entry.cardId, variant: entry.variant, url: entry.url, key: cardPackCacheKey(entry), size: entry.size, mime: entry.mime, updatedAt: entry.updatedAt || '' });
    return { entries: [...entries.values()], deadBytes: pack.deadBytes, fileBytes: pack.fileBytes };
  }
  deleteCardImages(refs: CardImageReference[]) {
    return this.serial(async () => {
      const valid = refs.map(validateImageReference), pack = await this.cardPack();
      const loose = new Map(await this.looseCards());
      const removed: LooseCardImage[] = [];
      for (const ref of valid) { const key = cardImageIdentity(ref), old = loose.get(key); if (old) { removed.push(old); loose.delete(key); } }
      await pack.append([], valid.map(ref => hashPackKey(cardImageIdentity(ref), this.salt)));
      if (removed.length) {
        const root = path.join(this.privateRoot, 'cards'), file = path.join(root, 'manifest.json');
        const original: LooseCardManifest = JSON.parse(await fs.readFile(file, 'utf8'));
        const manifest = { ...original, images: [...loose.values()].map(({ size, ...entry }) => entry) };
        await fs.writeFile(`${file}.tmp`, JSON.stringify(manifest, null, 2)); await fs.rename(`${file}.tmp`, file);
        this.loose = Promise.resolve(loose);
        for (const item of removed) if (![...loose.values()].some(entry => entry.file === item.file)) await fs.unlink(await insideFile(root, item.file)).catch(error => { if (error.code !== 'ENOENT') throw error; });
      }
    });
  }
  compactCardPack() { return this.serial(async () => { await (await this.cardPack()).compact(); }); }
  prepare() { return this.preparing ||= this.serial(() => this.install()).catch(error => { this.preparing = undefined; throw error; }); }
  private async install(): Promise<CacheBundleInfo | null> {
    const archive = path.join(this.packageDirectory, CACHE_BUNDLE_FILE), marker = path.join(this.profile, CACHE_BUNDLE_MARKER);
    if (await exists(marker) || !await exists(archive) || path.resolve(archive) === path.resolve(this.cardsFile)) return null;
    const source = await Kpak.open(archive, { salt: this.salt });
    // Validate the index without decoding every image. CRC is checked on reads.
    for (const [key, entry] of source.entries) if (hashPackKey(cardImageIdentity(validateImageReference(entry.meta!)), this.salt) !== key) throw new Error('分发卡图索引无效');
    const database = source.database;
    if (database) { database.cards = validateCardRecords(database.cards); if (!['bundled', 'official', 'kardsplayer', 'kardscom'].includes(database.source)) throw new Error('分发牌库来源无效'); }
    await fs.mkdir(path.dirname(this.cardsFile), { recursive: true });
    if (!await exists(this.cardsFile)) {
      const tmp = `${this.cardsFile}.install.tmp`;
      await fs.copyFile(archive, tmp);
      const file = await fs.open(tmp, 'r+'); try { await file.datasync(); } finally { await file.close(); }
      await fs.rename(tmp, this.cardsFile); this.cards = undefined;
    } else {
      const target = await this.cardPack();
      async function* missing(): AsyncGenerator<PackWrite> {
        for (const [key, entry] of source.entries) if (!target.entries.has(key)) { const image = await source.read(key); yield { key, ...image!, meta: entry.meta, updatedAt: entry.updatedAt }; }
      }
      await target.append(missing());
    }
    return { database, imageCount: source.entries.size };
  }
  async finish() {
    const info = await this.prepare(); if (!info) return;
    const marker = path.join(this.profile, CACHE_BUNDLE_MARKER);
    await fs.writeFile(`${marker}.tmp`, JSON.stringify({ version: 2, appliedAt: new Date().toISOString(), imageCount: info.imageCount }));
    await fs.rename(`${marker}.tmp`, marker);
    await fs.unlink(path.join(this.packageDirectory, CACHE_BUNDLE_FILE)).catch(error => { if (!['ENOENT', 'EACCES', 'EPERM'].includes(error.code)) throw error; });
    this.preparing = Promise.resolve(null);
  }
}

let defaultManager: CacheBundleInstaller | undefined;
export function configurePackManager(manager: CacheBundleInstaller) { defaultManager = manager; }
export function resourceManager() {
  if (!defaultManager) throw new Error('图片资源管理器尚未初始化');
  return defaultManager;
}
export const readStaticAsset = (relativePath: string) => resourceManager().readStaticAsset(relativePath);
export const readCardImage = (cardId: string, variant: PackImageVariant, url: string) => resourceManager().readCardImage(cardId, variant, url);
