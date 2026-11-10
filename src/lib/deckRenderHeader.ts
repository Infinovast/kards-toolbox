import { DECK_COST_CATEGORIES } from './deckCostCurve';
import type { DeckRenderStatistics } from './deckRenderTypes';

export const DECK_BACKGROUND_BLUR = 18;
export const DECK_BACKGROUND_TINT = 0.22;
export const DECK_STATISTICS_POSITION = { left: 970, top: 12 };

/** Reserve the middle of the header for statistics; the QR retains the full title. */
export function deckHeaderTitle(title: string) {
  const characters = Array.from(title), width = (value: string) => /[^\x00-\xff]/.test(value) ? 1 : 0.55;
  if (characters.reduce((sum, value) => sum + width(value), 0) <= 12) return title;
  let fitted = '', used = 0;
  for (const value of characters) {
    if (used + width(value) > 11) break;
    fitted += value; used += width(value);
  }
  return `${fitted}…`;
}

/** Identical header charts for Canvas previews and Sharp exports. Headquarters are excluded upstream. */
export function deckStatisticsSvg(statistics?: DeckRenderStatistics): string {
  if (!statistics) return '';
  const count = (value: number) => Number.isFinite(value) ? Math.max(0, Math.trunc(value)) : 0;
  const curve = Array.from({ length: 8 }, (_, index) => count(statistics.curve[index]));
  const tallest = Math.max(1, ...curve), baseline = 130;
  const bars = curve.map((value, index) => {
    const x = 12 + index * 45, height = value / tallest * 110;
    return `<rect x="${x}" y="${baseline - height}" width="31" height="${height}" fill="#e1dcc5"/><text x="${x + 15.5}" y="158" text-anchor="middle" font-size="22" fill="#e1dcc5">${index === 7 ? '7+' : index}</text>`;
  }).join('');
  const categories = DECK_COST_CATEGORIES.map(category => ({ ...category, count: count(statistics.totals[category.key]) })).filter(category => category.count > 0);
  const total = categories.reduce((sum, category) => sum + category.count, 0);
  const cx = 540, cy = 87, radius = 82;
  let angle = -Math.PI / 2;
  const labels: string[] = [];
  const slices = categories.map(category => {
    const sweep = category.count / total * Math.PI * 2, end = angle + sweep, middle = angle + sweep / 2;
    const point = (a: number) => `${cx + Math.cos(a) * radius} ${cy + Math.sin(a) * radius}`;
    const slice = categories.length === 1
      ? `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="${category.color}"/>`
      : `<path d="M${cx} ${cy}L${point(angle)}A${radius} ${radius} 0 ${sweep > Math.PI ? 1 : 0} 1 ${point(end)}Z" fill="${category.color}"/>`;
    const small = category.count / total < 0.12;
    const offset = categories.length === 1 ? 0 : small ? 65 : 47;
    labels.push(`<text data-category="${category.key}" x="${cx + Math.cos(middle) * offset}" y="${cy + Math.sin(middle) * offset}" text-anchor="middle" dominant-baseline="central" font-size="${small ? 18 : 22}" fill="#fff9e8" stroke="#101110" stroke-width="1" paint-order="stroke">${category.shortLabel} <tspan font-weight="700">${category.count}</tspan></text>`);
    angle = end;
    return slice;
  }).join('');
  const emptyPie = `<circle cx="${cx}" cy="${cy}" r="${radius}" fill="#101110"/><text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="22" fill="#e1dcc5">0</text>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="650" height="174" viewBox="0 0 650 174"><style>text{font-family:Microsoft YaHei,Arial,sans-serif}</style>${bars}<path d="M12 ${baseline}H358" fill="none" stroke="#e1dcc5" stroke-width="2"/>${total ? slices + labels.join('') : emptyPie}</svg>`;
}
