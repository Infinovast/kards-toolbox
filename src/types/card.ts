import { readCardDataStorage } from '../lib/cardDatabase';
import { validateCardRecords } from '../lib/cardData';

export interface KardsCardRecord {
  id: number;
  cardId: string;
  importId: string;
  reserved?: boolean;
  json: {
    id?: string;
    import_id?: string;
    title?: Record<string, string>;
    text?: Record<string, string>;
    description?: Record<string, string>;
    faction?: string;
    type?: string;
    kredits?: number;
    attack?: number;
    defense?: number;
    rarity?: string;
    set?: string;
    image?: string;
    attributes?: string[];
    [key: string]: unknown;
  };
}

export interface KardsCardDatabase {
  cards: KardsCardRecord[];
}

export const CARD_LANGUAGES = [
  { id: 'zh-Hans', label: '简体中文' },
  { id: 'zh-Hant', label: '繁體中文' },
  { id: 'en-EN', label: 'English' },
  { id: 'ja-JP', label: '日本語' },
  { id: 'ko-KR', label: '한국어' },
  { id: 'de-DE', label: 'Deutsch' },
  { id: 'fr-FR', label: 'Français' },
  { id: 'it-IT', label: 'Italiano' },
  { id: 'es-ES', label: 'Español' },
  { id: 'pt-BR', label: 'Português' },
  { id: 'pl-PL', label: 'Polski' },
  { id: 'ru-RU', label: 'Русский' },
] as const;

export type CardLanguage = typeof CARD_LANGUAGES[number]['id'];

export const CARD_FACTIONS = [
  { id: 'Germany', label: '德国' },
  { id: 'Britain', label: '英国' },
  { id: 'Japan', label: '日本' },
  { id: 'Soviet', label: '苏联' },
  { id: 'USA', label: '美国' },
  { id: 'France', label: '法国' },
  { id: 'Italy', label: '意大利' },
  { id: 'Poland', label: '波兰' },
  { id: 'Finland', label: '芬兰' },
  { id: 'Anzac', label: '澳新军团' },
  { id: 'Neutral', label: '中立' },
] as const;

export const CARD_TYPES = [
  { id: 'infantry', label: '步兵' },
  { id: 'tank', label: '坦克' },
  { id: 'fighter', label: '战斗机' },
  { id: 'bomber', label: '轰炸机' },
  { id: 'artillery', label: '火炮' },
  { id: 'order', label: '指令' },
  { id: 'countermeasure', label: '反制' },
] as const;

export const CARD_RARITIES = ['Standard', 'Limited', 'Special', 'Elite'] as const;

export function cardTitle(card: KardsCardRecord, language: CardLanguage): string {
  const titles = card.json.title || {};
  return titles[language] || titles['zh-Hans'] || titles['en-EN'] || card.cardId;
}

export function cardText(card: KardsCardRecord, language: CardLanguage): string {
  const text = card.json.text || card.json.description || {};
  return text[language] || text['zh-Hans'] || text['en-EN'] || '';
}

export function factionLabel(faction?: string): string {
  return CARD_FACTIONS.find((item) => item.id.toLowerCase() === (faction || '').toLowerCase())?.label || faction || '未知';
}

export function typeLabel(type?: string): string {
  return CARD_TYPES.find((item) => item.id === (type || '').toLowerCase())?.label || type || '未知';
}

export function cardImageUrl(card: KardsCardRecord, language: CardLanguage, version: string): string {
  const image = card.json.image;
  if (!image) return '';
  const imagePath = `/images/card/${version}/${language}/${image}`
    .split('/')
    .map((part, index) => index < 4 ? part : encodeURIComponent(part))
    .join('/');
  return `https://images.weserv.nl/?url=ssl:www.kards.com${imagePath}&q=85`;
}

export async function loadCardDatabase(): Promise<KardsCardRecord[]> {
  const stored = await readCardDataStorage();
  if (stored.active) return stored.active.cards;
  const url = new URL('./data/cards-v54.json', window.location.href);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`读取本地卡牌目录失败（${response.status}）`);
  const database = await response.json() as KardsCardDatabase;
  if (!Array.isArray(database.cards)) throw new Error('本地卡牌目录格式无效');
  return validateCardRecords(database.cards);
}
