export default function KreditLabel({ cost }: { cost: number }) {
  return <span className="kredit-label" aria-hidden="true">
    <strong>{cost}</strong><span>K{cost === 7 && <small>+</small>}</span>
  </span>;
}
