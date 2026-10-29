import assert from 'node:assert/strict';
import sharp from 'sharp';
import { recognizeDeckImage } from './windowsOcr';

if (process.platform === 'win32') {
  const image = await sharp(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="240"><rect width="100%" height="100%" fill="white"/><text x="40" y="130" font-family="Arial" font-size="56" fill="black">Test Infantry</text></svg>')).png().toBuffer();
  const result = await recognizeDeckImage(`data:image/png;base64,${image.toString('base64')}`);
  assert.ok(result.passes.some(pass => pass.lines.some(line => /test\s+infantry/i.test(line))), 'actual Windows OCR recognizes the generated text');
  await assert.rejects(recognizeDeckImage('data:text/plain;base64,aGVsbG8='), /无效卡组图片/);
  console.log('Windows OCR test passed with installed local recognizers');
}
