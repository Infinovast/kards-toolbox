import { useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { calculateCardPoolLayout } from './cardPoolLayout';

/** Size covers against the visible workspace while retaining scrollable deck browsing. */
export default function useDeckGridLayout(enabled: boolean, scale: number, gap: number) {
  const ref = useRef<HTMLDivElement>(null);
  const [layout, setLayout] = useState({ columns: 1, cardWidth: 160 });
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element || !enabled) return;
    const measure = () => {
      const style = getComputedStyle(element);
      const width = Math.min(1280, element.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight));
      const height = element.clientHeight - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);
      if (width <= 0 || height <= 0) return;
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
      const { columns, cardWidth } = calculateCardPoolLayout('decks', width, height, gap * scale * rem, gap * scale * rem, scale * rem / 16);
      setLayout(previous => previous.columns === columns && previous.cardWidth === cardWidth ? previous : { columns, cardWidth });
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [enabled, scale, gap]);
  return { ref, style: {
    '--deck-card-width': `${layout.cardWidth}px`,
    display: 'grid',
    gridTemplateColumns: `repeat(${layout.columns}, minmax(0, 1fr))`,
    gap: `${gap * scale}rem`,
    justifyItems: 'center',
  } as CSSProperties };
}
