import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { CacheBundleInstaller } from './cacheBundle';
import { Kpak, hashPackKey, maskEntry, normalizeAssetPath, crc32 } from './kpak';
import { CACHE_BUNDLE_FILE, CACHE_BUNDLE_MARKER, PACK_FOOTER_SIZE, cardImageIdentity } from '../src/lib/cacheBundleFormat';
import bundled from '../public/data/cards.json';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kards-kpak-'));
const salt = 'test-salt', key = (value: string) => hashPackKey(value, salt);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/l1sAAAAASUVORK5CYII=', 'base64');
const ref = { cardId: '13e_dragons', variant: 'full' as const, url: bundled.cards.find(card => card.cardId === '13e_dragons')!.imageUrl! };
try {
  assert.equal(PACK_FOOTER_SIZE, 32);
  assert.equal(crc32(Buffer.from('123456789')), 0xcbf43926);
  for (const name of ['../secret', 'assets/../secret', 'assets/a:bad', 'assets/a//b']) assert.throws(() => normalizeAssetPath(name));
  const file = path.join(root, 'roundtrip.kpak');
  const pack = await Kpak.open(file, { salt, writable: true, create: true });
  const original = Buffer.alloc(1024, 127); png.copy(original);
  await pack.append([{ key: key('a'), buffer: original, mime: 'image/png' }]);
  assert.deepEqual((await pack.read(key('a')))!.buffer, original);
  const raw = await fs.readFile(file);
  assert.equal(raw.indexOf(png.subarray(0, 8)), -1, 'PNG header is not present in raw pack');
  assert.deepEqual(maskEntry(maskEntry(original, 16, salt), 16, salt), original);
  assert.deepEqual(raw.subarray(16 + 128, 16 + original.length), original.subarray(128), 'mask changes only the first 128 bytes');
  const position = pack.entries.get(key('a'))!.offset, prefix = raw.subarray(0, pack.indexOffset);
  await Promise.all(['b', 'c', 'd'].map(name => pack.append([{ key: key(name), buffer: png, mime: 'image/png' }])));
  assert.equal(pack.entries.get(key('a'))!.offset, position, 'append never moves existing image data');
  assert.deepEqual((await fs.readFile(file)).subarray(0, prefix.length), prefix, 'old data bytes remain untouched');
  for (const name of ['a', 'b', 'c', 'd']) assert.ok(await pack.read(key(name)));
  await assert.rejects(() => Kpak.open(file, { salt: 'wrong' }), /SALT/);
  // A failed write restores the old tail, including failures halfway through a batch.
  const beforeFailure = await fs.readFile(file);
  await assert.rejects(() => pack.append([{ key: key('e'), buffer: png, mime: 'image/png' }, { key: key('f'), buffer: Buffer.alloc(0), mime: 'image/png' }]));
  assert.deepEqual(await fs.readFile(file), beforeFailure);
  // Simulate power loss after the old index was overwritten and the file grew.
  const old = await fs.readFile(file), offset = pack.indexOffset;
  const backup = Buffer.alloc(16); backup.write('KARDSBAK'); backup.writeBigUInt64LE(BigInt(offset), 8);
  await fs.writeFile(`${file}.idx.bak`, Buffer.concat([backup, old.subarray(offset)]));
  const handle = await fs.open(file, 'r+'); await handle.write(Buffer.alloc(2000, 7), 0, 2000, offset); await handle.close();
  const recovered = await Kpak.open(file, { salt, writable: true });
  assert.deepEqual(await fs.readFile(file), old);
  assert.deepEqual((await recovered.read(key('a')))!.buffer, original);
  await recovered.append([{ key: key('a'), buffer: png, mime: 'image/png' }], [key('b')]);
  assert.equal(await recovered.read(key('b')), null);
  assert.equal(recovered.deadBytes, original.length + png.length);
  const fragmentedSize = recovered.fileBytes;
  await fs.writeFile(`${file}.tmp`, 'abandoned compaction');
  await fs.writeFile(`${file}.tmp.idx.bak`, 'abandoned journal');
  await recovered.compact();
  assert.equal(recovered.deadBytes, 0); assert.ok(recovered.fileBytes < fragmentedSize);
  assert.deepEqual((await recovered.read(key('a')))!.buffer, png);
  // Automatic compaction at both thresholds.
  const big = Buffer.alloc(33 * 1024 * 1024, 13);
  await recovered.append([{ key: key('large'), buffer: big, mime: 'image/png' }]);
  await recovered.append([], [key('large')]);
  assert.equal(recovered.deadBytes, 0); assert.ok(recovered.fileBytes < big.length);
  // CRC catches corruption in the otherwise valid data region.
  const corrupt = await fs.open(file, 'r+'); await corrupt.write(Buffer.from([0]), 0, 1, recovered.entries.get(key('a'))!.offset); await corrupt.close();
  await assert.rejects(() => recovered.read(key('a')), /CRC32/);

  const distribution = path.join(root, 'distribution'); await fs.mkdir(distribution);
  const source = await Kpak.open(path.join(distribution, CACHE_BUNDLE_FILE), { salt, writable: true, create: true });
  source.database = { source: 'bundled', fetchedAt: null, cards: bundled.cards.slice(0, 1) };
  await source.append([{ key: key(cardImageIdentity(ref)), buffer: png, mime: 'image/png', meta: ref }]);
  const profile = path.join(root, 'profile'), manager = new CacheBundleInstaller(profile, distribution, { root, salt, packaged: true });
  await assert.rejects(() => manager.appendCardImages([{ ...ref, buffer: Buffer.from('not-an-image'), mime: 'image/png' }]));
  assert.equal((await manager.listCardImageKeys()).entries.length, 0, 'a failed write does not poison metadata queries');
  assert.equal((await manager.prepare())?.imageCount, 1);
  assert.deepEqual((await manager.readCardImage(ref.cardId, ref.variant, ref.url))!.buffer, png);
  assert.equal((await manager.listCardImageKeys()).entries.length, 1);
  await assert.rejects(() => fs.access(path.join(profile, 'IndexedDB')), 'installation does not create or populate IndexedDB');
  await manager.finish(); await fs.access(path.join(profile, CACHE_BUNDLE_MARKER));
  await assert.rejects(() => fs.access(path.join(distribution, CACHE_BUNDLE_FILE)));
  await fs.writeFile(path.join(distribution, CACHE_BUNDLE_FILE), 'bad');
  assert.equal(await new CacheBundleInstaller(profile, distribution, { root, salt }).prepare(), null, 'completed install skips sidecar');
  await manager.deleteCardImages([ref]); assert.equal((await manager.listCardImageKeys()).entries.length, 0);
  await manager.compactCardPack(); assert.equal((await manager.listCardImageKeys()).deadBytes, 0);

  // Existing packs retain their entries while importing only missing keys.
  await fs.unlink(path.join(distribution, CACHE_BUNDLE_FILE));
  const source2 = await Kpak.open(path.join(distribution, CACHE_BUNDLE_FILE), { salt, writable: true, create: true });
  const thumb = { ...ref, variant: 'thumb' as const, url: ref.url.replace('/zh-Hans/', '/zh-Hans/thumb/') };
  await source2.append([ref, thumb].map(meta => ({ key: key(cardImageIdentity(meta)), buffer: png, mime: 'image/png', meta })));
  const second = new CacheBundleInstaller(path.join(root, 'second'), distribution, { root, salt });
  const own = Buffer.concat([png, Buffer.from('original')]);
  await second.appendCardImages([{ ...ref, buffer: own, mime: 'image/png' }]);
  await second.prepare(); assert.deepEqual((await second.readCardImage(ref.cardId, ref.variant, ref.url))!.buffer, own);
  assert.equal((await second.listCardImageKeys()).entries.length, 2);
  await second.finish();
  // Loose mode takes priority, while packaged mode ignores private sources.
  const privateRoot = path.join(root, 'assets-private');
  await fs.mkdir(path.join(privateRoot, 'static/assets'), { recursive: true });
  await fs.writeFile(path.join(privateRoot, 'static/assets/test.png'), own);
  const staticFile = path.join(root, 'static.kpak'), statics = await Kpak.open(staticFile, { salt, writable: true, create: true });
  await statics.append([{ key: key('assets/test.png'), buffer: png, mime: 'image/png' }]);
  const loose = new CacheBundleInstaller(path.join(root, 'loose-profile'), '', { root, staticPack: staticFile, salt });
  const packed = new CacheBundleInstaller(path.join(root, 'packed-profile'), '', { root, staticPack: staticFile, salt, packaged: true });
  assert.deepEqual((await loose.readStaticAsset('/assets/test.png'))!.buffer, own);
  assert.deepEqual((await packed.readStaticAsset('/assets/test.png'))!.buffer, png);
  await assert.rejects(() => loose.readStaticAsset('/assets/../outside.png'));
  await fs.mkdir(path.join(privateRoot, 'cards'), { recursive: true });
  await fs.writeFile(path.join(privateRoot, 'cards/art.png'), own);
  await fs.writeFile(path.join(privateRoot, 'cards/manifest.json'), JSON.stringify({ version: 2, images: [{ ...ref, mime: 'image/png', file: 'art.png' }] }));
  assert.deepEqual((await loose.readCardImage(ref.cardId, ref.variant, ref.url))!.buffer, own);
  assert.equal((await loose.listCardImageKeys()).entries.length, 1);
  await loose.deleteCardImages([ref]); assert.equal(await loose.readCardImage(ref.cardId, ref.variant, ref.url), null);
  await assert.rejects(() => fs.access(path.join(privateRoot, 'cards/art.png')));
  console.log('KPAK tests passed: mask/hash, random reads, serialized tail append, rollback/recovery, CRC, delete/compaction, zero-extraction install and merge');
} finally { await fs.rm(root, { recursive: true, force: true }); }
