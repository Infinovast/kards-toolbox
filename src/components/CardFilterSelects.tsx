import type { CSSProperties } from 'react';
import { CARD_FACTIONS, CARD_RARITIES, CARD_TYPES, type CardLanguage } from '../types/card';
import CustomSelect, { type SelectOption } from './CustomSelect';
import type { CardFilters } from '../lib/cardFilters';

const ASSETS = './assets/filters/';
export function FilterIcon({ name, fullColor = false }: { name: string; fullColor?: boolean }) {
  // CSS custom-property URLs resolve against the stylesheet when mask-image is
  // applied. Resolve against the document first, including in packaged kards://.
  const maskUrl = new URL(`${ASSETS}${name}`, document.baseURI).href;
  return fullColor ? <img className="filter-symbol-image" src={`${ASSETS}${name}`} alt="" />
    : <span className="filter-symbol" style={{ '--filter-icon': `url("${maskUrl}")` } as CSSProperties} />;
}

const englishNations: Record<string, string> = { Soviet: 'Soviet Union', USA: 'United States', Anzac: 'ANZAC' };
const englishTypes: Record<string, string> = { infantry: 'Infantry', tank: 'Tank', fighter: 'Fighter', bomber: 'Bomber', artillery: 'Artillery', order: 'Order', countermeasure: 'Countermeasure' };
const rarityLabels = { Standard: '普通', Limited: '稀有', Special: '罕见', Elite: '精英' };
const setDefinitions = [
  ['Base', '基础', 'Base'], ['OceaniaStorm', '澳新风暴', 'Oceania Storm'], ['Homefront', '国土阵线', 'Homefront'],
  ['NavalWarfare', '海战', 'Naval Warfare'], ['BloodAndIron', '血与铁', 'Blood and Iron'], ['CovertOps', '秘密行动', 'Covert Ops'],
  ['WinterWar', '冬季战争', 'Winter War'], ['BrothersInArms', '战友', 'Brothers in Arms'], ['TheatersOfWar', '战区', 'Theaters of War'],
  ['WorldAtWar', '世纪大战', 'World at War'], ['Legions', '军团', 'Legions'], ['Breakthrough', '突破', 'Breakthrough'], ['Allegiance', '忠诚', 'Allegiance'],
  ['OnlySpawnable', '衍生卡', 'Generated cards'], ['Special', '特殊形态', 'Special forms'],
];
const chinese = (language: CardLanguage) => language.startsWith('zh');

export function nationOptions(language: CardLanguage = 'zh-Hans'): SelectOption[] {
  return CARD_FACTIONS.map(item => ({ value: item.id, label: chinese(language) ? item.label : englishNations[item.id] || item.id, icon: <FilterIcon name={`${item.id.toLowerCase()}.svg`} fullColor={item.id === 'Neutral'} /> }));
}

export function expansionOptions(available: string[], language: CardLanguage): SelectOption[] {
  const known = setDefinitions.filter(([id]) => available.includes(id));
  const extra = available.filter(id => !setDefinitions.some(([key]) => key === id)).map(id => [id, id, id]);
  return [{ value: 'All', label: chinese(language) ? '全部扩展包' : 'All sets', icon: <FilterIcon name="set-all.svg" /> }, ...[...known, ...extra].map(([id, zh, en]) => ({
    value: id, label: chinese(language) ? zh : en,
    icon: <FilterIcon name={setDefinitions.slice(0, 13).some(([key]) => key === id) ? `set-${id}.${['BrothersInArms', 'WorldAtWar'].includes(id) ? 'png' : 'svg'}` : 'set-all.svg'} />,
  }))];
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
    <CustomSelect label={`${prefix}类型筛选`} placeholder="类型" multiple value={filters.cardType} onChange={cardType => onChange({ ...filters, cardType })} layout="grid" options={CARD_TYPES.map(item => ({ value: item.id, label: zh ? item.label : englishTypes[item.id], icon: <FilterIcon name={`${item.id}.svg`} /> }))} />
    <CustomSelect label={`${prefix}费用筛选`} placeholder="费用" multiple value={filters.cost} onChange={cost => onChange({ ...filters, cost })} layout="grid" options={Array.from({ length: 8 }, (_, index) => ({ value: String(index), label: index === 7 ? '7K+' : `${index}K`, iconOnly: true, icon: <span className="filter-cost">{index}K{index === 7 ? '+' : ''}</span> }))} />
    <CustomSelect label={`${prefix}稀有度筛选`} placeholder="稀有度" multiple value={filters.rarity} onChange={rarity => onChange({ ...filters, rarity })} layout="grid" options={CARD_RARITIES.map(value => ({ value, label: zh ? rarityLabels[value] : value, iconOnly: true, icon: <FilterIcon name={`${value.toLowerCase()}.svg`} /> }))} />
    <CustomSelect label={`${prefix}扩展包筛选`} value={filters.expansion} onChange={expansion => onChange({ ...filters, expansion })} options={expansionOptions(expansions, language)} />
    <CustomSelect label={builder ? '构筑状态筛选' : '卡牌状态筛选'} value={filters.status} onChange={status => onChange({ ...filters, status })} options={[{ value: 'All', label: '全部状态' }, { value: 'active', label: '现役可构筑' }, { value: 'reserved', label: '预备卡' }, ...builder ? [] : [{ value: 'generated', label: '衍生/特殊形态' }]]} />
  </>;
}
