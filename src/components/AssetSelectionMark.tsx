import { Check } from 'lucide-react';

export default function AssetSelectionMark() {
  return <span className="asset-selection-mark" aria-hidden="true">
    <Check size={36} strokeWidth={3} />
  </span>;
}
