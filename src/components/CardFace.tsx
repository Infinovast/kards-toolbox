import { useEffect, useState } from 'react';
import { cacheCardImage } from '../lib/cardImages';
import { RARITY_COUNT_IMAGES } from '../lib/assetCatalog';
import { cardDisplayTitle, type KardsCardRecord } from '../types/card';

export function CardFace({ card, enabled = true, className = '', initialSource = '' }: {
  card: KardsCardRecord; enabled?: boolean; className?: string; initialSource?: string;
}) {
  const [source, setSource] = useState(initialSource);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setFailed(false); setSource(initialSource);
    cacheCardImage(card).then(url => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [card, enabled, initialSource]);
  return source
    ? <img src={source} alt={cardDisplayTitle(card, 'zh-Hans')} className={`card-face ${className}`} />
    : <div className={`card-face card-face-placeholder ${className}`}><span>{cardDisplayTitle(card, 'zh-Hans')}<br />{failed ? '卡图暂不可用' : '正在载入卡图…'}</span></div>;
}

export const RARITY_SLOTS: Record<string, { max: number; color: string }> = {
  Standard: { max: 4, color: '#969696' }, Limited: { max: 3, color: '#ba8555' },
  Special: { max: 2, color: '#e4e9ef' }, Elite: { max: 1, color: '#ffda62' },
};
export function RaritySlots({ rarity = 'Standard', count }: { rarity?: string; count: number }) {
  const key = RARITY_SLOTS[rarity] ? rarity : 'Standard';
  const { max } = RARITY_SLOTS[key];
  const source = RARITY_COUNT_IMAGES[key][Math.min(Math.max(0, count), max)];
  return <div className="rarity-slots" role="img" aria-label={`已携带 ${count} 张，标准上限 ${max} 张`}>
    <img src={source} width={115} height={40} alt="" draggable={false} />
    {count > max && <span className="rarity-overflow">+{count - max}</span>}
  </div>;
}
