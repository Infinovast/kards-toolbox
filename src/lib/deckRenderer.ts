import { cardTitle, factionLabel, type KardsCardRecord } from '../types/card';
import { decodeDeckCode, findCardsByImportId } from './deckCode';
import { getCachedCardImage } from './cardImages';

// 只读取本地缓存；离线或缺图也能生成带名称、费用和数量的图片。
export async function renderDeckImage(code: string, cards: KardsCardRecord[], title = 'KARDS 卡组'): Promise<string> {
  const deck = decodeDeckCode(code);
  const index = findCardsByImportId(cards);
  const entries = [...deck.counts].sort(([a], [b]) => (index.get(a)?.json.kredits ?? 99) - (index.get(b)?.json.kredits ?? 99));
  const columns = 5, width = 1200, cardWidth = 210, cardHeight = 330, gap = 22, top = 140;
  const rows = Math.max(1, Math.ceil(entries.length / columns));
  const codeLines = code.match(/.{1,128}/g) || [];
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = top + rows * (cardHeight + gap) + 80 + codeLines.length * 17;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('此环境无法创建本地画布');
  ctx.fillStyle = '#181b16'; ctx.fillRect(0, 0, width, canvas.height);
  ctx.fillStyle = '#e8e4d9'; ctx.font = 'bold 34px "Microsoft YaHei", sans-serif'; ctx.fillText(title, 32, 54, 1120);
  ctx.fillStyle = '#c5a059'; ctx.font = '21px "Microsoft YaHei", sans-serif';
  const total = [...deck.counts.values()].reduce((sum, n) => sum + n, 0);
  ctx.fillText(`${factionLabel(deck.mainNation)} / ${factionLabel(deck.allyNation)} · ${total} 张可用牌 + 1 总部`, 32, 94);
  const images = await Promise.all(entries.map(async ([id]) => {
    const data = await getCachedCardImage(id);
    if (!data) return null;
    return new Promise<HTMLImageElement | null>((resolve) => {
      const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = data;
    });
  }));
  entries.forEach(([id, count], i) => {
    const card = index.get(id), image = images[i];
    const x = 30 + (i % columns) * (cardWidth + gap), y = top + Math.floor(i / columns) * (cardHeight + gap);
    ctx.fillStyle = '#2b3027'; ctx.fillRect(x, y, cardWidth, cardHeight);
    if (image) {
      const scale = Math.min(cardWidth / image.width, (cardHeight - 52) / image.height);
      ctx.drawImage(image, x + (cardWidth - image.width * scale) / 2, y, image.width * scale, image.height * scale);
    } else {
      ctx.fillStyle = '#a8b39b'; ctx.font = '17px "Microsoft YaHei", sans-serif';
      ctx.fillText(card ? `${card.json.kredits ?? 0} 费 · ${factionLabel(card.json.faction)}` : `未收录 ID: ${id}`, x + 12, y + 56, cardWidth - 24);
      ctx.fillStyle = '#c6c9bf'; ctx.font = '16px "Microsoft YaHei", sans-serif'; ctx.fillText('未缓存卡图', x + 12, y + 144);
    }
    ctx.fillStyle = '#e8e4d9'; ctx.font = 'bold 17px "Microsoft YaHei", sans-serif';
    ctx.fillText(card ? cardTitle(card, 'zh-Hans') : `未知卡牌 ${id}`, x + 10, y + cardHeight - 22, cardWidth - 58);
    ctx.fillStyle = '#c5a059'; ctx.fillText(`×${count}`, x + cardWidth - 42, y + cardHeight - 22);
  });
  ctx.fillStyle = '#aeb3a7'; ctx.font = '16px "Microsoft YaHei", sans-serif';
  const footerTop = top + rows * (cardHeight + gap) + 24;
  ctx.fillText('本地生成 · 缺图使用文字占位 · KARDS 非官方工具', 30, footerTop);
  ctx.font = '14px monospace';
  codeLines.forEach((line, i) => ctx.fillText(line, 30, footerTop + 26 + i * 17));
  return canvas.toDataURL('image/png');
}

export function downloadDeckImage(data: string, name: string) {
  const link = document.createElement('a'); link.href = data;
  link.download = `${name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') || 'kards-deck'}.png`;
  link.click();
}
