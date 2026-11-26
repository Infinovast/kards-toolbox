import { useRef, useState } from 'react';
import { alternateCardArt } from '../lib/assetCatalog';
import { cardDisplayTitle, type KardsCardRecord } from '../types/card';
import { CardFace } from './CardFace';

export function CardDetailArt({ card, initialSource, className = '', disabled = false }: {
  card: KardsCardRecord;
  initialSource?: string;
  className?: string;
  disabled?: boolean;
}) {
  const artworks = alternateCardArt(card.cardId);
  const [turn, setTurn] = useState(0);
  const nextFlip = useRef(0);
  if (!artworks.length) return <CardFace card={card} initialSource={initialSource} className={className} />;

  const total = artworks.length + 1;
  const active = turn % total;
  const previous = (turn + total - 1) % total;
  const faceClass = (index: number) => index === active || index === previous
    ? `card-detail-flip-face ${(index === active ? turn : turn - 1) % 2 ? 'is-back' : ''}`
    : 'hidden';
  return <button type="button" disabled={disabled} aria-label="切换异画" aria-pressed={active !== 0}
    className={`card-detail-flip ${className}`} onClick={() => {
      const now = performance.now();
      if (now < nextFlip.current) return;
      nextFlip.current = now + (window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 360);
      setTurn(value => value + 1);
    }}>
    <span className="card-detail-flip-rotor" style={{ transform: `rotateY(${turn * 180}deg)` }}>
      <span className={faceClass(0)} aria-hidden={active !== 0}><CardFace card={card} initialSource={initialSource} /></span>
      {artworks.map((source, index) => <span key={source} className={faceClass(index + 1)} aria-hidden={active !== index + 1}>
        <img className="card-face" src={source} alt={`${cardDisplayTitle(card, 'zh-Hans')}异画${artworks.length > 1 ? ` ${index + 1}` : ''}`} draggable={false} />
      </span>)}
    </span>
  </button>;
}
