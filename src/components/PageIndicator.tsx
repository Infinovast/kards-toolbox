import { useEffect, useRef } from 'react';

export default function PageIndicator({ page, pageCount, onChange }: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const latest = useRef({ page, pageCount, onChange });
  latest.current = { page, pageCount, onChange };

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let scrolling = false;
    let resetTimer: number | undefined;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { scrolling = false; }, 220);
      // Trackpad momentum and repeated wheel events belong to one gesture.
      if (scrolling) return;
      scrolling = true;
      const current = latest.current;
      current.onChange(Math.min(current.pageCount, Math.max(1, current.page + Math.sign(event.deltaY))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => {
      element.removeEventListener('wheel', wheel);
      window.clearTimeout(resetTimer);
    };
  }, []);

  return <span ref={ref} role="spinbutton" tabIndex={0} aria-label="页码" aria-valuemin={1} aria-valuemax={pageCount} aria-valuenow={page}
    title="滚轮翻页" className="page-indicator rounded px-2 py-1 tabular-nums"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      const next = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? page - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? page + 1
        : event.key === 'Home' ? 1 : event.key === 'End' ? pageCount : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation();
      onChange(Math.min(pageCount, Math.max(1, next)));
    }}>{page} / {pageCount}</span>;
}
