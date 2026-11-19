import assert from 'node:assert/strict';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { deckQrSvg, readImageDeckCode } from './deckImageCode';
import { encodeDeckCode } from './deckCode';
import { CARD_BACKS, headquartersOptions } from './cardAssets';
const code = encodeDeckCode('Germany', 'Soviet', new Map([['aa', 3], ['bb', 2]]));
const hq = headquartersOptions('Germany').find(item => item.groupId === 'Germany/villers_bocage')!;
assert.ok(hq);
const cardBackId = 'cardback-039';
const svg = deckQrSvg(code, hq.groupId, '测试卡组 · 守卫', cardBackId);
const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.ok(info.width <= 176 && info.width === info.height);
const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height);
assert.ok(qr, 'white borderless QR remains readable at export size');
assert.deepEqual(readImageDeckCode(qr.data), { code, headquartersId: hq.groupId, cardBackId, name: '测试卡组 · 守卫' });

const fullDeck = '%%31|3X5C6BhHm6qCqDrktFvhwJx5;66nwx0x3;3f4p6x7e7l;5Z';
const fullTitle = '中文卡组测试';
const mini = Buffer.from(deckQrSvg(fullDeck, undefined, fullTitle, undefined, 192));
const miniInfo = await sharp(mini).metadata();
const cover = await sharp({ create: { width: 1368, height: 968, channels: 3, background: '#978B6F' } })
  .composite([{ input: mini, left: 1368 - 24 - miniInfo.width!, top: 40 }])
  .ensureAlpha().raw().toBuffer();
const miniQr = jsQR(new Uint8ClampedArray(cover), 1368, 968);
assert.ok(miniQr, 'mini cover QR remains readable against a textured deck cover');
assert.equal(readImageDeckCode(miniQr.data)?.code, fullDeck);
assert.equal(readImageDeckCode(miniQr.data)?.name, fullTitle);

assert.deepEqual(readImageDeckCode(code), { code, headquartersId: undefined });
assert.deepEqual(readImageDeckCode(JSON.stringify({ version: 1, code, headquartersId: hq.groupId, name: '旧图片' })), { code, headquartersId: hq.groupId, name: '旧图片' });
for (const back of [CARD_BACKS.find(back => back.scope === 'common')!.id, 'cardback-058', 'custom:1230.456']) {
  assert.equal(readImageDeckCode(JSON.stringify({ version: 1, code, headquartersId: hq.groupId, cardBackId: back }))?.cardBackId, back);
}
for (const back of ['cardback-012', 'unknown-back', 'https://example.com/card.png', '../outside', 123]) {
  const parsed = readImageDeckCode(JSON.stringify({ version: 1, code, headquartersId: hq.groupId, cardBackId: back }));
  assert.equal(parsed?.code, code, 'unavailable artwork must not prevent importing a valid deck');
  assert.equal(parsed?.cardBackId, undefined);
}
for (const invalid of ['https://example.com', '%%31|broken', '{"version":2}', JSON.stringify({ version: 1, code, headquartersId: 'Japan/truk' }), JSON.stringify({ version: 1, code, headquartersId: '../outside' })]) {
  assert.equal(readImageDeckCode(invalid), null, invalid);
}
console.log('Deck image tests passed: decodable export QR, headquarters/card back round trip, legacy payloads and invalid artwork');
