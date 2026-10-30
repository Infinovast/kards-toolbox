import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { useWheelPagination } from './useWheelPagination';
import { calculateCardPoolLayout } from './cardPoolLayout';

export default function useCardPoolLayout(variant: 'library' | 'builder', itemCount: number, page: number, onPageChange: (page: number) => void) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, rows: 1, cardWidth: variant === 'library' ? 156 : 124 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width <= 0 || height <= 0) return;
      const gapX = parseFloat(style.columnGap), gapY = parseFloat(style.rowGap);
      const { columns, rows, cardWidth } = calculateCardPoolLayout(variant, width, height, gapX, gapY);
      setLayout(previous => previous.columns === columns && previous.rows === rows && previous.cardWidth === cardWidth
        ? previous : { columns, rows, cardWidth });
    };
    measure();
    // ResizeObserver already batches measurements per frame; avoid another frame of clipped cards.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [variant]);
  const capacity = layout.columns * layout.rows;
  const pageCount = Math.max(1, Math.ceil(itemCount / capacity));
  const currentPage = Math.min(page, pageCount);
  const start = (currentPage - 1) * capacity;
  useLayoutEffect(() => { if (page !== currentPage) onPageChange(currentPage); }, [page, currentPage, onPageChange]);
  useWheelPagination(ref, currentPage, pageCount, onPageChange);
  return { ref, capacity, page: currentPage, pageCount, start, end: start + capacity, style: {
    '--pool-columns': layout.columns,
    '--pool-card-width': `${layout.cardWidth}px`,
  } as CSSProperties };
}
