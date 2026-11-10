import assert from 'node:assert/strict';
import sharp from 'sharp';
import { deckHeaderTitle, deckStatisticsSvg } from './deckRenderHeader';
import { DECK_COST_CATEGORIES } from './deckCostCurve';

const chart = deckStatisticsSvg({ curve: [0, 4, 8, 12, 6, 5, 2, 2], totals: { army: 26, air: 7, order: 5, countermeasure: 1 } });
for (const [key, label, total] of [['army', '陆', 26], ['air', '空', 7], ['order', '指', 5], ['countermeasure', '反', 1]]) {
  assert.match(chart, new RegExp(`data-category="${key}"[^>]*>${label} <tspan font-weight="700">${total}</tspan>`));
}
assert.ok(chart.includes('>7+</text>'));
assert.ok(!/NaN|Infinity/.test(chart));
const { data, info } = await sharp(Buffer.from(chart)).removeAlpha().raw().toBuffer({ resolveWithObject: true });
assert.equal(info.width, 650);
assert.equal(info.height, 174);
for (const { color } of DECK_COST_CATEGORIES) {
  const rgb = color.slice(1).match(/../g)!.map(value => parseInt(value, 16));
  let pixels = 0;
  for (let offset = 0; offset < data.length; offset += 3) if (rgb.every((value, channel) => data[offset + channel] === value)) pixels++;
  assert.ok(pixels > 100, `${color} remains visible even for a one-card sector`);
}
const single = deckStatisticsSvg({ curve: [0, 39, 0, 0, 0, 0, 0, 0], totals: { army: 39, air: 0, order: 0, countermeasure: 0 } });
assert.match(single, /<circle[^>]+fill="#416849"/);
assert.equal((single.match(/data-category=/g) || []).length, 1, 'zero-count categories do not create slices or labels');
const empty = deckStatisticsSvg({ curve: [], totals: { army: 0, air: 0, order: 0, countermeasure: 0 } });
assert.ok(!/NaN|Infinity/.test(empty));
await sharp(Buffer.from(empty)).png().toBuffer();
assert.equal(deckStatisticsSvg(), '', 'older desktop render requests remain supported');
assert.equal(deckHeaderTitle('守卫'), '守卫');
assert.ok(deckHeaderTitle('这是一副标题很长需要给中间图表留出位置的卡组').endsWith('…'));
console.log('Deck image header tests passed: four labeled sectors, shared colors, 7+ bucket, single/empty pies and bounded titles');
