export default function ReservedBadge({ label = '预备卡', className = '' }: { label?: string; className?: string }) {
  return <img src="./assets/markers/reserved.svg" alt={label} title={label} className={`reserved-badge ${className}`} />;
}
