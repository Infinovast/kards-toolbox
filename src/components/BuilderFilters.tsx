import { useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import type { CardFilters } from '../lib/cardFilters';
import { CARD_SUBTYPES } from '../lib/cardSubtypes';
import { SUBCLASS_ICONS } from '../lib/assetCatalog';
import CustomSelect, { type SelectOption } from './CustomSelect';
import { cardTypeOptions, CostFilterButtons, expansionOptions, FilterIcon, nationOptions, rarityOptions } from './CardFilterSelects';

function SymbolFilter({ label, options, value, onChange, collapsed, rarity = false, className = '' }: {
  label: string; options: SelectOption[]; value: string[]; onChange: (value: string[]) => void; collapsed: boolean; rarity?: boolean; className?: string;
}) {
  const styledOptions = rarity ? options.map(option => ({ ...option, icon: <span className="builder-rarity-symbol">{option.icon}</span> })) : options;
  if (collapsed) return <CustomSelect label={`构筑${label}筛选`} placeholder={label} multiple value={value} onChange={onChange}
    options={styledOptions} layout="grid" className={`builder-symbol-dropdown${rarity ? ' builder-rarity-dropdown' : ''} ${className}`} />;
  return <div role="group" aria-label={`构筑${label}筛选`} className={`builder-symbol-options${rarity ? ' builder-rarity-options' : ''}`}>
    {styledOptions.map(option => <button key={option.value} type="button" aria-label={`${label}：${option.label}`} title={option.label}
      aria-pressed={value.includes(option.value)} className="builder-symbol-option" onClick={() => onChange(value.includes(option.value) ? value.filter(item => item !== option.value) : [...value, option.value])}>
      {option.icon}
    </button>)}
  </div>;
}

export default function BuilderFilters({ filters, onChange, expansions, mainNation, allyNation, costChart }: {
  filters: CardFilters; onChange: (filters: CardFilters) => void; expansions: string[]; mainNation: string; allyNation: string; costChart: ReactNode;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const costs = useRef<HTMLDivElement>(null);
  const subtype = useRef<HTMLDivElement>(null);
  const expansion = useRef<HTMLDivElement>(null);
  const chart = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(0);
  const countries = nationOptions().filter(option => option.value === mainNation || option.value === allyNation);
  const types = cardTypeOptions();
  const rarities = rarityOptions('zh-Hans', true);

  useLayoutEffect(() => {
    const row = bar.current, fixed = [costs.current, subtype.current, expansion.current, chart.current];
    if (!row || fixed.some(element => !element)) return;
    const measure = () => {
      const style = getComputedStyle(row);
      const size = parseFloat(style.getPropertyValue('--builder-symbol-size'));
      const gap = parseFloat(style.getPropertyValue('--builder-symbol-gap'));
      const dropdown = parseFloat(style.getPropertyValue('--builder-dropdown-width'));
      const countryDropdown = parseFloat(style.getPropertyValue('--builder-country-dropdown-width'));
      const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (available <= 0) return;
      // Collapse in priority order, independently of the groups' visual order.
      const widths = [types.length, rarities.length, countries.length].map(count => count * size + (count - 1) * gap);
      let required = fixed.reduce((sum, element) => sum + element!.getBoundingClientRect().width, 0)
        + widths.reduce((sum, width) => sum + width, 0) + parseFloat(style.columnGap) * 6;
      let next = 0;
      while (required > available && next < widths.length) {
        required += (next === 2 ? countryDropdown : dropdown) - widths[next];
        next++;
      }
      setCollapsed(previous => previous === next ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    [row, ...fixed].forEach(element => observer.observe(element!));
    return () => observer.disconnect();
  }, [countries.length, types.length, rarities.length]);

  return <div ref={bar} aria-label="构筑卡牌筛选" className="builder-filter-bar builder-inline-filters glass-panel custom-scrollbar" data-collapsed={collapsed}>
    <div ref={costs}><CostFilterButtons value={filters.cost} onChange={cost => onChange({ ...filters, cost })} label="构筑费用筛选" /></div>
    <SymbolFilter label="类型" options={types} value={filters.cardType} onChange={cardType => onChange({ ...filters, cardType })} collapsed={collapsed >= 1} />
    <SymbolFilter label="国家" options={countries} value={filters.factions} onChange={factions => onChange({ ...filters, factions })} collapsed={collapsed >= 3} className="builder-country-dropdown" />
    <SymbolFilter label="稀有度" options={rarities} value={filters.rarity} onChange={rarity => onChange({ ...filters, rarity })} collapsed={collapsed >= 2} rarity />
    <div ref={subtype}><CustomSelect label="构筑子类筛选" placeholder="子类" multiple value={filters.subtypes} onChange={subtypes => onChange({ ...filters, subtypes })} layout="grid"
      options={CARD_SUBTYPES.map(item => ({ value: item.id, label: item.name['zh-Hans'], icon: <FilterIcon src={SUBCLASS_ICONS[item.id]} /> }))} /></div>
    <div ref={expansion}><CustomSelect className="filter-expansion-select" label="构筑扩展包筛选" value={filters.expansion}
      onChange={expansion => onChange({ ...filters, expansion })} options={expansionOptions(expansions, 'zh-Hans')} /></div>
    <div ref={chart} className="builder-cost-chart-control">{costChart}</div>
  </div>;
}
