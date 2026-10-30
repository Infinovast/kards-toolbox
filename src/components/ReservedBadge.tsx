import { RESERVE_ICON } from '../lib/assetCatalog';

export default function ReservedBadge({ label = '预备卡', className = '' }: { label?: string; className?: string }) {
  return <img src={RESERVE_ICON} alt={label} title={label} className={`reserved-badge ${className}`} />;
}
