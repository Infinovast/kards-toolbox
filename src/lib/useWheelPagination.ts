import { useEffect, useRef, type RefObject } from 'react';

export function useWheelPagination<T extends HTMLElement>(ref: RefObject<T | null>, page: number, pageCount: number, onChange: (page: number) => void) {
  const latest = useRef({ page, pageCount, onChange });
  latest.current = { page, pageCount, onChange };
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    let scrolling = false;
    let resetTimer: number | undefined;
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY || document.querySelector('[role="dialog"][aria-modal="true"]')) return;
      event.preventDefault();
      event.stopPropagation();
      window.clearTimeout(resetTimer);
      resetTimer = window.setTimeout(() => { scrolling = false; }, 220);
      // Treat a wheel burst and its trackpad momentum as one page turn.
      if (scrolling) return;
      scrolling = true;
      const current = latest.current;
      current.onChange(Math.min(current.pageCount, Math.max(1, current.page + Math.sign(event.deltaY))));
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => { element.removeEventListener('wheel', wheel); window.clearTimeout(resetTimer); };
  }, [ref]);
}
