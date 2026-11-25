export default function KreditLabel({ cost, compact = false }: { cost?: number | string | null; compact?: boolean }) {
  if (cost == null) return <>—</>;
  return <span className={compact ? 'kredit-label kredit-label-compact' : 'kredit-label'} aria-hidden={compact ? undefined : true}>
    <strong>{cost}</strong><span>K{!compact && cost === 7 && <small>+</small>}</span>
  </span>;
}
