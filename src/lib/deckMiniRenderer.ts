import { factionLabel, type KardsCardRecord } from '../types/card';
import { FACTION_ASSETS, WILDCARDS, factionIcon } from './assetCatalog';
import { BUNKER_HEADQUARTERS, DEFAULT_TABLECLOTH, cardBackForDeck, headquartersForDeck } from './cardAssets';
import { findCardsByImportId } from './deckCode';
import { summarizeDeckCover } from './deckCover';
import { deckQrSvg } from './deckImageCode';
import { getCachedCardImage } from './cardImages';

const WIDTH = 342, HEIGHT = 242, RESOLUTION = 4;

const load = (url: string) => new Promise<HTMLImageElement>((resolve, reject) => {
  const image = new Image(); image.crossOrigin = 'anonymous'; image.onload = () => resolve(image); image.onerror = () => reject(new Error('无法读取分享图资源')); image.src = url;
});

/** Local PNG cover with the same summary and featured-card choice as preset decks. */
export async function renderDeckMiniImage(code: string, cards: KardsCardRecord[], title: string, background?: string, headquartersId?: string, cardBackUrl?: string, cardBackId?: string): Promise<string> {
  const summary = summarizeDeckCover(code, findCardsByImportId(cards));
  const headquarters = headquartersForDeck(headquartersId, summary.mainNation) || BUNKER_HEADQUARTERS;
  const cachedArt = summary.featured ? await getCachedCardImage(summary.featured) : null;
  const [wallpaper, mainIcon, allyIcon, back, front] = await Promise.all([
    load(background || DEFAULT_TABLECLOTH), load(factionIcon(summary.mainNation, 'white')),
    load(factionIcon(summary.allyNation, 'white')),
    load(cardBackForDeck({ ...summary, cardBackUrl })),
    load(cachedArt || headquarters!.image).catch(() => load(headquarters!.image)),
  ]);
  const canvas = document.createElement('canvas'); canvas.width = WIDTH * RESOLUTION; canvas.height = HEIGHT * RESOLUTION;
  const ctx = canvas.getContext('2d'); if (!ctx) throw new Error('无法创建迷你分享图');
  ctx.scale(RESOLUTION, RESOLUTION);
  ctx.imageSmoothingQuality = 'high';
  const contain = (image: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const fittedWidth = image.naturalWidth * scale, fittedHeight = image.naturalHeight * scale;
    ctx.drawImage(image, x + (width - fittedWidth) / 2, y + (height - fittedHeight) / 2, fittedWidth, fittedHeight);
  };
  const appearance = FACTION_ASSETS[summary.mainNation] || FACTION_ASSETS.Neutral;
  ctx.fillStyle = appearance.stripColor; ctx.fillRect(0, 0, 342, 242);
  const scale = Math.max(342 / wallpaper.width, 242 / wallpaper.height);
  ctx.globalAlpha = 0.18;
  ctx.drawImage(wallpaper, (342 - wallpaper.width * scale) / 2, (242 - wallpaper.height * scale) / 2, wallpaper.width * scale, wallpaper.height * scale);
  ctx.globalAlpha = 0.07; contain(mainIcon, 40, (HEIGHT - 172) / 2, 250, 172); ctx.globalAlpha = 1;
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)'; ctx.fillRect(0, 0, 342, 242);
  contain(await load(factionIcon(summary.mainNation)), 16, 14, 32, 32);
  ctx.fillStyle = '#fff9e8'; ctx.font = '700 18px Microsoft YaHei, sans-serif';
  const fullTitle = title.trim() || 'KARDS 卡组';
  let fittedTitle = fullTitle;
  while (ctx.measureText(fittedTitle).width > 178 && fittedTitle.length > 1) fittedTitle = fittedTitle.slice(0, -1);
  ctx.fillText(fittedTitle === fullTitle ? fittedTitle : `${fittedTitle}…`, 60, 36);
  ctx.strokeStyle = 'rgba(255, 249, 232, 0.22)'; ctx.beginPath(); ctx.moveTo(0, 60); ctx.lineTo(342, 60); ctx.stroke();
  ctx.font = '700 15px Microsoft YaHei, sans-serif'; ctx.fillText(factionLabel(summary.mainNation), 16, 94);
  const mainLabelWidth = ctx.measureText(factionLabel(summary.mainNation)).width;
  ctx.fillStyle = '#d1d1cd'; ctx.font = '15px Bahnschrift, Arial, sans-serif'; ctx.fillText(`（${summary.mainCount}）`, 20 + mainLabelWidth, 94);
  if (summary.mainNation !== summary.allyNation) {
    contain(allyIcon, 16, 105, 17, 17); ctx.fillStyle = '#fff9e8'; ctx.font = '12px Microsoft YaHei, sans-serif';
    const allyName = factionLabel(summary.allyNation); ctx.fillText(allyName, 38, 119);
    const allyLabelWidth = ctx.measureText(allyName).width;
    ctx.fillStyle = '#d1d1cd'; ctx.font = '12px Bahnschrift, Arial, sans-serif'; ctx.fillText(`（${summary.allyCount}）`, 42 + allyLabelWidth, 119);
  }
  ctx.fillStyle = 'rgba(0, 0, 0, 0.24)'; ctx.fillRect(0, 146, 342, 48);
  const baseline = 178, tallest = Math.max(1, ...summary.curve);
  summary.curve.forEach((count, cost) => {
    const x = 16 + cost * 20, height = count / tallest * 30;
    ctx.fillStyle = '#e1dcc5'; ctx.fillRect(x, baseline - height, 14, height);
    ctx.font = '9px Arial, sans-serif'; ctx.fillText(cost === 7 ? '7+' : String(cost), x + 3, baseline + 12);
  });
  ctx.strokeStyle = '#e1dcc5'; ctx.beginPath(); ctx.moveTo(16, baseline); ctx.lineTo(172, baseline); ctx.stroke();
  const drawCard = (image: HTMLImageElement, x: number, y: number, width: number, rotation: number) => {
    const height = width * 867 / 618;
    ctx.save(); ctx.translate(x, y); ctx.rotate(rotation); ctx.shadowColor = 'rgba(0, 0, 0, 0.45)'; ctx.shadowBlur = 4 * RESOLUTION; ctx.shadowOffsetY = 4 * RESOLUTION;
    contain(image, -width / 2, -height / 2, width, height); ctx.restore();
  };
  drawCard(back, 223, 153, 95, -0.14); drawCard(front, 281, 132, 100, 0.14);
  for (const [index, rarity] of ['Elite', 'Special', 'Limited', 'Standard'].entries()) {
    const asset = WILDCARDS.Common[rarity], image = await load(asset.file), crop = asset.crop;
    ctx.drawImage(image, image.width * crop.x, image.height * crop.y, image.width * crop.width, image.height * crop.height, 16 + index * 43, 210, 15, 20);
    ctx.fillStyle = '#fff9e8'; ctx.font = '12px Bahnschrift, Arial, sans-serif'; ctx.fillText(String(summary.rarities[rarity] || 0), 35 + index * 43, 225);
  }
  const qr = await load(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(deckQrSvg(code, headquartersId, title, cardBackId, RESOLUTION))}`);
  const qrSize = 44, qrX = WIDTH - 6 - qrSize, qrY = 10;
  ctx.drawImage(qr, qrX, qrY, qrSize, qrSize);
  return canvas.toDataURL('image/png');
}
