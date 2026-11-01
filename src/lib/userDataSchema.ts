import { decodeDeckCode } from './deckCode';
import { validatePackHistory } from './packHistory';
import { CARD_FACTIONS } from '../types/card';

export const USER_DATA_KEYS = [
  'kards_decks', 'kards_builder_draft', 'kards_collections', 'kards_custom_categories',
  'kards_settings', 'kards_selected_tablecloth', 'kards_custom_tablecloths', 'kards_pack_history_v1',
] as const;

export type UserDataKey = typeof USER_DATA_KEYS[number];
export type UserDataValues = Partial<Record<UserDataKey, unknown>>;
const object = (value: unknown): value is Record<string, any> => !!value && typeof value === 'object' && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === 'string');
const count = (value: unknown) => Number.isSafeInteger(value) && (value as number) >= 0;
const optional = (value: unknown, check: (value: any) => boolean) => value === undefined || check(value);
const nation = (value: unknown) => CARD_FACTIONS.some(faction => faction.id !== 'Neutral' && faction.id === value);
const uniqueIds = (values: { id: string }[]) => new Set(values.map(value => value.id)).size === values.length;
const rules = (value: unknown) => object(value) && ['deckSize', 'maxStandard', 'maxLimited', 'maxSpecial', 'maxElite', 'maxAllyCards'].every(key => count(value[key]))
  && typeof value.allowReserved === 'boolean' && typeof value.allowGenerated === 'boolean';

export function validateUserDataValue(key: string, value: unknown) {
  if (!USER_DATA_KEYS.includes(key as UserDataKey) && !key.startsWith('deck_img_')) throw new Error(`不支持的备份项目：${key}`);
  if (value === null || value === undefined) return;
  let valid = false;
  switch (key) {
    case 'kards_decks':
      valid = Array.isArray(value) && value.every(deck => object(deck) && typeof deck.id === 'string' && !!deck.id
        && typeof deck.name === 'string' && typeof deck.code === 'string' && nation(deck.mainNation)
        && optional(deck.allyNation, nation) && optional(deck.tags, strings)
        && optional(deck.warnings, strings) && optional(deck.totalCards, count)
        && optional(deck.isFavorite, item => typeof item === 'boolean') && optional(deck.isArena, item => typeof item === 'boolean')
        && optional(deck.ruleSet, item => ['standard', 'arena', 'custom'].includes(item)) && optional(deck.customRules, rules)
        && ['cardBackUrl', 'cardBackNation', 'headquartersId'].every(key => optional(deck[key], item => typeof item === 'string')));
      if (valid) {
        valid = uniqueIds(value as { id: string }[]);
        for (const deck of value as { code: string }[]) decodeDeckCode(deck.code);
      }
      break;
    case 'kards_collections':
      valid = Array.isArray(value) && value.every(folder => object(folder) && typeof folder.id === 'string' && !!folder.id
        && typeof folder.name === 'string' && strings(folder.deckIds) && optional(folder.isFavorite, item => typeof item === 'boolean')
        && optional(folder.createdAt, item => typeof item === 'number' && Number.isFinite(item))) && uniqueIds(value);
      break;
    case 'kards_custom_categories':
      valid = Array.isArray(value) && value.every(category => object(category) && typeof category.id === 'string'
        && typeof category.name === 'string' && Array.isArray(category.backs) && category.backs.every((back: unknown) => object(back)
          && ['id', 'url', 'name'].every(key => typeof back[key] === 'string')));
      break;
    case 'kards_custom_tablecloths': valid = strings(value); break;
    case 'kards_selected_tablecloth': valid = typeof value === 'string'; break;
    case 'kards_settings':
      valid = object(value)
        && ['borderRadius', 'importBoxOpacity', 'logoSize', 'logoOpacity', 'uiScale', 'deckGap'].every(key => optional(value[key], item => typeof item === 'number' && Number.isFinite(item)))
        && optional(value.displayMode, item => ['dark', 'light', 'system'].includes(item))
        && optional(value.cardDetailMode, item => ['modal', 'sidebar'].includes(item))
        && optional(value.showDeckFolders, item => typeof item === 'boolean')
        && optional(value.isDarkMode, item => typeof item === 'boolean')
        && optional(value.lightThemeColor, item => typeof item === 'string');
      break;
    case 'kards_builder_draft':
      valid = object(value) && nation(value.mainNation) && nation(value.allyNation) && typeof value.deckName === 'string'
        && optional(value.deckId, item => typeof item === 'string') && optional(value.headquartersId, item => typeof item === 'string')
        && ['standard', 'arena', 'custom'].includes(value.ruleSet) && optional(value.customRules, rules)
        && Array.isArray(value.entries) && value.entries.every((entry: unknown) => Array.isArray(entry) && entry.length === 2
          && typeof entry[0] === 'string' && count(entry[1]));
      break;
    case 'kards_pack_history_v1': validatePackHistory(value); valid = true; break;
    default: valid = typeof value === 'string';
  }
  if (!valid) throw new Error(`本地数据格式无效：${key}`);
}
