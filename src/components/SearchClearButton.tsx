import { X } from 'lucide-react';

export default function SearchClearButton({ value, onClear, label = '清除搜索' }: {
  value: string;
  onClear: () => void;
  label?: string;
}) {
  if (!value) return null;
  return <button type="button" aria-label={label} className="search-clear-button" onClick={event => {
    onClear();
    event.currentTarget.parentElement?.querySelector('input')?.focus();
  }}><X aria-hidden="true" className="h-4 w-4" /></button>;
}
