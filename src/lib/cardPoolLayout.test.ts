import assert from 'node:assert/strict';
import { calculateCardPoolLayout, CARD_POOL_WIDTHS } from './cardPoolLayout';

for (const variant of ['library', 'builder', 'decks'] as const) {
  const gapX = variant === 'library' ? 16 : variant === 'builder' ? 12 : 8, gapY = variant === 'library' ? 20 : variant === 'builder' ? 16 : 8;
  const extra = variant === 'builder' ? 27 : variant === 'decks' ? 46 : 0;
  const ratio = variant === 'decks' ? 7 / 5 : 867 / 618;
  const widths = new Set<number>();
  for (let width = 360; width <= 1800; width += 73) {
    for (let height = 280; height <= 1000; height += 31) {
      const layout = calculateCardPoolLayout(variant, width, height, gapX, gapY);
      const { columns, rows, cardWidth } = layout;
      widths.add(cardWidth);
      assert(cardWidth >= CARD_POOL_WIDTHS[variant].min && cardWidth <= CARD_POOL_WIDTHS[variant].max, JSON.stringify(layout));
      assert(columns * cardWidth + (columns - 1) * gapX <= width);
      assert(rows * (cardWidth * ratio + extra) + (rows - 1) * gapY <= height);
    }
  }
  assert(widths.size > 15, 'Card sizes must adapt rather than remain fixed');
}
const formerlyEmpty = calculateCardPoolLayout('library', 1050, 620, 16, 20);
assert(formerlyEmpty.rows === 3, 'Shrink cards to fit a third full row near the old row-height threshold');
assert(620 - (formerlyEmpty.rows * formerlyEmpty.cardWidth * 867 / 618 + 40) < 30);
assert.equal(calculateCardPoolLayout('library', 1120, 510, 16, 20).rows, 3, 'The default desktop workspace fits three library rows');
for (const scale of [0.8, 1, 1.2]) {
  const deck = calculateCardPoolLayout('decks', 1100, 600, 8 * scale, 8 * scale, scale);
  assert(deck.cardWidth >= 148 * scale && deck.cardWidth <= 172 * scale);
  assert(deck.rows * (deck.cardWidth * 7 / 5 + 46 * scale) + (deck.rows - 1) * 8 * scale <= 600);
}
console.log('Adaptive card-pool layout tests passed: bounded dimensions, complete rows and near-threshold height utilization');
