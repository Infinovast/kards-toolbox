import { useRef } from 'react';
import { useWheelPagination } from '../lib/useWheelPagination';

export default function PageIndicator({ page, pageCount, onChange }: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  useWheelPagination(ref, page, pageCount, onChange);

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
