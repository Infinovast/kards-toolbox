import { useEffect, useRef, type RefObject } from 'react';
import { detailItemId, nextDetailFrame, type CardDetailItem } from './cardDetailPaging';

export default function useCardDetailPaging({ ref, enabled, ready = true, items, item, mode, onSelect, onReveal, onMoving }: {
  ref: RefObject<HTMLElement | null>;
  enabled: boolean;
  ready?: boolean;
  items: CardDetailItem[];
  item?: CardDetailItem;
  mode: 'modal' | 'sidebar';
  onSelect: (item: CardDetailItem) => void;
  onReveal: (item: CardDetailItem) => void | Promise<unknown>;
  onMoving?: (moving: boolean) => void;
}) {
  const latest = useRef({ ready, items, item, onSelect, onReveal, onMoving });
  const cancel = useRef<() => void>(() => {});
  latest.current = { ready, items, item, onSelect, onReveal, onMoving };
  useEffect(() => {
    const root = ref.current;
    if (!enabled || !root) return;
    let disposed = false, busy = false, lastInput = -Infinity, lastTurn = -Infinity;
    let animation: Animation | undefined;
    cancel.current = () => { disposed = true; animation?.cancel(); };
    const animate = async (element: HTMLElement, frames: Keyframe[], duration: number, easing: string) => {
      animation = element.animate(frames, { duration, easing, fill: 'both' });
      await animation.finished.catch(() => {});
    };
    const turn = async (direction: number) => {
      const current = latest.current;
      const index = current.item ? current.items.findIndex(entry => detailItemId(entry) === detailItemId(current.item!)) : -1;
      const element = root.querySelector<HTMLElement>(mode === 'modal' ? '.card-detail-art' : '.detail-sidebar-content');
      if (index < 0 || !element) return;
      busy = true;
      const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
      const next = current.items[index + direction];
      if (!next) {
        await animate(element, [{ transform: 'translateY(0)' }, { transform: `translateY(${reduced ? 0 : direction * 18}px)`, offset: 0.4 }, { transform: 'translateY(0)' }], reduced ? 80 : 240, 'ease-in-out');
      } else {
        current.onMoving?.(true);
        const distance = mode === 'modal' ? element.clientHeight * 0.8 : 28;
        await animate(element, [{ transform: 'translateY(0) scale(1)', opacity: 1 }, { transform: `translateY(${reduced ? 0 : -direction * distance}px) scale(${reduced ? 1 : mode === 'modal' ? 0.55 : 0.98})`, opacity: 0 }], reduced ? 60 : mode === 'modal' ? 170 : 100, 'cubic-bezier(0.55, 0, 1, 0.45)');
        if (disposed) return;
        current.onSelect(next);
        await Promise.all([current.onReveal(next), nextDetailFrame()]);
        if (disposed) return;
        animation?.cancel();
        root.scrollTop = 0;
        await animate(element, [{ transform: `translateY(${reduced ? 0 : direction * distance}px) scale(${reduced ? 1 : mode === 'modal' ? 0.55 : 0.98})`, opacity: 0 }, { transform: 'translateY(0) scale(1)', opacity: 1 }], reduced ? 80 : mode === 'modal' ? 240 : 150, 'cubic-bezier(0.16, 1, 0.3, 1)');
        if (disposed) return;
        latest.current.onMoving?.(false);
      }
      animation?.cancel();
      busy = false;
    };
    const wheel = (event: WheelEvent) => {
      if (event.ctrlKey || !event.deltaY) return;
      event.preventDefault(); event.stopPropagation();
      const now = performance.now(), gap = now - lastInput;
      lastInput = now;
      // One turn per gesture; momentum cannot skip cards or retrigger a boundary.
      if (busy || !latest.current.ready || gap < 180 || now - lastTurn < 440) return;
      lastTurn = now;
      void turn(Math.sign(event.deltaY));
    };
    root.addEventListener('wheel', wheel, { passive: false });
    return () => { disposed = true; animation?.cancel(); root.removeEventListener('wheel', wheel); };
  }, [ref, enabled, mode]);
  return () => cancel.current();
}
