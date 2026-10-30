import { createReadStream } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createBrotliDecompress } from 'node:zlib';
import { createInterface } from 'node:readline';
import { pipeline } from 'node:stream/promises';
import { validateCardRecords } from '../src/lib/cardData';
import { CACHE_BUNDLE_FILE, CACHE_BUNDLE_FORMAT, CACHE_BUNDLE_MARKER, isBundleImageData, isBundleImageKey, type CacheBundleHeader, type CacheBundleInfo } from '../src/lib/cacheBundleFormat';

export class CacheBundleInstaller {
  private info: CacheBundleInfo | null = null;
  private archive = '';
  private staging: string;
  private preparing?: Promise<CacheBundleInfo | null>;

  constructor(private profile: string, private packageDirectory: string) {
    this.staging = path.join(profile, 'full-cache-staging');
  }

  prepare() {
    return this.preparing ||= this.extract().catch(error => { this.preparing = undefined; throw error; });
  }

  private async extract(): Promise<CacheBundleInfo | null> {
    // The marker is checked first: later starts never inspect the data package.
    try { await fs.access(path.join(this.profile, CACHE_BUNDLE_MARKER)); return null; }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    this.archive = path.join(this.packageDirectory, CACHE_BUNDLE_FILE);
    try { await fs.access(this.archive); }
    catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null; throw error; }
    await fs.rm(this.staging, { recursive: true, force: true });
    await fs.mkdir(this.staging, { recursive: true });
    let header: CacheBundleHeader | undefined;
    let complete = false;
    let imageCount = 0;
    const keys = new Set<string>();
    const decoded = createBrotliDecompress();
    const streamDone = pipeline(createReadStream(this.archive), decoded);
    // Attach a rejection handler immediately; await the original promise below.
    void streamDone.catch(() => {});
    const lines = createInterface({ input: decoded, crlfDelay: Infinity });
    try {
      for await (const line of lines) {
        if (line.length > 15 * 1024 * 1024) throw new Error('缓存数据项过大');
        const record = JSON.parse(line);
        if (complete) throw new Error('缓存包尾部无效');
        if (!header) {
          if (record.format !== CACHE_BUNDLE_FORMAT || record.schemaVersion !== 1 || !record.database) throw new Error('缓存包格式无效');
          const cards = validateCardRecords(record.database.cards);
          if (!['bundled', 'official', 'kardsplayer', 'kardscom'].includes(record.database.source)) throw new Error('缓存包牌库来源无效');
          header = { ...record, database: { ...record.database, cards } };
        } else if (record.complete === true) {
          if (record.imageCount !== imageCount) throw new Error('缓存包图片数量不符');
          complete = true;
        } else {
          if (typeof record.key !== 'string' || !isBundleImageKey(record.key) || !isBundleImageData(record.value) || keys.has(record.key)) throw new Error('缓存包图片无效');
          keys.add(record.key);
          await fs.writeFile(path.join(this.staging, `${imageCount++}.json`), JSON.stringify({ key: record.key, value: record.value }));
        }
      }
      await streamDone;
      if (!header || !complete || !imageCount) throw new Error('缓存包不完整或没有卡图');
      this.info = { database: header.database, imageCount };
      return this.info;
    } catch (error) {
      decoded.destroy();
      await streamDone.catch(() => {});
      await fs.rm(this.staging, { recursive: true, force: true });
      throw error;
    } finally { lines.close(); }
  }

  async readImage(index: number): Promise<{ key: string; value: string }> {
    if (!this.info || !Number.isInteger(index) || index < 0 || index >= this.info.imageCount) throw new Error('缓存包图片编号无效');
    return JSON.parse(await fs.readFile(path.join(this.staging, `${index}.json`), 'utf8'));
  }

  async finish() {
    if (!this.info) throw new Error('缓存包尚未初始化');
    // Commit only after every IndexedDB write succeeds. Interrupted imports retry
    // safely next launch; existing cards/images are never overwritten.
    try {
      await fs.rm(this.staging, { recursive: true, force: true });
      const marker = path.join(this.profile, CACHE_BUNDLE_MARKER);
      await fs.writeFile(`${marker}.tmp`, JSON.stringify({ appliedAt: new Date().toISOString(), imageCount: this.info.imageCount }));
      await fs.rename(`${marker}.tmp`, marker);
    } catch (error) {
      this.info = null;
      this.preparing = undefined;
      throw error;
    }
    // A read-only installation may deny deletion; the marker still prevents reuse.
    await fs.unlink(this.archive).catch(console.error);
    this.info = null;
    this.preparing = Promise.resolve(null);
  }
}
