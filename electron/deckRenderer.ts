// Compose deck images from bundled assets and cached artwork without network access.
import sharp, { type OverlayOptions } from 'sharp';
import fs from 'fs';
import path from 'path';
import type { DeckRenderRequest } from '../src/lib/deckRenderTypes';
import { deckCounterNationIcon, deckRenderCounterSvg } from '../src/lib/deckRenderCounter';
import { BUNKER_HEADQUARTERS, DEFAULT_TABLECLOTH } from '../src/lib/cardAssets';
import { deckQrSvg } from '../src/lib/deckImageCode';

const safe = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!);
const svg = (width: number, height: number, body: string) => Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><style>text{font-family:Microsoft YaHei,Arial,sans-serif}</style>${body}</svg>`);
function cachedBuffer(value: string | null | undefined) {
  if (!value) return null;
  if (!/^data:image\/(png|jpeg|webp|avif|gif);base64,[A-Za-z0-9+/=]+$/.test(value)) throw new Error('卡图缓存格式无效');
  return Buffer.from(value.slice(value.indexOf(',') + 1), 'base64');
}
export async function renderDeckImage(request: DeckRenderRequest): Promise<string> {
  const total = request.cards.reduce((sum, c) => sum + c.count, 0);
  if (!Number.isInteger(total) || total < 1 || total > 999 || request.cards.some(c => !Number.isInteger(c.count) || c.count < 1)) throw new Error('生图支持 1—999 张可用牌');
  const packedAssets = path.join(__dirname, '..', 'dist', 'assets');
  const asset = (file: string) => fs.readFileSync(path.join(packedAssets, file.replace(/^\/assets\//, '')));
  const bg = cachedBuffer(request.background) || asset(DEFAULT_TABLECLOTH);
  // Keep export geometry independent of a user wallpaper's source resolution.
  const canvasW = 2304, cols = 10, pad = 6;
  const thumbW = Math.floor((canvasW - 120) / cols - 6);
  const thumbH = Math.floor(thumbW * 1.42), gridStartY = 195;
  const canvasH = Math.max(1440, gridStartY + Math.ceil((total + 1) / cols) * (thumbH + pad) + 20);
  const base = sharp(bg).resize(canvasW, canvasH, { fit: 'cover' });
  const composites: OverlayOptions[] = [];
  let position = 0;
  for (const card of request.cards) {
    const art = cachedBuffer(card.image);
    const thumb = art ? await sharp(art).resize(thumbW, thumbH, { fit: 'cover' }).png().toBuffer()
      : svg(thumbW, thumbH, `<rect width="100%" height="100%" fill="#e6e1d4"/><text x="50%" y="45%" text-anchor="middle" font-size="18" fill="#333">${safe(card.name).slice(0, 150)}</text><text x="50%" y="57%" text-anchor="middle" font-size="14" fill="#555">未缓存卡图 · ${safe(card.id)}</text>`);
    for (let n = 0; n < card.count; n++, position++) composites.push({ input: thumb, left: 60 + position % cols * (thumbW + pad), top: gridStartY + Math.floor(position / cols) * (thumbH + pad) });
  }
  const selectedHeadquarters = cachedBuffer(request.headquartersImage);
  const headquarters = selectedHeadquarters
    ? await sharp(selectedHeadquarters).resize(thumbW, thumbH, { fit: 'cover' }).png().toBuffer().catch(() => null)
    : null;
  const bunker = headquarters || (BUNKER_HEADQUARTERS
    ? await sharp(asset(BUNKER_HEADQUARTERS.image)).resize(thumbW, thumbH, { fit: 'cover' }).png().toBuffer()
    : svg(thumbW, thumbH, '<rect width="100%" height="100%" fill="#e6e1d4"/><text x="50%" y="50%" text-anchor="middle" font-size="24" fill="#333">地堡</text>'));
  composites.push({ input: bunker, left: 60 + position % cols * (thumbW + pad), top: gridStartY + Math.floor(position / cols) * (thumbH + pad) });
  const logo = await sharp(asset('/assets/kards_logos/Common/KardsLogoWhite.png')).trim().resize({ height: 130 }).png().toBuffer();
  composites.push({ input: logo, left: 60, top: 24 });
  composites.push({ input: svg(1100, 85, `<text x="0" y="72" font-size="48" font-weight="700" fill="#f2ead6">${safe(request.title.slice(0, 24))}</text>`), left: 350, top: 15 });
  const nationIcon = (nation: string) => `data:image/svg+xml;base64,${asset(`/assets/filters/${deckCounterNationIcon(nation)}.svg`).toString('base64')}`;
  const counter = deckRenderCounterSvg(request, {
    main: nationIcon(request.mainNation), ally: nationIcon(request.allyNation),
    total: `data:image/png;base64,${asset('/assets/kards_logos/Common/KardsLogoWhite_cards.png').toString('base64')}`,
  });
  composites.push({ input: Buffer.from(counter), left: 350, top: 110 });
  const qr = await sharp(Buffer.from(deckQrSvg(request.code, request.headquartersId, request.title))).png().toBuffer();
  const qrWidth = (await sharp(qr).metadata()).width!;
  composites.push({ input: qr, left: 60 + (cols - 1) * (thumbW + pad) + thumbW - qrWidth - 8, top: Math.round((gridStartY - qrWidth) / 2) + 8 });
  const rarities = ['Elite', 'Special', 'Limited', 'Standard'];
  for (let i = 0; i < rarities.length; i++) {
    const rarity = rarities[i], x = canvasW - 650 + i % 2 * 180, y = 27 + Math.floor(i / 2) * 72;
    const icon = await sharp(asset(`/assets/filters/${rarity.toLowerCase()}.svg`)).resize(64, 64, { fit: 'contain', background: '#00000000' }).png().toBuffer();
    const count = request.cards.filter(c => c.rarity === rarity).reduce((sum, c) => sum + c.count, 0);
    composites.push({ input: icon, left: x, top: y + 4 }, { input: svg(100, 72, `<text x="0" y="54" font-size="44" font-weight="700" fill="#e4d6b6">${count}</text>`), left: x + 72, top: y });
  }
  const output = await base.composite(composites).png().toBuffer();
  return `data:image/png;base64,${output.toString('base64')}`;
}
