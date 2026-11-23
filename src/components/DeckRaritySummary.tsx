import { WILDCARDS } from '../lib/assetCatalog';

const RARITIES = [
  { id: 'Elite', label: '精英' }, { id: 'Special', label: '特殊' },
  { id: 'Limited', label: '稀有' }, { id: 'Standard', label: '普通' },
];

export default function DeckRaritySummary({ rarities, className = '' }: { rarities: Record<string, number>; className?: string }) {
  return <span role="group" aria-label="卡牌稀有度分布" className={`ready-deck-rarities ${className}`.trim()}>
    {RARITIES.map(rarity => {
      return <span key={rarity.id} title={`${rarity.label} ${rarities[rarity.id] || 0} 张`}>
        <span className="ready-deck-rarity-icon"><img src={WILDCARDS.Common[rarity.id]} alt={rarity.label} /></span>
        <span>{rarities[rarity.id] || 0}</span>
      </span>;
    })}
  </span>;
}
