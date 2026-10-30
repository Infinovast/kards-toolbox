import localforage from 'localforage';
import { validateCardRecords, type CardDataStorage } from './cardData';

// Kept outside user backup keys, just like ordinary card-image caches.
export const CARD_DATABASE_KEY = 'kards_card_database_v1';

export async function readCardDataStorage(): Promise<CardDataStorage> {
  const stored = await localforage.getItem<CardDataStorage>(CARD_DATABASE_KEY);
  if (!stored) return { schemaVersion: 1 };
  if (stored.schemaVersion !== 1) throw new Error('本地更新牌库版本不受支持');
  if (stored.active) stored.active.cards = validateCardRecords(stored.active.cards);
  if (stored.previous) stored.previous.cards = validateCardRecords(stored.previous.cards);
  if (stored.pending) stored.pending.cards = validateCardRecords(stored.pending.cards);
  return stored;
}

export async function writeCardDataStorage(stored: CardDataStorage) {
  // One IndexedDB value contains active + rollback + candidate, so a failed write
  // cannot leave a half-applied catalogue or destroy the rollback copy.
  await localforage.setItem(CARD_DATABASE_KEY, stored);
}
