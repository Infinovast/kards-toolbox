import type { CSSProperties } from 'react';
import { CARD_FACTIONS, CARD_RARITIES, CARD_TYPES, type CardLanguage } from '../types/card';
import CustomSelect, { type SelectOption } from './CustomSelect';
import type { CardFilters } from '../lib/cardFilters';
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

const englishNations: Record<string, string> = { Soviet: 'Soviet Union', USA: 'United States', Anzac: 'ANZAC' };
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

export function nationOptions(language: CardLanguage = 'zh-Hans'): SelectOption[] {
  return CARD_FACTIONS.map(item => ({ value: item.id, label: chinese(language) ? item.label : englishNations[item.id] || item.id, icon: <FilterIcon src={factionIcon(item.id, 'white')} fullColor={item.id === 'Neutral'} /> }));
}

export function expansionOptions(available: string[], language: CardLanguage): SelectOption[] {
  const sets = available.filter(id => !['OnlySpawnable', 'Special'].includes(id));
  const known = setDefinitions.filter(([id]) => sets.includes(id));
  const extra = sets.filter(id => !setDefinitions.some(([key]) => key === id)).map(id => [id, id, id]);
  return [{ value: 'All', label: chinese(language) ? '全部扩展包' : 'All sets', icon: <FilterIcon src={SET_ICONS.All} /> }, ...[...known, ...extra].map(([id, zh, en]) => ({
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
        {index}<small>K{index === 7 ? '+' : ''}</small>
      </button>;
    })}
  </div>;
}

export default function CardFilterSelects({ filters, onChange, expansions, language = 'zh-Hans', builder = false }: {
  filters: CardFilters;
  onChange: (filters: CardFilters) => void;
  expansions: string[];
  language?: CardLanguage;
  builder?: boolean;
}) {
  const prefix = builder ? '构筑' : '';
  const zh = chinese(language);
  return <>
    {!builder && <CustomSelect label="阵营筛选" placeholder="阵营" multiple value={filters.factions} onChange={factions => onChange({ ...filters, factions })} options={nationOptions(language)} layout="grid" />}
    <CustomSelect label={`${prefix}类型筛选`} placeholder="类型" multiple value={filters.cardType} onChange={cardType => onChange({ ...filters, cardType })} layout="grid" options={CARD_TYPES.map(item => ({ value: item.id, label: zh ? item.label : englishTypes[item.id], icon: <FilterIcon src={TYPE_ICONS[item.id]} /> }))} />
    <CustomSelect label={`${prefix}子类筛选`} placeholder="子类" multiple value={filters.subtypes} onChange={subtypes => onChange({ ...filters, subtypes })} layout="grid" options={CARD_SUBTYPES.map(item => ({ value: item.id, label: item.name[zh ? 'zh-Hans' : 'en-EN'], icon: <FilterIcon src={SUBCLASS_ICONS[item.id]} /> }))} />
    {!builder && <div role="group" aria-label="词条匹配筛选" className="library-sort-controls keyword-filter-controls"><CustomSelect label="词条筛选" placeholder="词条" multiple value={filters.keywords} onChange={keywords => onChange({ ...filters, keywords })} layout="columns" options={KEYWORD_FILTER_GROUPS.flatMap(group => group.keywords.map(item => ({
      value: item.id, group: zh ? group.label : group.english, label: zh ? item.label : item.english, labelClassName: item.highlighted ? 'font-bold text-kards-status' : undefined,
      icon: item.icon ? <img src={item.icon} alt="" className="keyword-symbol" /> : undefined,
      iconPosition: 'end',
    })))} /><button type="button" className="library-sort-direction" aria-label={`词条匹配：${filters.keywordMode === 'and' ? '和' : '或'}`} aria-pressed={filters.keywordMode === 'and'}
      title={filters.keywordMode === 'and' ? '满足全部词条，点击切换为或' : '满足任一词条，点击切换为和'}
      onClick={() => onChange({ ...filters, keywordMode: filters.keywordMode === 'and' ? 'or' : 'and' })}>{filters.keywordMode === 'and' ? '和' : '或'}</button></div>}
    <CustomSelect label={`${prefix}稀有度筛选`} placeholder="稀有度" multiple value={filters.rarity} onChange={rarity => onChange({ ...filters, rarity })} layout="grid" options={CARD_RARITIES.map(value => ({ value, label: zh ? rarityLabels[value] : value, iconOnly: true, icon: <FilterIcon src={RARITY_ICONS[value]} /> }))} />
    <CustomSelect className="filter-expansion-select" label={`${prefix}扩展包筛选`} value={filters.expansion} onChange={expansion => onChange({ ...filters, expansion })} options={expansionOptions(expansions, language)} />
  </>;
}
