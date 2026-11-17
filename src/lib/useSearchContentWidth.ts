import { useLayoutEffect, useRef } from 'react';

export default function useSearchContentWidth(padding: number) {
  const searchRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const measure = measureRef.current;
    if (!measure) return;
    const resize = () => searchRef.current?.style.setProperty('--search-content-width', `${Math.ceil(measure.getBoundingClientRect().width) + padding}px`);
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(measure);
    return () => observer.disconnect();
  }, [padding]);
  return { searchRef, measureRef };
}
