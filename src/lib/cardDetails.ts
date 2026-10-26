import type { CardLanguage, KardsCardRecord } from '../types/card';

const keywordNames: Record<string, string> = {
  blitz: '闪击', guard: '守护', smokescreen: '烟幕', fury: '奋战', ambush: '伏击',
  shock: '冲击', alpine: '山地', pincer: '钳击', mobilize: '动员',
};

export function cardKeywords(card: KardsCardRecord, language: CardLanguage): string[] {
  return (card.json.attributes || []).filter(attribute => !attribute.startsWith('VeteranOf:')
    && !attribute.startsWith('BecomesVeteran:') && attribute !== 'OnlySpawnable').map(attribute => {
    if (!language.startsWith('zh')) return attribute;
    if (keywordNames[attribute]) return keywordNames[attribute];
    if (/^heavyArmor\d+$/.test(attribute)) return `重甲 ${attribute.slice(10)}`;
    if (/^intel\d+$/.test(attribute)) return `情报 ${attribute.slice(5)}`;
    return attribute;
  });
}

export function cardRelations(card: KardsCardRecord) {
  const attributes = card.json.attributes || [];
  const related = (prefix: string) => attributes.filter(value => value.startsWith(prefix)).map(value => value.slice(prefix.length));
  return [
    ...related('BecomesVeteran:').map(cardId => ({ cardId, label: '老兵形态' })),
    ...related('VeteranOf:').map(cardId => ({ cardId, label: '原卡' })),
    ...(card.json.can_create || []).map(cardId => ({ cardId, label: '可生成' })),
  ];
}
