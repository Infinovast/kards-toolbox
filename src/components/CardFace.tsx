import { useEffect, useState } from 'react';
import { cacheCardImage } from '../lib/cardImages';
import { cardDisplayTitle, type CardLanguage, type KardsCardRecord } from '../types/card';

export function CardFace({ card, language = 'zh-Hans', enabled = true, className = '' }: {
  card: KardsCardRecord; language?: CardLanguage; enabled?: boolean; className?: string;
}) {
  const [source, setSource] = useState('');
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setFailed(false); setSource('');
    cacheCardImage(card, language).then(url => { if (active) setSource(url); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [card, language, enabled]);
  return source
    ? <img src={source} alt={cardDisplayTitle(card, language)} className={`card-face ${className}`} />
    : <div className={`card-face card-face-placeholder ${className}`}><span>{cardDisplayTitle(card, language)}<br />{failed ? '卡图暂不可用' : '正在载入卡图…'}</span></div>;
}

export const RARITY_SLOTS: Record<string, { max: number; color: string }> = {
  Standard: { max: 4, color: '#969696' }, Limited: { max: 3, color: '#ba8555' },
  Special: { max: 2, color: '#e4e9ef' }, Elite: { max: 1, color: '#ffda62' },
};
export function RaritySlots({ rarity = 'Standard', count }: { rarity?: string; count: number }) {
  const { max, color } = RARITY_SLOTS[rarity] || RARITY_SLOTS.Standard;
  return <div className="rarity-slots" aria-label={`已携带 ${count} 张，标准上限 ${max} 张`}>
    {Array.from({ length: max }, (_, i) => <span key={i} data-half={i < count} style={{ background: i < count ? `linear-gradient(135deg, ${color} 50%, transparent 50%)` : color, borderColor: color }} />)}
    {count > max && <span className="rarity-overflow">+{count - max}</span>}
  </div>;
}
