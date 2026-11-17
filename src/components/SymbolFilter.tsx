import CustomSelect, { type SelectOption } from './CustomSelect';

export default function SymbolFilter({ label, options, value, onChange, collapsed, rarity = false, className = '', multiple = true, labelPrefix = '构筑' }: {
  label: string; options: SelectOption[]; value: string[]; onChange: (value: string[]) => void; collapsed: boolean; rarity?: boolean; className?: string; multiple?: boolean; labelPrefix?: string;
}) {
  const styledOptions = rarity ? options.map(option => ({ ...option, icon: <span className="builder-rarity-symbol">{option.icon}</span> })) : options;
  const dropdownClass = `builder-symbol-dropdown${rarity ? ' builder-rarity-dropdown' : ''} ${className}`;
  if (collapsed) return multiple ? <CustomSelect label={`${labelPrefix}${label}筛选`} placeholder={label} multiple value={value} onChange={onChange}
    options={styledOptions} layout="grid" className={dropdownClass} />
    : <CustomSelect label={`${labelPrefix}${label}筛选`} placeholder={label} value={value[0]} onChange={selected => onChange([selected])}
      options={styledOptions} layout="grid" className={dropdownClass} />;
  return <div role="group" aria-label={`${labelPrefix}${label}筛选`} className={`builder-symbol-options${rarity ? ' builder-rarity-options' : ''}`}>
    {styledOptions.map(option => <button key={option.value} type="button" aria-label={`${label}：${option.label}`} title={option.label}
      aria-pressed={value.includes(option.value)} className="builder-symbol-option" onClick={() => onChange(multiple
        ? value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value]
        : [value.includes(option.value) ? 'All' : option.value])}>
      {option.icon}
    </button>)}
  </div>;
}
