import { useLayoutEffect, useRef, useState, type RefObject } from 'react';
import { X } from 'lucide-react';
import type { HeadquartersAsset } from '../lib/cardAssets';
import { captureCardDetailOrigin, type CardDetailOrigin } from '../lib/cardDetailOrigin';
import { factionLabel } from '../types/card';

export type HeadquartersOrigins = Map<string, CardDetailOrigin>;

export default function HeadquartersGallery({ cards, label, origins, dialogRef, closing, onRequestClose, onClose, onSelect }: {
  cards: HeadquartersAsset[];
  label: string;
  origins: HeadquartersOrigins;
  dialogRef: RefObject<HTMLElement | null>;
  closing: boolean;
  onRequestClose: () => void;
  onClose: () => void;
  onSelect: (headquarters: HeadquartersAsset, origin?: CardDetailOrigin) => void;
}) {
  const grid = useRef<HTMLDivElement>(null);
  const overlay = useRef<HTMLDivElement>(null);
  const closeCallback = useRef(onClose);
  closeCallback.current = onClose;
  const [arrived, setArrived] = useState<string[]>([]);
  useLayoutEffect(() => {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const animations: Animation[] = [];
    const images = grid.current?.querySelectorAll<HTMLImageElement>('img') || [];
    images.forEach((image, index) => {
      const headquarters = cards[index], source = origins.get(headquarters.id);
      const target = image.parentElement!.getBoundingClientRect();
      const currentTransform = getComputedStyle(image).transform;
      const currentOpacity = getComputedStyle(image).opacity;
      if (!source || !target.width) { if (!closing) setArrived(current => [...current, headquarters.id]); return; }
      const x = source.left + source.width / 2 - target.left - target.width / 2;
      const y = source.top + source.height / 2 - target.top - target.height / 2;
      const stacked = reduced ? 'none' : `translate(${x}px, ${y}px) scale(${source.width / target.width}, ${source.height / target.height})`;
      const animation = image.animate(closing ? [
        { transform: currentTransform, opacity: currentOpacity },
        { transform: stacked, opacity: reduced ? 0 : 1 },
      ] : [
        { transform: stacked, opacity: reduced ? 0 : 1 },
        { transform: 'none', opacity: 1 },
      ], { duration: reduced ? 100 : closing ? 260 : 340 + (index % 4) * 20, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', fill: 'both' });
      if (!closing) animation.onfinish = () => { setArrived(current => [...current, headquarters.id]); animation.cancel(); };
      animations.push(animation);
    });
    if (closing && overlay.current) {
      animations.push(overlay.current.animate([{ opacity: 1 }, { opacity: 0 }], { duration: reduced ? 100 : 260, fill: 'both' }));
      void Promise.all(animations.map(animation => animation.finished)).then(() => closeCallback.current()).catch(() => {});
    }
    const finish = () => animations.forEach(animation => { if (animation.playState === 'running') animation.finish(); });
    window.addEventListener('resize', finish);
    return () => { window.removeEventListener('resize', finish); animations.forEach(animation => {
      // Preserve the in-flight position when an entrance is interrupted by closing.
      if (animation.playState !== 'idle') animation.commitStyles();
      animation.onfinish = null; animation.cancel();
    }); };
  }, [cards, origins, closing]);
  return <div data-closing={closing} className="headquarters-gallery absolute inset-0 z-20 flex items-center justify-center p-5">
    <div ref={overlay} onClick={onRequestClose} className="absolute inset-0 bg-kards-modal-overlay backdrop-blur-sm" />
    <section ref={dialogRef} role="dialog" aria-modal="false" aria-label={label + '总部卡牌'} tabIndex={-1} className="headquarters-gallery-dialog">
      <button type="button" disabled={closing} onClick={onRequestClose} aria-label="关闭总部卡牌" className="headquarters-gallery-close"><X className="h-5 w-5" /></button>
      <div ref={grid} className="headquarters-gallery-grid">
        {cards.map(headquarters => <div key={headquarters.id} className="hq-expanded-item" data-arrived={arrived.includes(headquarters.id)}>
          <h2 className="hq-expanded-title">{factionLabel(headquarters.nation === 'Blank' ? 'Neutral' : headquarters.nation)}总部</h2>
          <button data-detail-source={`hq:${headquarters.id}`} type="button" disabled={closing} title={headquarters.name}
            onClick={event => onSelect(headquarters, captureCardDetailOrigin(event.currentTarget, 'pool'))}
            aria-label={'查看总部卡牌：' + headquarters.name} className="hq-expanded-card card-action">
            <img src={headquarters.image} alt="" className="card-face hq-expanded-card-art" />
          </button>
        </div>)}
      </div>
    </section>
  </div>;
}
