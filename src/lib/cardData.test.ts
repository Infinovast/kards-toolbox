import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CARD_DATA_URL, KARDS_COM_DATA_URL, collectCardData, compareCardData, fetchKardsComCardPage, fetchKardsplayerCardPage, mergeWeatherCardRecords, normalizeCardRecord, parseCardDataPage, validateCardRecords } from './cardData';

const records = JSON.parse(readFileSync('public/data/cards.json', 'utf8')).cards;
const mergedWeather = mergeWeatherCardRecords(records);
assert.equal(mergedWeather.length, 1664, 'bundled and active catalogues include 18 missing local weather variants');
assert.equal(mergedWeather.filter(card => card.cardId.startsWith('temp_')).length, 18);
const temporaryDeluge = mergedWeather.find(card => card.cardId === 'temp_deluge_1')!;
assert.equal(temporaryDeluge.json.text?.['zh-Hans'], '抑制 1 个单位，抽 1 张牌。');
assert.equal(temporaryDeluge.json.title?.['ja-JP'], mergedWeather.find(card => card.cardId === 'deluge')?.json.title?.['ja-JP'], 'variants inherit translated base-card names');
assert.ok(temporaryDeluge.imageUrl?.includes('kards-assets.kardsdecker.com/CardImgs/temporary_weathers/'));
const baseWeather = mergedWeather.filter(card => ['blue_sky', 'gale', 'mist', 'cyclone', 'deluge', 'heatwave', 'jungle_fever', 'monsoon_rain', 'scorching_sun', 'thunderstorm', 'torrential_rain', 'tropical_storm'].includes(card.cardId));
assert.equal(baseWeather.length, 12);
for (const card of baseWeather) {
  const original = records.find(record => record.cardId === card.cardId)!;
  assert.equal(card.imageUrl, original.imageUrl, `${card.cardId} retains its original full art`);
  assert.equal(card.thumbUrl, original.thumbUrl, `${card.cardId} retains its original thumbnail`);
}
assert.deepEqual(mergeWeatherCardRecords(mergedWeather), mergedWeather, 'supplement merging is idempotent');
const legacyWeather = mergedWeather.map(card => baseWeather.some(base => base.cardId === card.cardId) ? {
  ...card, imageUrl: card.imageUrl!.replace('www.kardsplayer.com', 'www.kards.com'), thumbUrl: card.thumbUrl!.replace('www.kardsplayer.com', 'www.kards.com'),
} : card);
assert.deepEqual(mergeWeatherCardRecords(legacyWeather), mergedWeather, 'existing snapshots with broken base-weather URLs repair on load');
const updatedWeather = { ...baseWeather[0], imageUrl: baseWeather[0].imageUrl!.replace('/v53/', '/v55/'), thumbUrl: baseWeather[0].thumbUrl!.replace('/v53/', '/v55/'), json: { ...baseWeather[0].json, kredits: 4 } };
const futureWeather = mergeWeatherCardRecords(mergedWeather.map(card => card.cardId === updatedWeather.cardId ? updatedWeather : card)).find(card => card.cardId === updatedWeather.cardId)!;
assert.equal(futureWeather.imageUrl, updatedWeather.imageUrl);
assert.equal(futureWeather.thumbUrl, updatedWeather.thumbUrl);
assert.equal(futureWeather.json.kredits, 4, 'future source updates remain authoritative for base weather');
const local = records.slice(0, 3);
const remote = structuredClone(local);
remote[0].json.kredits++;
remote[0].json.title['zh-Hans'] += '（测试改动）';
remote[0].reserved = !remote[0].reserved;
remote[2] = records[3];
const changes = compareCardData(local, remote);
assert.deepEqual(changes.map(change => change.kind).sort(), ['added', 'changed', 'removed']);
assert.deepEqual(changes.find(change => change.kind === 'changed')!.fields.map(field => field.field).sort(), ['kredits', 'reserved', 'title.zh-Hans']);
assert.equal(local.length, remote.length, 'same-count balance changes must still be found');
const duplicateFlag = structuredClone(local);
duplicateFlag[0].json.reserved = duplicateFlag[0].reserved;
duplicateFlag[0].id++;
assert.equal(compareCardData(local, duplicateFlag).length, 0, 'transport IDs and duplicate reserved flags are not gameplay changes');
const reordered = local.map(card => ({ ...card, json: Object.fromEntries(Object.entries(card.json).reverse()) }));
assert.equal(compareCardData(local, reordered).length, 0);
assert.throws(() => validateCardRecords([]));
assert.throws(() => validateCardRecords([local[0], local[0]]));
assert.throws(() => normalizeCardRecord({ ...local[0], json: { title: { 'zh-Hans': 1 } } }));
assert.throws(() => normalizeCardRecord({ ...local[0], json: { kredits: '1' } }));
assert.throws(() => normalizeCardRecord({ ...local[0], json: { faction: {} } }));
assert.throws(() => normalizeCardRecord({ ...local[0], json: { attributes: [1] } }));

const payload = (cards = local, total = cards.length, hasNextPage = false) => ({ data: { cards: { edges: cards.map(node => ({ node })), pageInfo: { count: total, hasNextPage } } } });
assert.equal(parseCardDataPage(payload()).cards.length, 3);
assert.throws(() => parseCardDataPage({ errors: [{ message: 'Unavailable' }], ...payload() }), /Unavailable/);
assert.throws(() => parseCardDataPage(payload([], 0)));
assert.throws(() => parseCardDataPage({ data: { cards: {} } }));
let requested = false;
await fetchKardsplayerCardPage(100, (async (url, options) => {
  assert.equal(url, CARD_DATA_URL);
  const request = JSON.parse(String(options?.body));
  assert.deepEqual(request.variables, { language: 'zh', first: 100, offset: 100, showSpawnables: true, showExiles: false, showReserved: true });
  assert.ok(request.query.includes('imageUrl: image(language: $language)'));
  assert.ok(request.query.includes('thumbUrl: image(type: thumb, language: $language)'));
  requested = true;
  return new Response(JSON.stringify(payload()));
}) as typeof fetch);
assert.ok(requested);
const officialRecord = { ...local[0], id: 'gid://cards/opaque-id', imageUrl: '/images/card/v54/zh-Hans/official_card.avif', thumbUrl: '/images/card/v54/zh-Hans/thumb/official_card.avif' };
const officialPage = parseCardDataPage(payload([officialRecord], 1), 'kardscom');
assert.equal(officialPage.cards[0].imageUrl, 'https://www.kards.com/images/card/v54/zh-Hans/official_card.avif');
assert.equal(officialPage.cards[0].thumbUrl, 'https://www.kards.com/images/card/v54/zh-Hans/thumb/official_card.avif');
assert.equal(officialPage.cards[0].id, 0, 'opaque transport IDs do not discard valid catalogue cards');
await fetchKardsComCardPage(0, (async (url, options) => {
  assert.equal(url, KARDS_COM_DATA_URL);
  const request = JSON.parse(String(options?.body));
  assert.deepEqual(request.variables, { language: 'zh', first: 100, offset: 0, showSpawnables: true, showExiles: true, showReserved: true });
  assert.equal(options?.headers?.origin, 'https://www.kards.com');
  assert.ok(request.query.includes('thumbUrl: image(type: thumb, language: $language)'));
  return new Response(JSON.stringify(payload([officialRecord], 1)));
}) as typeof fetch);
const relocated = structuredClone(local);
relocated[0].imageUrl = relocated[0].imageUrl.replace('/v53/', '/v55/');
relocated[0].thumbUrl = relocated[0].thumbUrl.replace('/v53/', '/v55/');
assert.deepEqual(compareCardData(local, relocated)[0].fields.map(field => field.field), ['imageUrl', 'thumbUrl']);
assert.equal(normalizeCardRecord({ ...local[0], imageUrl: new URL(local[0].imageUrl).pathname }).imageUrl, local[0].imageUrl);
for (const url of ['https://example.com/images/card/v53/zh-Hans/card.avif', '/images/card/unknown/card.avif', '']) {
  assert.throws(() => normalizeCardRecord({ ...local[0], imageUrl: url }), /卡图地址/);
}
const missingImage = structuredClone(local);
delete missingImage[0].imageUrl;
assert.throws(() => parseCardDataPage(payload(missingImage)), /图片地址/);
const missingStats = structuredClone(local);
delete missingStats[0].json.operationCost;
assert.throws(() => parseCardDataPage(payload(missingStats)), /行动费用/);
const oldSnapshot = local.map(({ imageUrl, thumbUrl, ...card }) => card);
assert.equal(validateCardRecords(oldSnapshot).length, 3, 'older applied/rollback data must remain readable');
assert.equal(compareCardData(oldSnapshot, local).length, 3, 'migration must preview the newly supplied URLs');
await assert.rejects(() => fetchKardsplayerCardPage(-1), /分页参数/);
await assert.rejects(() => fetchKardsplayerCardPage(1.5), /分页参数/);
await assert.rejects(() => fetchKardsplayerCardPage(0, (async () => new Response('offline', { status: 503 })) as typeof fetch), /503/);

const progress: number[] = [];
const complete = await collectCardData(async offset => ({ cards: offset === 0 ? local.slice(0, 2) : local.slice(2), total: 3, hasNextPage: offset === 0 }), completed => progress.push(completed), new AbortController().signal, 0);
assert.equal(complete.length, 3);
assert.deepEqual(progress, [2, 3]);
await assert.rejects(() => collectCardData(async () => ({ cards: local.slice(0, 2), total: 3, hasNextPage: false }), () => {}, new AbortController().signal, 0), /只获取到/);
await assert.rejects(() => collectCardData(async offset => ({ cards: offset === 0 ? local.slice(0, 2) : local.slice(2), total: offset === 0 ? 3 : 4, hasNextPage: offset === 0 }), () => {}, new AbortController().signal, 0), /过程中发生变化/);
await assert.rejects(() => collectCardData(async offset => ({ cards: offset === 0 ? local.slice(0, 2) : local.slice(0, 1), total: 3, hasNextPage: offset === 0 }), () => {}, new AbortController().signal, 0), /重复卡牌/);
const abort = new AbortController();
const interrupted = collectCardData(() => new Promise(() => {}), () => {}, abort.signal, 0);
abort.abort();
await assert.rejects(() => interrupted, error => error instanceof Error && error.name === 'AbortError');
console.log('Card-data sync tests passed: same-count edits, multilingual diff, additions/removals, Kardsplayer/KARDS requests, endpoint normalization, incomplete/duplicate/changed pagination and cancellation');
