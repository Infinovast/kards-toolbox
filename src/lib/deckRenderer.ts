import { cardTitle, type KardsCardRecord } from '../types/card';
import { decodeDeckCode, findCardsByImportId } from './deckCode';
import { getCachedCardImage } from './cardImages';
import type { DeckRenderRequest } from './deckRenderTypes';
import { BUNKER_HEADQUARTERS, DEFAULT_TABLECLOTH, headquartersForDeck } from './cardAssets';
import { deckCounterNationIcon, deckRenderCounterSvg } from './deckRenderCounter';
import { deckQrSvg } from './deckImageCode';

async function imageDataUrl(url: string): Promise<string> {
  if (url.startsWith('data:')) return url;
  const response = await fetch(url);
  if (!response.ok) throw new Error('无法读取卡组图片资源');
  const blob = await response.blob();
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function renderDeckImage(code: string, cards: KardsCardRecord[], title = 'KARDS 卡组', background?: string | null, headquartersId?: string, limit = 40): Promise<string> {
  const deck = decodeDeckCode(code), index = findCardsByImportId(cards);
  const entries = [...deck.counts].sort(([a], [b]) => (index.get(a)?.json.kredits ?? 99) - (index.get(b)?.json.kredits ?? 99));
  if (background) background = await imageDataUrl(background);
  const headquarters = headquartersForDeck(headquartersId, deck.mainNation) || BUNKER_HEADQUARTERS;
  const headquartersImage = headquarters ? await imageDataUrl(headquarters.image).catch(() => null) : null;
  const request: DeckRenderRequest = { title, code, headquartersId: headquartersImage ? headquarters?.groupId : BUNKER_HEADQUARTERS?.groupId, mainNation: deck.mainNation, allyNation: deck.allyNation, limit, background: background?.startsWith('data:') ? background : null,
    headquartersImage,
    cards: await Promise.all(entries.map(async ([id, count]) => ({ id, count, name: index.has(id) ? cardTitle(index.get(id)!, 'zh-Hans') : `未知卡牌 ${id}`, rarity: index.get(id)?.json.rarity || '', faction: index.get(id)?.json.faction, image: index.has(id) ? await getCachedCardImage(index.get(id)!) : null }))) };
  if (window.kardsDesktop?.renderDeckImage) return window.kardsDesktop.renderDeckImage(request);
  return renderBrowserPreview(request, background);
}

// Browser preview uses the same ten-column layout as the desktop Sharp renderer.
async function renderBrowserPreview(request: DeckRenderRequest, background?: string | null) {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = reject; img.src = src; });
  const total = request.cards.reduce((sum, card) => sum + card.count, 0);
  if (!total || total > 999) throw new Error('生图支持 1—999 张可用牌');
  const bg = await load(background || DEFAULT_TABLECLOTH);
  const width = 2304, cols = 10, gap = 6, thumbW = Math.floor((width - 120) / cols - 6), thumbH = Math.floor(thumbW * 1.42), top = 195;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.max(1440, top + Math.ceil((total + 1) / cols) * (thumbH + gap) + 20);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建画布');
  ctx.drawImage(bg, 0, 0, width, canvas.height);
  const logo = await load('/assets/kards_logos/Common/KardsLogoWhite.png'); ctx.drawImage(logo, 40, -25, 240, 240);
  ctx.fillStyle = '#f2ead6'; ctx.font = 'bold 48px Microsoft YaHei,sans-serif'; ctx.fillText(request.title, 350, 87, 1000);
  const [mainIcon, allyIcon, totalIcon] = await Promise.all([
    imageDataUrl(`./assets/filters/${deckCounterNationIcon(request.mainNation)}.svg`),
    imageDataUrl(`./assets/filters/${deckCounterNationIcon(request.allyNation)}.svg`),
    imageDataUrl('./assets/kards_logos/Common/KardsLogoWhite_cards.png'),
  ]);
  const counter = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deckRenderCounterSvg(request, { main: mainIcon, ally: allyIcon, total: totalIcon }))}`);
  ctx.drawImage(counter, 350, 110);
  const qr = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deckQrSvg(request.code, request.headquartersId, request.title))}`);
  ctx.drawImage(qr, 60 + (cols - 1) * (thumbW + gap) + thumbW - qr.width - 8, Math.round((top - qr.height) / 2) + 8);
  const rarities = ['Elite', 'Special', 'Limited', 'Standard'];
  for (let i = 0; i < 4; i++) {
    const rarity = rarities[i], x = width - 650 + i % 2 * 180, y = 27 + Math.floor(i / 2) * 72;
    const icon = await load(`./assets/filters/${rarity.toLowerCase()}.svg`);
    const scale = Math.min(64 / icon.width, 64 / icon.height), iconW = icon.width * scale, iconH = icon.height * scale;
    ctx.drawImage(icon, x + (64 - iconW) / 2, y + 4 + (64 - iconH) / 2, iconW, iconH);
    ctx.font = 'bold 44px Microsoft YaHei,sans-serif'; ctx.fillText(String(request.cards.filter(c => c.rarity === rarity).reduce((sum, c) => sum + c.count, 0)), x + 72, y + 54);
  }
  let position = 0;
  const bunkerImage = BUNKER_HEADQUARTERS?.image;
  for (const card of [...request.cards, { id: 'HQ', name: '地堡', rarity: '', count: 1, image: request.headquartersImage || bunkerImage }]) {
    let image = card.image ? await load(card.image).catch(() => null) : null;
    if (card.id === 'HQ' && !image && bunkerImage) image = await load(bunkerImage).catch(() => null);
    for (let n = 0; n < card.count; n++, position++) {
      const x = 60 + position % cols * (thumbW + gap), y = top + Math.floor(position / cols) * (thumbH + gap);
      if (image) { const scale = Math.max(thumbW / image.width, thumbH / image.height), sw = thumbW / scale, sh = thumbH / scale; ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, thumbW, thumbH); }
      else { ctx.fillStyle = '#e6e1d4'; ctx.fillRect(x, y, thumbW, thumbH); ctx.fillStyle = '#333'; ctx.font = '18px Microsoft YaHei,sans-serif'; ctx.fillText(card.name, x + 10, y + thumbH / 2, thumbW - 20); ctx.font = '14px Microsoft YaHei,sans-serif'; ctx.fillText('未缓存卡图', x + 10, y + thumbH / 2 + 36); }
    }
  }
  return canvas.toDataURL('image/png');
}
export function downloadDeckImage(data: string, name: string) {
  const link = document.createElement('a'); link.href = data;
  link.download = `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'kards-deck'}.png`; link.click();
}
