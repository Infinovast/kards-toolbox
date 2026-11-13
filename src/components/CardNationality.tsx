import { ArrowRight } from 'lucide-react';
import { cardFactionIcon } from '../lib/assetCatalog';
import { factionLabel } from '../types/card';

export default function CardNationality({ faction, exile, type, size = 'md', className = '' }: {
  faction?: string;
  exile?: unknown;
  type?: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const exileNation = typeof exile === 'string' ? exile.trim() : '';
  const iconClass = size === 'sm' ? 'h-5 w-5' : 'h-6 w-6';
  const nation = (value?: string) => <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
    <img src={cardFactionIcon(value, type)} alt="" className={`${iconClass} shrink-0 object-contain`} />{factionLabel(value)}
  </span>;
  return <span className={`card-nationality inline-flex flex-wrap items-center gap-1.5 text-sm ${className}`}>
    {nation(faction)}
    {exileNation && <><ArrowRight aria-label="流亡至" strokeWidth={3} className="h-4 w-4 shrink-0" />{nation(exileNation)}</>}
  </span>;
}
