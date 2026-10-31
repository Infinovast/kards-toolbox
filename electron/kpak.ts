import fs, { type FileHandle } from 'node:fs/promises';
import path from 'node:path';
import { createHash, createHmac } from 'node:crypto';
import { brotliCompress, brotliDecompress, constants } from 'node:zlib';
import { promisify } from 'node:util';
import { DEFAULT_PACK_SALT, PACK_END_MAGIC, PACK_FOOTER_SIZE, PACK_HEADER_SIZE, PACK_MAGIC, PACK_MASK_FLAG, PACK_VERSION, type PackEntry, type PackIndex } from '../src/lib/cacheBundleFormat';

const compress = promisify(brotliCompress), decompress = promisify(brotliDecompress);
const MAX_INDEX = 64 * 1024 * 1024, MAX_ENTRY = 64 * 1024 * 1024;
const mimes = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml', 'image/avif', 'image/gif']);
export const packSalt = () => process.env.KARDS_PACK_SALT || DEFAULT_PACK_SALT;
export const hashPackKey = (key: string, salt: string) => createHmac('sha256', salt).update(key).digest('hex').slice(0, 32);
export function normalizeAssetPath(value: string) {
  const normalized = value.replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized.startsWith('assets/') || normalized.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f:?#]/.test(normalized)) throw new Error('资源路径无效');
  return normalized;
}
export function maskEntry(bytes: Buffer, offset: number, salt: string) {
  const result = Buffer.from(bytes), mask = createHash('sha256').update(`${salt}:${offset}`).digest();
  for (let i = 0; i < Math.min(128, result.length); i++) result[i] ^= mask[i % mask.length];
  return result;
}
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  let crc = n; for (let k = 0; k < 8; k++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0); return crc >>> 0;
});
export function crc32(bytes: Uint8Array) { let crc = 0xffffffff; for (const byte of bytes) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 255]; return (crc ^ 0xffffffff) >>> 0; }
export function mimeForFile(file: string) {
  return ({ '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.avif': 'image/avif', '.gif': 'image/gif' } as Record<string, string>)[path.extname(file).toLowerCase()];
}
async function readAt(handle: FileHandle, size: number, offset: number) {
  const result = Buffer.alloc(size); let done = 0;
  while (done < size) { const { bytesRead } = await handle.read(result, done, size - done, offset + done); if (!bytesRead) throw new Error('图包被截断'); done += bytesRead; }
  return result;
}
async function writeAt(handle: FileHandle, bytes: Buffer, offset: number) {
  let done = 0; while (done < bytes.length) { const { bytesWritten } = await handle.write(bytes, done, bytes.length - done, offset + done); if (!bytesWritten) throw new Error('图包写入失败'); done += bytesWritten; }
}
export interface PackWrite { key: string; buffer: Buffer; mime: string; meta?: PackEntry['meta']; updatedAt?: string }
export class Kpak {
  readonly entries = new Map<string, PackEntry>();
  database: PackIndex['database'];
  indexOffset = PACK_HEADER_SIZE;
  deadBytes = 0;
  fileBytes = 0;
  private queue: Promise<unknown> = Promise.resolve();
  private constructor(readonly file: string, readonly salt: string, readonly writable: boolean) {}
  private serial<T>(job: () => Promise<T>): Promise<T> {
    const next = this.queue.catch(() => {}).then(job); this.queue = next; return next;
  }
  static async open(file: string, options: { salt?: string; writable?: boolean; create?: boolean } = {}) {
    const pack = new Kpak(file, options.salt ?? packSalt(), !!options.writable);
    if (pack.writable) await pack.recover();
    try { await pack.load(); }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !options.create || !pack.writable) throw error;
      await fs.mkdir(path.dirname(file), { recursive: true });
      const temporary = `${file}.create.tmp`;
      const handle = await fs.open(temporary, 'w');
      try {
        const header = Buffer.alloc(PACK_HEADER_SIZE); header.write(PACK_MAGIC); header.writeUInt32LE(PACK_VERSION, 8); header.writeUInt32LE(PACK_MASK_FLAG, 12);
        await writeAt(handle, header, 0); await pack.writeTail(handle, PACK_HEADER_SIZE, new Map(), 0); await handle.datasync();
      } finally { await handle.close(); }
      await fs.rename(temporary, file);
      await pack.load();
    }
    return pack;
  }
  private async load() {
    const handle = await fs.open(this.file, 'r');
    try {
      const size = (await handle.stat()).size;
      if (size < PACK_HEADER_SIZE + PACK_FOOTER_SIZE) throw new Error('图包过短');
      const header = await readAt(handle, PACK_HEADER_SIZE, 0), footer = await readAt(handle, PACK_FOOTER_SIZE, size - PACK_FOOTER_SIZE);
      if (header.toString('ascii', 0, 8) !== PACK_MAGIC || header.readUInt32LE(8) !== PACK_VERSION || header.readUInt32LE(12) !== PACK_MASK_FLAG || footer.toString('ascii', 24) !== PACK_END_MAGIC) throw new Error('图包格式或尾部无效');
      const offset = Number(footer.readBigUInt64LE(0)), length = Number(footer.readBigUInt64LE(8));
      if (!Number.isSafeInteger(offset) || !Number.isSafeInteger(length) || offset < PACK_HEADER_SIZE || length < 1 || length > MAX_INDEX || offset + length + PACK_FOOTER_SIZE !== size) throw new Error('图包索引边界无效');
      const index: PackIndex = JSON.parse((await decompress(await readAt(handle, length, offset), { maxOutputLength: MAX_INDEX })).toString('utf8'));
      if (index.version !== PACK_VERSION || index.saltId !== hashPackKey('kards-pack-salt-check', this.salt)) throw new Error('图包版本或 KARDS_PACK_SALT 不匹配');
      if (!index.entries || typeof index.entries !== 'object' || Array.isArray(index.entries)) throw new Error('图包索引无效');
      const entries = Object.entries(index.entries);
      if (entries.length !== footer.readUInt32LE(16)) throw new Error('图包条目数不符');
      for (const [key, entry] of entries) {
        if (!/^[a-f\d]{32}$/.test(key) || !Number.isSafeInteger(entry.offset) || entry.offset < PACK_HEADER_SIZE || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > MAX_ENTRY || entry.offset + entry.size > offset || !mimes.has(entry.mime) || !Number.isInteger(entry.crc32) || entry.crc32 < 0 || entry.crc32 > 0xffffffff || typeof entry.updatedAt !== 'string') throw new Error('图包条目无效');
      }
      let end = PACK_HEADER_SIZE;
      for (const [, entry] of entries.sort((a, b) => a[1].offset - b[1].offset)) { if (entry.offset < end) throw new Error('图包数据重叠'); end = entry.offset + entry.size; }
      this.entries.clear(); entries.forEach(([key, entry]) => this.entries.set(key, entry));
      this.database = index.database; this.indexOffset = offset; this.deadBytes = footer.readUInt32LE(20); this.fileBytes = size;
    } finally { await handle.close(); }
  }
  private async writeTail(handle: FileHandle, offset: number, entries: Map<string, PackEntry>, dead: number) {
    if (dead > 0xffffffff) throw new Error('图包碎片超过格式上限，请先整理');
    const index: PackIndex = { version: 2, saltId: hashPackKey('kards-pack-salt-check', this.salt), entries: Object.fromEntries(entries), ...(this.database ? { database: this.database } : {}) };
    // Runtime appends compress only metadata and avoid Brotli quality 11.
    const bytes = await compress(Buffer.from(JSON.stringify(index)), { params: { [constants.BROTLI_PARAM_QUALITY]: 4 } });
    const footer = Buffer.alloc(PACK_FOOTER_SIZE); footer.writeBigUInt64LE(BigInt(offset), 0); footer.writeBigUInt64LE(BigInt(bytes.length), 8); footer.writeUInt32LE(entries.size, 16); footer.writeUInt32LE(dead, 20); footer.write(PACK_END_MAGIC, 24);
    await writeAt(handle, bytes, offset); await writeAt(handle, footer, offset + bytes.length); await handle.truncate(offset + bytes.length + footer.length);
    return offset + bytes.length + footer.length;
  }
  private async recover() {
    const backup = `${this.file}.idx.bak`;
    let bytes: Buffer;
    try { bytes = await fs.readFile(backup); } catch (error) { if ((error as NodeJS.ErrnoException).code === 'ENOENT') return; throw error; }
    if (bytes.length < 16 + PACK_FOOTER_SIZE || bytes.toString('ascii', 0, 8) !== 'KARDSBAK') throw new Error('图包恢复备份损坏');
    const offset = Number(bytes.readBigUInt64LE(8));
    if (!Number.isSafeInteger(offset) || offset < PACK_HEADER_SIZE || bytes.toString('ascii', bytes.length - 8) !== PACK_END_MAGIC) throw new Error('图包恢复位置无效');
    const handle = await fs.open(this.file, 'r+');
    try { await writeAt(handle, bytes.subarray(16), offset); await handle.truncate(offset + bytes.length - 16); await handle.datasync(); }
    finally { await handle.close(); }
    await fs.unlink(backup);
  }
  async read(key: string) { return this.serial(() => this.readEntry(key)); }
  private async readEntry(key: string) {
    const entry = this.entries.get(key); if (!entry) return null;
    const handle = await fs.open(this.file, 'r');
    try {
      const buffer = maskEntry(await readAt(handle, entry.size, entry.offset), entry.offset, this.salt);
      if (crc32(buffer) !== entry.crc32) throw new Error('图包图片 CRC32 校验失败');
      return { buffer, mime: entry.mime };
    } finally { await handle.close(); }
  }
  async append(items: Iterable<PackWrite> | AsyncIterable<PackWrite>, remove: string[] = []) {
    return this.serial(async () => {
      if (!this.writable) throw new Error('只读图包');
      // Persist the old tail before overwriting it. Any uncommitted transaction
      // rolls back, even when a torn write leaves a superficially valid footer.
      const handle = await fs.open(this.file, 'r+'), backup = `${this.file}.idx.bak`;
      try {
        const oldTail = await readAt(handle, this.fileBytes - this.indexOffset, this.indexOffset);
        const prefix = Buffer.alloc(16); prefix.write('KARDSBAK'); prefix.writeBigUInt64LE(BigInt(this.indexOffset), 8);
        const bak = await fs.open(`${backup}.tmp`, 'w');
        try { await bak.writeFile(Buffer.concat([prefix, oldTail])); await bak.datasync(); } finally { await bak.close(); }
        await fs.rename(`${backup}.tmp`, backup);
        let offset = this.indexOffset, dead = this.deadBytes;
        const entries = new Map(this.entries);
        for (const key of remove) { const old = entries.get(key); if (old) { dead += old.size; entries.delete(key); } }
        for await (const item of items) {
          if (!/^[a-f\d]{32}$/.test(item.key) || !item.buffer.length || item.buffer.length > MAX_ENTRY || !mimes.has(item.mime)) throw new Error('写入图包的图片无效');
          const old = entries.get(item.key); if (old) dead += old.size;
          await writeAt(handle, maskEntry(item.buffer, offset, this.salt), offset);
          entries.set(item.key, { offset, size: item.buffer.length, mime: item.mime, crc32: crc32(item.buffer), updatedAt: item.updatedAt || new Date().toISOString(), ...(item.meta ? { meta: item.meta } : {}) });
          offset += item.buffer.length;
        }
        const size = await this.writeTail(handle, offset, entries, dead);
        await handle.datasync(); await fs.unlink(backup);
        this.entries.clear(); entries.forEach((entry, key) => this.entries.set(key, entry));
        this.indexOffset = offset; this.fileBytes = size; this.deadBytes = dead;
      } catch (error) { await handle.close(); await this.recover(); await this.load(); throw error; }
      finally { await handle.close().catch(() => {}); }
      if (this.deadBytes > 32 * 1024 * 1024 && this.deadBytes / this.fileBytes > 0.2) await this.compactInternal();
    });
  }
  compact() { return this.serial(() => this.compactInternal()); }
  private async compactInternal() {
    if (!this.writable) throw new Error('只读图包');
    const tmp = `${this.file}.tmp`;
    for (const file of [tmp, `${tmp}.idx.bak`, `${tmp}.idx.bak.tmp`, `${tmp}.create.tmp`]) await fs.rm(file, { force: true });
    const next = await Kpak.open(tmp, { salt: this.salt, writable: true, create: true }); next.database = this.database;
    const self = this;
    async function* active() { for (const [key, entry] of self.entries) { const image = await self.readEntry(key); yield { key, ...image!, meta: entry.meta, updatedAt: entry.updatedAt }; } }
    try { await next.append(active()); await fs.rename(tmp, this.file); await this.load(); }
    finally { await fs.rm(tmp, { force: true }); }
  }
}
