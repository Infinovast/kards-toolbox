import { useRef } from 'react';
import { useWheelPagination } from '../lib/useWheelPagination';
import { paginationItems } from '../lib/pagination';

export default function PageIndicator({ page, pageCount, onChange }: {
  page: number;
  pageCount: number;
  onChange: (page: number) => void;
}) {
  const ref = useRef<HTMLElement>(null);
  const total = Math.max(1, Math.floor(pageCount));
  const current = Math.min(total, Math.max(1, Math.floor(page)));
  useWheelPagination(ref, current, total, onChange);

  return <nav ref={ref} tabIndex={0} aria-label="分页" data-page={current} data-page-count={total}
    title="滚轮翻页" className="page-indicator"
    onKeyDown={event => {
      if (event.nativeEvent.isComposing) return;
      const next = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? current - 1
        : event.key === 'ArrowDown' || event.key === 'ArrowRight' ? current + 1
        : event.key === 'Home' ? 1 : event.key === 'End' ? total : null;
      if (next === null) return;
      event.preventDefault(); event.stopPropagation();
      onChange(Math.min(total, Math.max(1, next)));
      ref.current?.focus({ preventScroll: true });
    }}>
    <button type="button" className="pagination-step" disabled={current <= 1} onClick={() => onChange(current - 1)}>上一页</button>
    {paginationItems(current, total).map(item => typeof item === 'number'
      ? <button key={item} type="button" data-page={item} aria-label={`第 ${item} 页`} aria-current={item === current ? 'page' : undefined} onClick={() => onChange(item)}>{item}</button>
      : <span key={item} className="pagination-gap" aria-hidden="true">…</span>)}
    <button type="button" className="pagination-step" disabled={current >= total} onClick={() => onChange(current + 1)}>下一页</button>
  </nav>;
}
