import { cardTitle, type KardsCardRecord } from '../types/card';
import { decodeDeckCode, findCardsByImportId } from './deckCode';
import { getCachedCardImage } from './cardImages';
import type { DeckRenderRequest } from './deckRenderTypes';
import { BUNKER_HEADQUARTERS, DEFAULT_TABLECLOTH, headquartersForDeck } from './cardAssets';
import { deckRenderCounterSvg } from './deckRenderCounter';
import { deckQrSvg } from './deckImageCode';
import { defaultDeckName } from './deckName';
import { factionIcon, LOGOS, RARITY_ICONS } from './assetCatalog';
import { summarizeDeckCosts } from './deckCostCurve';
import { DECK_BACKGROUND_BLUR, DECK_BACKGROUND_TINT, DECK_STATISTICS_POSITION, deckHeaderTitle, deckStatisticsSvg } from './deckRenderHeader';

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

export async function renderDeckImage(code: string, cards: KardsCardRecord[], title = '', background?: string | null, headquartersId?: string, limit = 40, cardBackId?: string, alternateArt?: ReadonlyMap<string, string>): Promise<string> {
  const deck = decodeDeckCode(code), index = findCardsByImportId(cards);
  title = title.trim() || defaultDeckName(deck.mainNation, deck.allyNation);
  const nativeRender = window.kardsDesktop?.renderDeckImage;
  const entries = [...deck.counts].sort(([a], [b]) => (index.get(a)?.json.kredits ?? 99) - (index.get(b)?.json.kredits ?? 99));
  const headquarters = headquartersForDeck(headquartersId, deck.mainNation) || BUNKER_HEADQUARTERS;
  const costs = summarizeDeckCosts(deck.counts, index);
  const request: DeckRenderRequest = { title, code, headquartersId: headquarters?.groupId, cardBackId, mainNation: deck.mainNation, allyNation: deck.allyNation, limit, background: background || null,
    headquartersImage: headquarters?.image,
    statistics: { curve: costs.buckets.map(bucket => bucket.total), totals: costs.totals },
    cards: await Promise.all(entries.map(async ([id, count]) => {
      const card = index.get(id);
      const selected = card && alternateArt?.get(card.cardId);
      return { id, count, name: card ? cardTitle(card, 'zh-Hans') : `未知卡牌 ${id}`, rarity: card?.json.rarity || '', faction: card?.json.faction, cardId: card?.cardId, imageUrl: card?.imageUrl, image: selected || (!nativeRender && card ? await getCachedCardImage(card) : null) };
    })),
  };
  if (nativeRender) return nativeRender(request);
  return renderCanvasImage(request);
}

function drawWordmark(ctx: CanvasRenderingContext2D, logo: HTMLImageElement) {
  // The logo file has transparent padding. Find its visible bounds on a small
  // canvas so the exported wordmark aligns with the old desktop layout.
  const preview = document.createElement('canvas');
  const size = 128;
  preview.width = preview.height = size;
  const sample = preview.getContext('2d', { willReadFrequently: true });
  if (!sample) return;
  sample.drawImage(logo, 0, 0, size, size);
  const pixels = sample.getImageData(0, 0, size, size).data;
  let left = size, right = 0, top = size, bottom = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (pixels[(y * size + x) * 4 + 3] <= 10) continue;
      left = Math.min(left, x); right = Math.max(right, x + 1);
      top = Math.min(top, y); bottom = Math.max(bottom, y + 1);
    }
  }
  if (right <= left || bottom <= top) return;
  const unitX = logo.naturalWidth / size;
  const unitY = logo.naturalHeight / size;
  const width = (right - left) * unitX;
  const height = (bottom - top) * unitY;
  ctx.drawImage(logo, left * unitX, top * unitY, width, height, 60, 24, width * 130 / height, 130);
}

async function renderCanvasImage(request: DeckRenderRequest) {
  const load = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => resolve(img); img.onerror = () => reject(new Error('无法读取卡组图片资源')); img.src = src; });
  const total = request.cards.reduce((sum, card) => sum + card.count, 0);
  if (!total || total > 999) throw new Error('生图支持 1—999 张可用牌');
  const bunkerImage = BUNKER_HEADQUARTERS?.image;
  const [bg, logo, selectedHeadquarters] = await Promise.all([
    load(request.background || DEFAULT_TABLECLOTH),
    load(LOGOS.wordmark.white),
    request.headquartersImage ? load(request.headquartersImage).catch(() => null) : null,
  ]);
  const width = 2304, cols = 10, gap = 6, thumbW = Math.floor((width - 120) / cols - 6), thumbH = Math.floor(thumbW * 1.42), top = 195;
  const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = Math.max(1440, top + Math.ceil((total + 1) / cols) * (thumbH + gap) + 20);
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建画布');
  ctx.imageSmoothingQuality = 'high';
  const font = '"Microsoft YaHei", Arial, sans-serif';
  const margin = DECK_BACKGROUND_BLUR * 2, scale = Math.max((width + margin * 2) / bg.width, (canvas.height + margin * 2) / bg.height);
  ctx.filter = `blur(${DECK_BACKGROUND_BLUR}px)`;
  ctx.drawImage(bg, (width - bg.width * scale) / 2, (canvas.height - bg.height * scale) / 2, bg.width * scale, bg.height * scale);
  ctx.filter = 'none';
  ctx.fillStyle = `rgba(0,0,0,${DECK_BACKGROUND_TINT})`; ctx.fillRect(0, 0, width, canvas.height);
  drawWordmark(ctx, logo);
  ctx.fillStyle = '#f2ead6'; ctx.font = `bold 48px ${font}`; ctx.fillText(deckHeaderTitle(request.title), 350, 87, 580);
  const [mainIcon, allyIcon, totalIcon] = await Promise.all([
    imageDataUrl(factionIcon(request.mainNation, 'white')),
    imageDataUrl(factionIcon(request.allyNation, 'white')),
    imageDataUrl(LOGOS.cards.white),
  ]);
  const counter = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deckRenderCounterSvg(request, { main: mainIcon, ally: allyIcon, total: totalIcon }))}`);
  ctx.drawImage(counter, 350, 110);
  const statistics = deckStatisticsSvg(request.statistics);
  if (statistics) ctx.drawImage(await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(statistics)}`), DECK_STATISTICS_POSITION.left, DECK_STATISTICS_POSITION.top);
  const headquartersId = selectedHeadquarters ? request.headquartersId : BUNKER_HEADQUARTERS?.groupId;
  const qr = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deckQrSvg(request.code, headquartersId, request.title, request.cardBackId))}`);
  ctx.drawImage(qr, 60 + (cols - 1) * (thumbW + gap) + thumbW - qr.width - 8, Math.round((top - qr.height) / 2) + 8);
  const rarities = ['Elite', 'Special', 'Limited', 'Standard'];
  for (let i = 0; i < 4; i++) {
    const rarity = rarities[i], x = width - 650 + i % 2 * 180, y = 27 + Math.floor(i / 2) * 72;
    const icon = await load(RARITY_ICONS[rarity]);
    const scale = Math.min(64 / icon.width, 64 / icon.height), iconW = icon.width * scale, iconH = icon.height * scale;
    ctx.drawImage(icon, x + (64 - iconW) / 2, y + 4 + (64 - iconH) / 2, iconW, iconH);
    ctx.fillStyle = '#e4d6b6'; ctx.font = `bold 44px ${font}`; ctx.fillText(String(request.cards.filter(c => c.rarity === rarity).reduce((sum, c) => sum + c.count, 0)), x + 72, y + 54);
  }
  let position = 0;
  const illustrations = await Promise.all(request.cards.map(async card => ({
    ...card, image: card.image ? await load(card.image).catch(() => null) : null,
  })));
  const headquartersImage = selectedHeadquarters || (bunkerImage ? await load(bunkerImage).catch(() => null) : null);
  for (const card of [...illustrations, { id: 'HQ', name: '地堡', count: 1, image: headquartersImage }]) {
    const image = card.image;
    for (let n = 0; n < card.count; n++, position++) {
      const x = 60 + position % cols * (thumbW + gap), y = top + Math.floor(position / cols) * (thumbH + gap);
      if (image) { const scale = Math.max(thumbW / image.width, thumbH / image.height), sw = thumbW / scale, sh = thumbH / scale; ctx.drawImage(image, (image.width - sw) / 2, (image.height - sh) / 2, sw, sh, x, y, thumbW, thumbH); }
      else {
        ctx.fillStyle = '#e6e1d4'; ctx.fillRect(x, y, thumbW, thumbH);
        ctx.textAlign = 'center';
        ctx.fillStyle = '#333'; ctx.font = `18px ${font}`; ctx.fillText(card.name, x + thumbW / 2, y + thumbH * 0.45, thumbW - 20);
        ctx.fillStyle = '#555'; ctx.font = `14px ${font}`; ctx.fillText(`未缓存卡图 · ${card.id}`, x + thumbW / 2, y + thumbH * 0.57, thumbW - 20);
      }
    }
  }
  return canvas.toDataURL('image/png');
}
export async function downloadDeckImage(data: string, name: string) {
  const filename = `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'kards-deck'}.png`;
  if (window.kardsDesktop?.saveDeckImage) {
    await window.kardsDesktop.saveDeckImage(data, filename);
    return;
  }
  const link = document.createElement('a'); link.href = data;
  link.download = filename; link.click();
}

export { renderDeckMiniImage } from './deckMiniRenderer';
