import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { brotliCompressSync } from 'node:zlib';
import { CacheBundleInstaller } from './cacheBundle';
import { CACHE_BUNDLE_FILE, CACHE_BUNDLE_FORMAT, CACHE_BUNDLE_MARKER } from '../src/lib/cacheBundleFormat';
import bundled from '../public/data/cards.json';

const root = await fs.mkdtemp(path.join(os.tmpdir(), 'kards-cache-bundle-'));
const image = { key: 'kards_card_image_v2_rV_https%3A%2F%2Fwww.kardsplayer.com%2Fimages%2Fcard%2Fv53%2Fzh-Hans%2F13e_dragons.avif', value: 'data:image/png;base64,aGVsbG8=' };
const header = { format: CACHE_BUNDLE_FORMAT, schemaVersion: 1, createdAt: new Date().toISOString(), database: { source: 'bundled', fetchedAt: null, cards: bundled.cards.slice(0, 1) } };
const records = [header, image, { complete: true, imageCount: 1 }];
const bytes = (items: unknown[]) => brotliCompressSync(Buffer.from(items.map(item => JSON.stringify(item)).join('\n') + '\n'));

try {
  const profile = path.join(root, 'profile');
  const distribution = path.join(root, 'distribution');
  await fs.mkdir(distribution);
  const installer = new CacheBundleInstaller(profile, distribution);
  assert.equal(await installer.prepare(), null, 'ordinary releases need no cache package');
  await fs.writeFile(path.join(distribution, CACHE_BUNDLE_FILE), bytes(records));
  const first = new CacheBundleInstaller(profile, distribution);
  assert.equal((await first.prepare())?.imageCount, 1);
  assert.deepEqual(await first.readImage(0), image);
  await assert.rejects(() => first.readImage(-1), /编号/);
  await assert.rejects(() => first.readImage(1), /编号/);
  // An interrupted import can re-extract, then finish only after persistence.
  const resumed = new CacheBundleInstaller(profile, distribution);
  assert.equal((await resumed.prepare())?.database.cards.length, 1);
  await resumed.finish();
  assert.equal(await resumed.prepare(), null, 'renderer reload after completion skips import');
  assert.ok(await fs.stat(path.join(profile, CACHE_BUNDLE_MARKER)));
  await assert.rejects(() => fs.access(path.join(distribution, CACHE_BUNDLE_FILE)));
  await assert.rejects(() => fs.access(path.join(profile, 'full-cache-staging')));
  // A completed profile does not even try to parse a replacement package.
  await fs.writeFile(path.join(distribution, CACHE_BUNDLE_FILE), 'invalid');
  assert.equal(await new CacheBundleInstaller(profile, distribution).prepare(), null);

  const invalidPackages = [
    bytes([header, image]),
    bytes([header, image, image, { complete: true, imageCount: 2 }]),
    bytes([header, { key: 'kards_decks', value: image.value }, { complete: true, imageCount: 1 }]),
    bytes([header, { ...image, value: '<html>invalid</html>' }, { complete: true, imageCount: 1 }]),
    bytes([header, image, { complete: true, imageCount: 2 }]),
    bytes(records).subarray(0, 30),
  ];
  for (let index = 0; index < invalidPackages.length; index++) {
    const failedProfile = path.join(root, `failed-${index}`);
    await fs.writeFile(path.join(distribution, CACHE_BUNDLE_FILE), invalidPackages[index]);
    const failed = new CacheBundleInstaller(failedProfile, distribution);
    await assert.rejects(() => failed.prepare());
    await assert.rejects(() => fs.access(path.join(failedProfile, CACHE_BUNDLE_MARKER)));
    assert.ok(await fs.stat(path.join(distribution, CACHE_BUNDLE_FILE)), 'failure retains source package for retry');
    // The same process can retry after replacing the failed download.
    await fs.writeFile(path.join(distribution, CACHE_BUNDLE_FILE), bytes(records));
    assert.equal((await failed.prepare())?.imageCount, 1);
  }
  console.log('Cache bundle extraction, completion, interruption and corruption tests passed');
} finally {
  await fs.rm(root, { recursive: true, force: true });
}
