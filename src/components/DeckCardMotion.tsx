import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import type { KardsCardRecord } from '../types/card';
import { CardFace } from './CardFace';

interface CardBox { left: number; top: number; width: number; height: number; image?: string }
interface Flight { id: number; importId: string; direction: 'add' | 'remove'; card: KardsCardRecord; from: CardBox; to: CardBox }
interface Snapshot { pool: Map<string, CardBox>; rows: Map<string, CardBox>; fallback: CardBox; clicked?: { id: string; box: CardBox } }

function box(element: HTMLElement): CardBox {
  const bounds = element.getBoundingClientRect();
  const image = element instanceof HTMLImageElement ? element : element.querySelector<HTMLImageElement>('img.card-face');
  return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height, image: image?.currentSrc || image?.src };
}

function stripBox(row: CardBox, direction: Flight['direction']): CardBox {
  const width = Math.min(84, row.width / 3), height = width * 867 / 618;
  return { left: row.left + (row.width - width) / 2, top: direction === 'add' ? row.top + row.height + 4 : row.top - height - 4, width, height };
}

export function useDeckCardMotion(root: RefObject<HTMLDivElement | null>, entries: Map<string, number>, cardsById: Map<string, KardsCardRecord>, active: boolean) {
  const previous = useRef(entries);
  const pending = useRef<Snapshot | null>(null);
  const sequence = useRef(0);
  const numberAnimations = useRef<Animation[]>([]);
  const [flights, setFlights] = useState<Flight[]>([]);
  const prepare = (id?: string, clicked?: HTMLElement) => {
    const container = root.current;
    const grid = container?.querySelector<HTMLElement>('[data-testid="builder-grid"]');
    if (!container || !grid) return;
    window.dispatchEvent(new CustomEvent('kards-deck-card-preview', { detail: null }));
    if (id) container.querySelector<HTMLElement>(`[data-deck-card-id="${CSS.escape(id)}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
    const pool = new Map<string, CardBox>(), rows = new Map<string, CardBox>();
    grid.querySelectorAll<HTMLElement>('[data-pool-card-id]').forEach(tile => {
      const art = tile.querySelector<HTMLElement>('.card-face');
      if (art) pool.set(tile.dataset.poolCardId!, box(art));
    });
    container.querySelectorAll<HTMLElement>('[data-deck-card-id]').forEach(row => rows.set(row.dataset.deckCardId!, box(row)));
    const bounds = grid.getBoundingClientRect(), width = Math.min(120, bounds.width / 3);
    pending.current = { pool, rows, fallback: { left: bounds.left + (bounds.width - width) / 2, top: bounds.top + (bounds.height - width * 867 / 618) / 2, width, height: width * 867 / 618 },
      clicked: id && clicked ? { id, box: box(clicked.querySelector<HTMLElement>('.card-face') || clicked) } : undefined };
  };
  useLayoutEffect(() => {
    const before = previous.current;
    previous.current = entries;
    const snapshot = pending.current;
    pending.current = null;
    if (!snapshot || !active || !root.current) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const nextFlights: Flight[] = [];
    for (const id of new Set([...before.keys(), ...entries.keys()])) {
      const change = (entries.get(id) || 0) - (before.get(id) || 0);
      const card = cardsById.get(id);
      if (!change || !card) continue;
      const row = root.current.querySelector<HTMLElement>(`[data-deck-card-id="${CSS.escape(id)}"]`);
      if (row) row.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'instant' });
      const number = row?.querySelector<HTMLElement>('.deck-card-count-number');
      if (number) {
        number.getAnimations().forEach(animation => animation.cancel());
        const animation = number.animate(reduced ? [{ opacity: 0.4 }, { opacity: 1 }] : [
          { transform: `translateY(${change > 0 ? 9 : -9}px) scale(0.75)`, opacity: 0.25 },
          { transform: 'translateY(0) scale(1.2)', opacity: 1, offset: 0.65 },
          { transform: 'translateY(0) scale(1)', opacity: 1 },
        ], { duration: reduced ? 80 : 240, easing: 'ease-out' });
        numberAnimations.current.push(animation);
        animation.onfinish = () => { numberAnimations.current = numberAnimations.current.filter(item => item !== animation); };
        animation.oncancel = animation.onfinish;
      }
      if (reduced) continue;
      const rowBounds = row ? box(row) : snapshot.rows.get(id);
      if (!rowBounds) continue;
      const direction = change > 0 ? 'add' : 'remove';
      const currentPoolArt = root.current.querySelector<HTMLElement>(`[data-pool-card-id="${CSS.escape(id)}"] .card-face`);
      const poolBounds = currentPoolArt ? box(currentPoolArt) : snapshot.pool.get(id) || snapshot.fallback;
      const poolSource = snapshot.clicked?.id === id ? snapshot.clicked.box : poolBounds;
      nextFlights.push({ id: ++sequence.current, importId: id, direction, card,
        from: direction === 'add' ? poolSource : stripBox(snapshot.rows.get(id) || rowBounds, direction),
        to: direction === 'add' ? stripBox(rowBounds, direction) : poolBounds });
    }
    if (nextFlights.length) setFlights(current => [...current, ...nextFlights].slice(-8));
  }, [entries, cardsById, active, root]);
  useEffect(() => {
    if (!active) { pending.current = null; setFlights([]); }
    return () => { numberAnimations.current.forEach(animation => animation.cancel()); numberAnimations.current = []; };
  }, [active]);
  return { prepare, flights, finish: (id: number) => setFlights(current => current.filter(flight => flight.id !== id)) };
}

function FlyingCard({ flight, onFinish }: { flight: Flight; onFinish: (id: number) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const finish = useRef(onFinish);
  finish.current = onFinish;
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { from, to } = flight;
    const x = to.left - from.left, y = to.top - from.top;
    const scaleX = to.width / from.width, scaleY = to.height / from.height;
    const animation = element.animate([
      { transform: 'translate(0, 0) scale(1)', opacity: 0.85 },
      { transform: `translate(${x * 0.6}px, ${y * 0.6 - 28}px) scale(${1 + (scaleX - 1) * 0.6}, ${1 + (scaleY - 1) * 0.6})`, opacity: 1, offset: 0.6 },
      { transform: `translate(${x}px, ${y}px) scale(${scaleX}, ${scaleY})`, opacity: 0 },
    ], { duration: 460, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' });
    animation.onfinish = () => finish.current(flight.id);
    return () => { animation.onfinish = null; animation.cancel(); };
  }, [flight]);
  return <div ref={ref} aria-hidden="true" className="deck-card-flight" data-direction={flight.direction} data-card-id={flight.importId}
    style={{ left: flight.from.left, top: flight.from.top, width: flight.from.width, height: flight.from.height }}>
    <CardFace card={flight.card} initialSource={flight.from.image || flight.to.image} />
  </div>;
}

export default function DeckCardMotion({ flights, onFinish }: { flights: Flight[]; onFinish: (id: number) => void }) {
  return createPortal(<>{flights.map(flight => <FlyingCard key={flight.id} flight={flight} onFinish={onFinish} />)}</>, document.body);
}
