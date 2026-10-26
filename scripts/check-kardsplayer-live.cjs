// Optional live network check in an isolated profile; never applies a catalogue.
// No screenshots, image decoding, dimensions or pixel comparisons.
const { _electron: electron } = require('playwright/test');
const fs = require('node:fs/promises');
const path = require('node:path');
const assert = require('node:assert/strict');

async function main() {
  const root = path.resolve(__dirname, '..');
  const out = path.join(root, 'test-results', 'kardsplayer');
  await fs.mkdir(out, { recursive: true });
  const profile = await fs.mkdtemp(path.join(out, 'live-profile-'));
  const packaged = process.argv[2] ? path.resolve(process.argv[2]) : null;
  const env = { ...process.env, KARDS_USE_DIST: '1' };
  delete env.ELECTRON_RUN_AS_NODE;
  const app = await electron.launch({ executablePath: packaged || require('electron'), args: [...(packaged ? [] : [root]), `--user-data-dir=${profile}`, '--disable-crash-reporter'], env });
  try {
    const page = await app.firstWindow();
    await page.waitForURL('kards://app/index.html');
    const all = [];
    let total = 0, pages = 0;
    while (true) {
      const result = await page.evaluate(offset => window.kardsDesktop.fetchCardDataPage(offset), all.length);
      if (total) assert.equal(result.total, total);
      total = result.total;
      all.push(...result.cards); pages++;
      assert.ok(all.length <= total);
      if (!result.hasNextPage) break;
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
    assert.equal(all.length, total);
    assert.equal(new Set(all.map(c => c.importId)).size, total);
    assert.equal(new Set(all.map(c => c.cardId)).size, total);
    console.log(`Fetched ${pages} pages, ${total} cards from Kardsplayer`);
    const samples = [];
    for (const cardId of ['50_infantry_regiment', '50_infantry_regiment_vet']) {
      const card = all.find(c => c.cardId === cardId);
      assert.ok(card && card.imageUrl && card.thumbUrl);
      const files = [];
      for (const url of [card.imageUrl, card.thumbUrl]) {
        let data;
        try { data = await page.evaluate(url => window.kardsDesktop.fetchCardImage(url), url); }
        catch (error) { throw new Error(`Image IPC failed for ${url}`, { cause: error }); }
        assert.ok(data.startsWith('data:image/avif;base64,'));
        const bytes = Buffer.from(data.split(',')[1], 'base64');
        assert.equal(bytes.subarray(4, 8).toString(), 'ftyp');
        assert.ok(bytes.length > 100);
        files.push({ url, bytes: bytes.length, mime: 'image/avif' });
        console.log(`Verified ${url} (${bytes.length} bytes)`);
      }
      samples.push({ cardId, importId: card.importId, attack: card.json.attack, defense: card.json.defense, kredits: card.json.kredits, operationCost: card.json.operationCost, attributes: card.json.attributes, files });
    }
    await assert.rejects(() => page.evaluate(() => window.kardsDesktop.fetchCardImage('https://example.com/a.avif')), /卡图地址无效/);
    const report = { status: 'passed', fetchedAt: new Date().toISOString(), source: 'https://api.kardsplayer.com/graphql', pages, total, samples, imageInspection: false, applied: false };
    await fs.writeFile(path.join(out, 'live.json'), JSON.stringify(report, null, 2));
    console.log(`Live Kardsplayer check passed: ${pages} pages, ${total} cards, four original AVIF files through the production IPC; no data applied`);
  } finally {
    await app.close();
    if (path.dirname(profile) === out && path.basename(profile).startsWith('live-profile-')) await fs.rm(profile, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
