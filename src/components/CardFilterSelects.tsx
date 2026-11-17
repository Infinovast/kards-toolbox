import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties } from 'react';
import { CARD_FACTIONS, CARD_RARITIES, CARD_TYPES, type CardLanguage } from '../types/card';
import CustomSelect, { type SelectOption } from './CustomSelect';
import SymbolFilter from './SymbolFilter';
import KreditLabel from './KreditLabel';
import { selectCardFilterKeywords, type CardFilters } from '../lib/cardFilters';
import { CARD_SUBTYPES } from '../lib/cardSubtypes';
import { KEYWORD_FILTER_GROUPS } from '../lib/cardKeywords';
import { factionIcon, RARITY_ICONS, SET_ICONS, SUBCLASS_ICONS, TYPE_ICONS } from '../lib/assetCatalog';

export function FilterIcon({ src, fullColor = false }: { src: string; fullColor?: boolean }) {
  // CSS custom-property URLs resolve against the stylesheet when mask-image is
  // applied. Resolve against the document first, including in packaged kards://.
  const maskUrl = new URL(src, document.baseURI).href;
  return fullColor ? <img className="filter-symbol-image" src={src} alt="" />
    : <span className="filter-symbol" style={{ '--filter-icon': `url("${maskUrl}")` } as CSSProperties} />;
}

const englishNations: Record<string, string> = { Soviet: 'Soviet', USA: 'USA', Anzac: 'ANZAC' };
const englishTypes: Record<string, string> = { infantry: 'Infantry', tank: 'Tank', fighter: 'Fighter', bomber: 'Bomber', artillery: 'Artillery', order: 'Order', countermeasure: 'Countermeasure' };
const rarityLabels = { Standard: '普通', Limited: '稀有', Special: '特殊', Elite: '精英' };
const setDefinitions = [
  ['Base', '基础', 'Base'], ['OceaniaStorm', '澳新风暴', 'Oceania Storm'], ['Homefront', '国土阵线', 'Homefront'],
  ['NavalWarfare', '海战', 'Naval Warfare'], ['BloodAndIron', '血与铁', 'Blood and Iron'], ['CovertOps', '秘密行动', 'Covert Ops'],
  ['WinterWar', '冬季战争', 'Winter War'], ['BrothersInArms', '战友', 'Brothers in Arms'], ['TheatersOfWar', '战区', 'Theaters of War'],
  ['WorldAtWar', '世纪大战', 'World at War'], ['Legions', '军团', 'Legions'], ['Breakthrough', '突破', 'Breakthrough'], ['Allegiance', '忠诚', 'Allegiance'],
  ['OnlySpawnable', '衍生卡', 'Generated cards'], ['Special', '特殊形态', 'Special forms'],
];
const chinese = (language: CardLanguage) => language.startsWith('zh');
// Preferred inline groups, from widest to narrowest (nation, type, rarity).
const libraryFilterLayouts = [
  [true, true, true], [true, true, false], [true, false, true],
  [true, false, false], [false, true, false], [false, false, true], [false, false, false],
] as const;

export function nationOptions(language: CardLanguage = 'zh-Hans'): SelectOption[] {
  return CARD_FACTIONS.map(item => ({ value: item.id, label: chinese(language) ? item.label : englishNations[item.id] || item.id, icon: <FilterIcon src={factionIcon(item.id, 'white')} fullColor={item.id === 'Neutral'} /> }));
}

export function cardTypeOptions(language: CardLanguage = 'zh-Hans'): SelectOption[] {
  return CARD_TYPES.map(item => ({ value: item.id, label: chinese(language) ? item.label : englishTypes[item.id], icon: <FilterIcon src={TYPE_ICONS[item.id]} /> }));
}

export function rarityOptions(language: CardLanguage = 'zh-Hans', fullColor = false): SelectOption[] {
  return CARD_RARITIES.map(value => ({ value, label: chinese(language) ? rarityLabels[value] : value, iconOnly: true, icon: <FilterIcon src={RARITY_ICONS[value]} fullColor={fullColor} /> }));
}

export function expansionOptions(available: string[], language: CardLanguage): SelectOption[] {
  const sets = available.filter(id => !['OnlySpawnable', 'Special'].includes(id));
  const known = setDefinitions.filter(([id]) => sets.includes(id));
  const extra = sets.filter(id => !setDefinitions.some(([key]) => key === id)).map(id => [id, id, id]);
  return [{ value: 'All', label: chinese(language) ? '全部扩展' : 'All sets', icon: <FilterIcon src={SET_ICONS.All} /> }, ...[...known, ...extra].map(([id, zh, en]) => ({
    value: id, label: chinese(language) ? zh : en,
    icon: <FilterIcon src={SET_ICONS[id] || SET_ICONS.All} />,
  }))];
}

export function expansionLabel(set: string | undefined, language: CardLanguage): string {
  const definition = setDefinitions.find(([id]) => id === set);
  return definition?.[chinese(language) ? 1 : 2] || set || '—';
}

export function CardStatusSelect({ value, onChange }: { value: string[]; onChange: (value: string[]) => void }) {
  const categories = [
    { value: 'veteran', label: '老兵' },
    { value: 'weather', label: '天气' },
    { value: 'research', label: '研发' },
    { value: 'punishment', label: '惩戒' },
    { value: 'other', label: '其他' },
  ];
  const current = value[0] || 'All';
  const allGenerated = value.includes('generated') || categories.every(item => value.includes(item.value));
  const selectedCategories = allGenerated ? categories.map(item => item.value) : value.filter(item => categories.some(category => category.value === item));
  return <div role="group" aria-label="卡牌状态筛选" className="card-status-buttons">
    {[
      { value: 'All', label: '全部' },
      { value: 'active', label: '现役' },
      { value: 'reserved', label: '预备' },
      { value: 'permanent', label: '常备' },
    ].map(item => <button key={item.value} type="button" aria-pressed={current === item.value}
      onClick={() => onChange(item.value === 'All' ? [] : [item.value])}>{item.label}</button>)}
    <div className="card-status-generated">
      <button type="button" aria-pressed={allGenerated} onClick={() => onChange(['generated'])}>衍生</button>
      <CustomSelect label="衍生分类筛选" className="card-status-expand" multiple value={selectedCategories}
        onChange={selected => onChange(selected.length === categories.length ? ['generated'] : selected)} options={categories} />
    </div>
  </div>;
}

export function CostFilterButtons({ value, onChange, label = '费用筛选' }: {
  value: string[];
  onChange: (value: string[]) => void;
  label?: string;
}) {
  return <div role="group" aria-label={label} className="builder-costs">
    {Array.from({ length: 8 }, (_, index) => {
      const cost = String(index);
      const selected = value.includes(cost);
      return <button key={cost} type="button" aria-label={`费用 ${index}K${index === 7 ? '+' : ''}`} aria-pressed={selected}
        className="builder-cost-button" onClick={() => onChange(selected ? value.filter(item => item !== cost) : [...value, cost])}>
        <KreditLabel cost={index} />
      </button>;
    })}
  </div>;
}

function KeywordCountControl({ value, onChange }: { value: CardFilters['keywordCount']; onChange: (value: CardFilters['keywordCount']) => void }) {
  const control = useRef<HTMLButtonElement>(null);
  const change = (direction: number) => onChange(((value + direction + 4) % 4) as CardFilters['keywordCount']);
  useEffect(() => {
    const button = control.current;
    const wheel = (event: WheelEvent) => {
      if (!event.deltaY) return;
      event.preventDefault();
      event.stopPropagation();
      onChange(((value + (event.deltaY < 0 ? 1 : 3)) % 4) as CardFilters['keywordCount']);
    };
    button?.addEventListener('wheel', wheel, { passive: false });
    return () => button?.removeEventListener('wheel', wheel);
  }, [value, onChange]);
  return <label className="keyword-count-control">词条数量：<button ref={control} type="button" role="spinbutton" aria-label="词条数量"
    aria-valuemin={0} aria-valuemax={3} aria-valuenow={value} aria-valuetext={value ? `${value} 个词条` : '不限'}
    title="点击或向上滚动增加，向下滚动减少；不限、1、2、3 循环切换；支持方向键"
    className="keyword-count-pill" onClick={() => change(1)} onKeyDown={event => {
      if (['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); event.stopPropagation();
        if (event.key === 'Home') onChange(0);
        else if (event.key === 'End') onChange(3);
        else change(['ArrowUp', 'ArrowRight'].includes(event.key) ? 1 : -1);
      }
    }}>{value || '不限'}</button></label>;
}

export default function CardFilterSelects({ filters, onChange, language = 'zh-Hans' }: {
  filters: CardFilters;
  onChange: (filters: CardFilters) => void;
  language?: CardLanguage;
}) {
  const bar = useRef<HTMLDivElement>(null);
  const costs = useRef<HTMLDivElement>(null);
  const subtype = useRef<HTMLDivElement>(null);
  const keywords = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(0);
  const countries = nationOptions(language);
  const types = cardTypeOptions(language);
  const rarities = rarityOptions(language, true);
  const zh = chinese(language);
  useLayoutEffect(() => {
    const row = bar.current, fixed = [costs.current, subtype.current, keywords.current];
    if (!row || fixed.some(element => !element)) return;
    const measure = () => {
      const style = getComputedStyle(row);
      const size = parseFloat(style.getPropertyValue('--builder-symbol-size'));
      const gap = parseFloat(style.getPropertyValue('--builder-symbol-gap'));
      const dropdown = parseFloat(style.getPropertyValue('--builder-dropdown-width'));
      const countryDropdown = parseFloat(style.getPropertyValue('--builder-country-dropdown-width'));
      const available = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (available <= 0) return;
      const widths = [countries.length, types.length, rarities.length].map(count => count * size + (count - 1) * gap);
      const fixedWidth = fixed.reduce((sum, element) => sum + element!.getBoundingClientRect().width, 0)
        + parseFloat(style.columnGap) * (fixed.length + widths.length - 1);
      const fitting = libraryFilterLayouts.findIndex(layout => fixedWidth + layout.reduce((sum, expanded, index) =>
        sum + (expanded ? widths[index] : index === 0 ? countryDropdown : dropdown), 0) <= available);
      const next = fitting < 0 ? libraryFilterLayouts.length - 1 : fitting;
      setCollapsed(previous => previous === next ? previous : next);
    };
    measure();
    const observer = new ResizeObserver(measure);
    [row, ...fixed].forEach(element => observer.observe(element!));
    return () => observer.disconnect();
  }, [countries.length, types.length, rarities.length]);
  const [countryExpanded, typeExpanded, rarityExpanded] = libraryFilterLayouts[collapsed];
  const keywordModes = {
    or: { label: '或', next: 'and', previous: 'not', title: '满足任一词条；左键切换为与，右键切换为非' },
    and: { label: '与', next: 'not', previous: 'or', title: '满足全部词条；左键切换为非，右键切换为或' },
    not: { label: '非', next: 'or', previous: 'and', title: '不含任何选中词条；左键切换为或，右键切换为与' },
  } as const;
  const keywordMode = keywordModes[filters.keywordMode];
  return <div ref={bar} aria-label="卡牌筛选" className="builder-filter-bar builder-inline-filters library-filter-bar glass-panel custom-scrollbar" data-collapsed={collapsed}>
    <div ref={costs}><CostFilterButtons value={filters.cost} onChange={cost => onChange({ ...filters, cost })} /></div>
    <SymbolFilter label="阵营" labelPrefix="" options={countries} value={filters.factions} onChange={factions => onChange({ ...filters, factions })} collapsed={!countryExpanded} className="builder-country-dropdown" />
    <SymbolFilter label="类型" labelPrefix="" options={types} value={filters.cardType} onChange={cardType => onChange({ ...filters, cardType })} collapsed={!typeExpanded} />
    <SymbolFilter label="稀有度" labelPrefix="" options={rarities} value={filters.rarity} onChange={rarity => onChange({ ...filters, rarity })} collapsed={!rarityExpanded} rarity />
    <div ref={subtype}><CustomSelect label="子类筛选" placeholder="子类" multiple value={filters.subtypes} onChange={subtypes => onChange({ ...filters, subtypes })} layout="grid" options={CARD_SUBTYPES.map(item => ({ value: item.id, label: item.name[zh ? 'zh-Hans' : 'en-EN'], icon: <FilterIcon src={SUBCLASS_ICONS[item.id]} /> }))} /></div>
    <div ref={keywords} role="group" aria-label="词条匹配筛选" className="keyword-filter-controls"><CustomSelect label="词条筛选" placeholder="词条" className={filters.keywordCount ? 'has-selection' : ''} multiple value={filters.keywords} onChange={selected => onChange({ ...filters, keywords: selectCardFilterKeywords(filters.keywords, selected) })} layout="columns"
      headingControl={<KeywordCountControl value={filters.keywordCount} onChange={keywordCount => onChange({ ...filters, keywordCount })} />}
      options={KEYWORD_FILTER_GROUPS.flatMap(group => group.keywords.map(item => ({
      value: item.id, group: zh ? group.label : group.english, label: zh ? item.label : item.english, labelClassName: item.highlighted ? 'font-bold text-kards-status' : undefined,
      icon: item.icon ? <img src={item.icon} alt="" className="keyword-symbol" /> : undefined,
      iconPosition: 'end',
    })))} /><button type="button" className="keyword-match-mode" aria-label={`词条匹配：${keywordMode.label}`}
      title={keywordMode.title}
      onContextMenu={event => { event.preventDefault(); onChange({ ...filters, keywordMode: keywordMode.previous }); }}
      onClick={() => onChange({ ...filters, keywordMode: keywordMode.next })}>{keywordMode.label}</button></div>
  </div>;
}
