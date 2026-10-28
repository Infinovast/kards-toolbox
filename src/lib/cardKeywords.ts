import type { CardLanguage, KardsCardRecord } from '../types/card';

/** Shared attribute names for filtering, detail labels and rules-text emphasis. */
export const CARD_KEYWORDS = [
  { id: 'blitz', label: '闪击', english: 'Blitz', highlighted: true },
  { id: 'ambush', label: '伏击', english: 'Ambush', highlighted: true },
  { id: 'shock', label: '冲击', english: 'Shock', highlighted: true },
  { id: 'guard', label: '守护', english: 'Guard', highlighted: true },
  { id: 'fury', label: '奋战', english: 'Fury', highlighted: true },
  { id: 'smokescreen', label: '烟幕', english: 'Smokescreen', highlighted: true },
  { id: 'heavyArmor', label: '重甲', english: 'Heavy Armor', highlighted: false },
  { id: 'salvage', label: '收缴', english: 'Salvage', highlighted: false },
  { id: 'covert', label: '隐蔽', english: 'Covert', highlighted: false },
  { id: 'bond', label: '协力', english: 'Bond', highlighted: false },
  { id: 'mobilize', label: '动员', english: 'Mobilize', highlighted: false },
  { id: 'intel', label: '情报', english: 'Intel', highlighted: false },
  { id: 'alpine', label: '山地', english: 'Alpine', highlighted: false },
  { id: 'pincer', label: '钳击', english: 'Pincer', highlighted: false },
  { id: 'exile', label: '流亡', english: 'Exile', highlighted: false },
  { id: 'veteran', label: '老兵', english: 'Veteran', highlighted: false },
] as const;

const definitions = new Map<string, typeof CARD_KEYWORDS[number]>(CARD_KEYWORDS.map(item => [item.id.toLowerCase(), item]));

function attributeKeyword(attribute: string) {
  const key = attribute.split(':')[0].toLowerCase();
  if (key === 'onlyspawnable') return null;
  if (key === 'becomesveteran' || key === 'veteranof') return { id: 'veteran', amount: '' };
  const numbered = /^(heavyarmor|intel)(\d+|x)?$/.exec(key);
  const definition = definitions.get(numbered?.[1] || key);
  return { id: definition?.id || attribute, amount: numbered?.[2]?.toUpperCase() || '' };
}

function cardKeywordEntries(card: KardsCardRecord) {
  const entries = (card.json.attributes || []).flatMap(attribute => {
    const keyword = attributeKeyword(attribute);
    return keyword ? [keyword] : [];
  });
  // Official records store exile separately from attributes; expose it through
  // the same keyword semantics without changing the downloaded card data.
  if (card.json.exile && !entries.some(entry => entry.id === 'exile')) entries.push({ id: 'exile', amount: '' });
  return entries;
}

export function cardHasKeyword(card: KardsCardRecord, keyword: string) {
  const entries = cardKeywordEntries(card);
  return keyword === 'none' ? entries.length === 0 : entries.some(entry => entry.id === keyword);
}

export function cardKeywords(card: KardsCardRecord, language: CardLanguage): string[] {
  const zh = language.startsWith('zh');
  const displayCard = { ...card, json: { ...card.json, attributes: card.json.attributes?.filter(attribute => !/^BecomesVeteran(?::|$)/i.test(attribute)) } };
  return [...new Set(cardKeywordEntries(displayCard).map(({ id, amount }) => {
    const definition = definitions.get(id.toLowerCase());
    const label = definition ? zh ? definition.label : definition.english : id;
    return amount ? `${label} ${amount}` : label;
  }))];
}

const rulesOnlyKeywords = ['部署', '亡计', '免疫', '压制', '控制', '被收缴', '撤退', '抑制', '转换', '抉择', '开发', '抽取', '预报'];
const emphasizedKeywords = [...CARD_KEYWORDS.map(item => item.label), ...rulesOnlyKeywords].sort((a, b) => b.length - a.length);
export const CARD_TEXT_KEYWORDS = new RegExp(`(?:情报|重甲)(?:X|\\d+)|${emphasizedKeywords.join('|')}|战斗(?!机)`, 'gu');
