import assert from 'node:assert/strict';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { deckQrSvg, readImageDeckCode } from './deckImageCode';
import { deckFromOcrLines } from './deckImageImport';
import { decodeDeckCode, encodeDeckCode } from './deckCode';
import { headquartersOptions } from './cardAssets';
import type { KardsCardRecord } from '../types/card';

const cards: KardsCardRecord[] = [
  { id: 1, cardId: 'infantry', importId: 'aa', json: { title: { 'zh-Hans': '测试步兵团', 'en-EN': 'Test Infantry' }, faction: 'Germany', type: 'infantry', set: 'Base' } },
  { id: 2, cardId: 'tank', importId: 'bb', json: { title: { 'zh-Hans': '测试坦克', 'en-EN': 'Test Tank' }, faction: 'Soviet', type: 'tank', set: 'Base' } },
];
const code = encodeDeckCode('Germany', 'Soviet', new Map([['aa', 3], ['bb', 2]]));
const hq = headquartersOptions('Germany').find(item => item.groupId === 'Germany/villers_bocage')!;
assert.ok(hq);
const svg = deckQrSvg(code, hq.groupId, '测试卡组 · 守卫');
const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
assert.ok(info.width <= 176 && info.width === info.height);
const qr = jsQR(new Uint8ClampedArray(data), info.width, info.height);
assert.ok(qr, 'white borderless QR remains readable at export size');
assert.deepEqual(readImageDeckCode(qr.data), { code, headquartersId: hq.groupId, name: '测试卡组 · 守卫' });
assert.deepEqual(readImageDeckCode(code), { code, headquartersId: undefined });
for (const invalid of ['https://example.com', '%%31|broken', '{"version":2}', JSON.stringify({ version: 1, code, headquartersId: 'Japan/truk' }), JSON.stringify({ version: 1, code, headquartersId: '../outside' })]) {
  assert.equal(readImageDeckCode(invalid), null, invalid);
}
const lines = ['KARDS', '机械先锋', '3x (1 K) 测 试 步 兵 团', '测试坦克 ×2', 'unrecognized text', 'Villers-Bocage'];
const recognized = deckFromOcrLines(lines, cards)!;
assert.equal(recognized.headquartersId, hq.groupId);
assert.equal(recognized.name, '机械先锋');
assert.deepEqual(decodeDeckCode(recognized.code), decodeDeckCode(code));
assert.equal(decodeDeckCode(deckFromOcrLines(['3x （ 1 K) Test Infantry'], cards)!.code).counts.get('aa'), 3);
assert.deepEqual(decodeDeckCode(deckFromOcrLines(['Test Infantry', 'Test Infantry', 'Test Tank'], cards)!.code).counts, new Map([['aa', 2], ['bb', 1]]));
assert.equal(deckFromOcrLines(['unrecognized text', 'Deployment: Test Infantry gains +1'], cards), null);
assert.equal(deckFromOcrLines(['Test Infantry'], [...cards, { ...cards[0], importId: 'cc' }]), null, 'ambiguous names do not guess');
assert.equal(deckFromOcrLines(['Test Infantry'], [{ ...cards[0], json: { ...cards[0].json, set: 'Special' } }]), null, 'unbuildable variants are not imported by name');
assert.deepEqual(deckFromOcrLines([code], cards), { code, headquartersId: undefined });
console.log('Deck image tests passed: decodable export QR, headquarters round trip, invalid payloads and conservative multilingual OCR lists');
