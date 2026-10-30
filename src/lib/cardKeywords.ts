import type { CardLanguage, KardsCardRecord } from '../types/card';
import keywordManifest from '../data/cardKeywords.json';

export interface CardKeywordDefinition {
  id: string;
  label: string;
  english: string;
  attribute: boolean;
  highlighted: boolean;
  icon?: string;
  numbered?: boolean;
  attributeAliases?: { key: string; display: boolean }[];
  excludeFollowing?: string[];
  filterGroup?: string;
  descriptionPrefix?: boolean;
  textMatch?: boolean;
  cardIds?: string[];
}

/** The three nested scopes share one manifest, including text-matching metadata. */
export const ALL_CARD_KEYWORDS: CardKeywordDefinition[] = keywordManifest;
export const CARD_KEYWORDS = ALL_CARD_KEYWORDS.filter(item => item.attribute);
export const COMBAT_KEYWORDS = CARD_KEYWORDS.filter(item => item.highlighted);
export const KEYWORD_FILTER_GROUPS = [
  { id: 'combat', label: '对战词条', english: 'Combat' },
  { id: 'independent', label: '独立词条', english: 'Independent' },
  { id: 'extended', label: '扩展词条', english: 'Extended' },
].map(group => ({ ...group, keywords: ALL_CARD_KEYWORDS.filter(item => item.filterGroup === group.id) }));
const definitions = new Map(ALL_CARD_KEYWORDS.map(item => [item.id.toLowerCase(), item]));
const attributeDefinitions = new Map(CARD_KEYWORDS.flatMap(definition => [
  { key: definition.id, display: true }, ...(definition.attributeAliases || []),
].map(alias => [alias.key.toLowerCase(), { definition, display: alias.display }] as const)));

function attributeKeyword(attribute: string, forDisplay: boolean) {
  const key = attribute.split(':')[0].toLowerCase();
  if (key === 'onlyspawnable') return null;
  const numbered = /^(.+?)(\d+|x)$/.exec(key);
  const entry = attributeDefinitions.get(key) || (numbered && attributeDefinitions.get(numbered[1]));
  if (entry && forDisplay && !entry.display) return null;
  if (!entry || (numbered && !entry.definition.numbered)) return { id: attribute, amount: '' };
  return { id: entry.definition.id, amount: entry.definition.numbered ? numbered?.[2]?.toUpperCase() || '' : '' };
}

function cardKeywordEntries(card: KardsCardRecord, forDisplay = false) {
  const entries = (card.json.attributes || []).flatMap(attribute => {
    const keyword = attributeKeyword(attribute, forDisplay);
    return keyword ? [keyword] : [];
  });
  // Official records store exile separately from attributes; expose it through
  // the same keyword semantics without changing the downloaded card data.
  if (card.json.exile && !entries.some(entry => entry.id === 'exile')) entries.push({ id: 'exile', amount: '' });
  return entries;
}

export function cardHasKeyword(card: KardsCardRecord, keyword: string) {
  const entries = cardKeywordEntries(card);
  const definition = definitions.get(keyword.toLowerCase());
  if (keyword === 'none') return !entries.some(entry => {
    const group = definitions.get(entry.id.toLowerCase())?.filterGroup;
    return group === 'combat' || group === 'independent';
  });
  // Official and imported catalogues use text and description respectively.
  const descriptions = Object.values({ ...card.json.text, ...card.json.description });
  if (keyword === 'noDescription') return descriptions.every(text => !text.trim());
  if (definition?.cardIds) return definition.cardIds.includes(card.cardId);
  if (definition?.descriptionPrefix) {
    const pattern = new RegExp(`(?:${escapePattern(definition.label)}|\\b${escapePattern(definition.english)}\\b)\\s*[:：]`, 'iu');
    return descriptions.some(text => pattern.test(text));
  }
  return entries.some(entry => entry.id === keyword);
}

export function cardKeywordItems(card: KardsCardRecord, language: CardLanguage) {
  const zh = language.startsWith('zh');
  const seen = new Set<string>();
  return cardKeywordEntries(card, true).flatMap(({ id, amount }) => {
    const definition = definitions.get(id.toLowerCase());
    const label = definition ? zh ? definition.label : definition.english : id;
    const text = amount ? `${label} ${amount}` : label;
    if (seen.has(text)) return [];
    seen.add(text);
    return [{ id, label: text, icon: definition?.icon }];
  });
}

export function cardKeywords(card: KardsCardRecord, language: CardLanguage): string[] {
  return cardKeywordItems(card, language).map(item => item.label);
}

const escapePattern = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const textDefinitions = ALL_CARD_KEYWORDS.filter(item => item.textMatch !== false).sort((a, b) => b.label.length - a.label.length);
export const CARD_TEXT_KEYWORDS = new RegExp(textDefinitions.map((definition, index) => {
  const amount = definition.numbered ? '(?:[ \\t]*(?:\\d+|X))?' : '';
  const exclude = definition.excludeFollowing?.length ? `(?!${definition.excludeFollowing.map(escapePattern).join('|')})` : '';
  const chinese = `${escapePattern(definition.label)}${amount}${exclude}`;
  const english = `\\b${escapePattern(definition.english)}${amount}\\b`;
  return `(?<keyword${index}>${chinese}|${english})`;
}).join('|'), 'giu');

export function* cardTextKeywordMatches(text: string) {
  for (const match of text.matchAll(CARD_TEXT_KEYWORDS)) {
    const definition = textDefinitions.find((_, index) => match.groups?.[`keyword${index}`] !== undefined)!;
    yield { index: match.index, text: match[0], highlighted: definition.highlighted };
  }
}
