const CARD_RATIO = 867 / 618;
export const CARD_POOL_WIDTHS = { library: { min: 120, max: 168 }, builder: { min: 96, max: 138 } };

export function calculateCardPoolLayout(variant: keyof typeof CARD_POOL_WIDTHS, width: number, height: number, gapX: number, gapY: number) {
  const { min, max } = CARD_POOL_WIDTHS[variant];
  const extra = variant === 'builder' ? 27 : 0;
  let best = { columns: 1, rows: 1, cardWidth: Math.max(1, Math.floor(Math.min(max, width, (height - extra) / CARD_RATIO))) };
  let bestScore = -1;
  const maxColumns = Math.max(1, Math.floor((width + gapX) / (min + gapX)));
  const maxRows = Math.max(1, Math.floor((height + gapY) / (min * CARD_RATIO + extra + gapY)));
  for (let columns = 1; columns <= maxColumns; columns++) {
    for (let rows = 1; rows <= maxRows; rows++) {
      const cardWidth = Math.floor(Math.min(max, (width - (columns - 1) * gapX) / columns,
        ((height - (rows - 1) * gapY) / rows - extra) / CARD_RATIO));
      if (cardWidth < min) continue;
      const usedHeight = rows * (cardWidth * CARD_RATIO + extra) + (rows - 1) * gapY;
      const usedWidth = columns * cardWidth + (columns - 1) * gapX;
      // Prefer full-height arrangements without sacrificing horizontal density.
      const score = 0.65 * usedHeight / height + 0.35 * usedWidth / width;
      if (score > bestScore) { best = { columns, rows, cardWidth }; bestScore = score; }
    }
  }
  return best;
}
