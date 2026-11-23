import { useLayoutEffect, useRef, type CSSProperties, type RefObject } from 'react';
import type { NewsEntry } from '../lib/newsSource';

export const NEWS_JUMP_OFFSET = 24;
export type NewsMonth = { key: string; firstIndex: number; entries: NewsEntry[] };

const circledDays = '⓪①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳㉑㉒㉓㉔㉕㉖㉗㉘㉙㉚㉛';

function circledDay(date: string) {
  const day = Number(date.slice(8, 10));
  return circledDays[day] ?? date.slice(8, 10);
}

export default function NewsMonthRail({ months, viewport, onJump, onOpen }: {
  months: NewsMonth[];
  viewport: RefObject<HTMLDivElement | null>;
  onJump: (month: NewsMonth) => void;
  onOpen: (entry: NewsEntry, trigger: HTMLElement) => void;
}) {
  const railRef = useRef<HTMLDivElement>(null);
  const indexRef = useRef<HTMLElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const rail = railRef.current!;
    const index = indexRef.current!;
    const label = labelRef.current!;
    const list = viewport.current!;
    const groups = [...index.querySelectorAll<HTMLElement>('.month-group')];
    let current: HTMLElement | undefined;
    let emphasized: HTMLElement | undefined;
    let expanded: HTMLElement | undefined;
    let hoverGroup: HTMLElement | null = null;
    let pointer: { x: number; y: number } | null = null;
    let highlighted: HTMLElement | null = null;
    let frame = 0;

    function layout() {
      const monthHeight = parseFloat(getComputedStyle(rail).getPropertyValue('--month-tick-height'));
      const baseHeight = 10 + months.length * monthHeight;
      const available = Math.max(0, rail.clientHeight - 24);
      const count = expanded?.lastElementChild?.childElementCount ?? 0;
      const articleSpace = baseHeight < available ? available - baseHeight : available * .2;
      const tickHeight = count ? Math.min(7, Math.max(3, articleSpace / count)) : 0;
      for (const group of groups) {
        const articles = group.lastElementChild as HTMLElement;
        const show = group === expanded;
        articles.inert = !show;
        articles.style.setProperty('--articles-height', `${show ? count * tickHeight : 0}px`);
        group.toggleAttribute('data-expanded', show);
      }
      if (!expanded) {
        rail.style.removeProperty('--rail-height');
        rail.style.removeProperty('--article-tick-height');
        return;
      }
      rail.style.setProperty('--rail-height', `${Math.min(available, baseHeight + count * tickHeight)}px`);
      rail.style.setProperty('--article-tick-height', `${Math.max(3, tickHeight)}px`);
    }

    function updateRail() {
      const focused = pointer ? null : index.querySelector<HTMLElement>(':focus-visible');
      const group = hoverGroup ?? focused?.closest<HTMLElement>('.month-group') ?? undefined;
      if (expanded !== group) {
        expanded = group;
        layout();
      }
      const active = (group?.firstElementChild as HTMLElement | undefined) ?? current;
      if (active !== emphasized) {
        emphasized?.removeAttribute('data-emphasis');
        active?.setAttribute('data-emphasis', '');
        rail.dataset.monthLabel = active?.textContent ?? '';
        emphasized = active;
      }

      // CSS hover follows moving boxes during expansion. Highlight only after the hit test settles.
      const moving = pointer && index.getAnimations({ subtree: true }).some(animation => {
        if (!(animation instanceof CSSTransition)) return false;
        const target = (animation.effect as KeyframeEffect | null)?.target;
        return (target === index || target?.classList.contains('month-articles'))
          && ['top', 'height'].includes(animation.transitionProperty)
          && (animation.pending || animation.playState === 'running');
      });
      const hit = pointer && !moving ? document.elementFromPoint(pointer.x, pointer.y)?.closest<HTMLElement>('.article-tick') : null;
      const article = hit && group?.contains(hit) ? hit : null;
      if (highlighted !== article) {
        highlighted?.removeAttribute('data-hovered');
        article?.setAttribute('data-hovered', '');
        highlighted = article;
      }

      const labeled = article ?? (focused?.matches('.article-tick') ? focused : null);
      label.hidden = !labeled;
      if (labeled) {
        const tick = labeled.getBoundingClientRect();
        label.textContent = `${circledDay(labeled.dataset.date ?? '')} ${labeled.getAttribute('aria-label') ?? ''}`;
        label.style.top = `${tick.top + tick.height / 2 - rail.getBoundingClientRect().top}px`;
      }
    }

    function updateCurrent() {
      const top = list.getBoundingClientRect().top + NEWS_JUMP_OFFSET + 2;
      let position = 0;
      for (let next = 1; next < months.length; next += 1) {
        const day = list.querySelector(`[data-news-day="${months[next].entries[0].date}"]`);
        if (!day || day.getBoundingClientRect().top > top) break;
        position = next;
      }
      const button = groups[position]?.firstElementChild as HTMLElement | undefined;
      if (current === button || !button) return;
      current?.removeAttribute('aria-current');
      current = button;
      button.setAttribute('aria-current', 'location');
      updateRail();
      const bounds = index.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      if (!expanded && rect.top < bounds.top) index.scrollTop += rect.top - bounds.top;
      if (!expanded && rect.bottom > bounds.bottom) index.scrollTop += rect.bottom - bounds.bottom;
    }

    const scheduleUpdate = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        updateCurrent();
        updateRail();
      });
    };
    const move = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pointer = { x: event.clientX, y: event.clientY };
      const tick = (event.target as Element).closest('.month-tick, .article-tick');
      hoverGroup = tick?.closest<HTMLElement>('.month-group') ?? null;
      updateRail();
    };
    const leave = () => {
      pointer = null;
      hoverGroup = null;
      updateRail();
    };
    const transition = (event: TransitionEvent) => {
      if (!event.pseudoElement && ['top', 'height'].includes(event.propertyName)) scheduleUpdate();
    };
    const resize = new ResizeObserver(() => {
      if (expanded) layout();
      scheduleUpdate();
    });
    resize.observe(rail);
    const listeners = new AbortController();
    const { signal } = listeners;
    list.addEventListener('scroll', scheduleUpdate, { passive: true, signal });
    rail.addEventListener('pointermove', move, { signal });
    rail.addEventListener('pointerleave', leave, { signal });
    rail.addEventListener('pointercancel', leave, { signal });
    for (const event of ['focusin', 'focusout', 'scroll']) index.addEventListener(event, scheduleUpdate, { capture: true, signal });
    for (const event of ['transitionrun', 'transitionend', 'transitioncancel'] as const) index.addEventListener(event, transition, { signal });
    updateCurrent();
    return () => {
      listeners.abort();
      resize.disconnect();
      cancelAnimationFrame(frame);
      leave();
    };
  }, [months, viewport]);

  return <div ref={railRef} className="month-rail" style={{ '--month-count': months.length } as CSSProperties}>
    <nav ref={indexRef} className="month-index" aria-label="按年月或文章跳转">
      {months.map(month => <div className="month-group" key={month.key}>
        <button type="button" className="month-tick" aria-label={`${month.key.slice(0, 4)} 年 ${Number(month.key.slice(5))} 月`} onClick={() => onJump(month)}>
          <span>{month.key.replace('-', '.')}</span>
        </button>
        <div className="month-articles" inert>
          {month.entries.map(entry => <button key={entry.id} className="article-tick" type="button" aria-label={entry.title} data-date={entry.date}
            onClick={event => onOpen(entry, event.currentTarget.parentElement!.previousElementSibling as HTMLElement)} />)}
        </div>
      </div>)}
    </nav>
    <span ref={labelRef} className="article-tick-label" aria-hidden="true" hidden />
  </div>;
}
