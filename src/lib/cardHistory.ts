import dataset from '../data/cardHistory.json';

export type CardHistoryAttributeField = 'kredits' | 'operationCost' | 'attack' | 'defense' | 'rarity' | 'type' | 'faction';

type Change =
  | { type: 'attribute'; field: CardHistoryAttributeField; from: number | string; to: number | string }
  | { type: 'modify_effect'; old: string | null; new: string | null }
  | { type: 'add_keyword' | 'remove_keyword'; keywords: string[] }
  | { type: 'add_effect' | 'remove_effect'; text: string };

interface CardChange {
  cardIds: string[];
  sourceLine: number;
  status?: 'discarded' | 'unannounced';
  changes: Change[];
  note?: string;
  needs_review?: string[];
  raw: string[];
}

interface VersionNote {
  cardIds: string[];
  sourceLine: number;
  text: string;
}

export interface CardHistoryVersion {
  version: string;
  events: (CardChange | VersionNote)[];
}

const byCard = new Map<string, CardHistoryVersion[]>();

for (const version of [...dataset.versions].reverse()) {
  const events: CardHistoryVersion['events'] = [...version.cards as CardChange[], ...version.notes];
  events.sort((a, b) => a.sourceLine - b.sourceLine);
  const byVersion = new Map<string, CardHistoryVersion>();
  for (const event of events) {
    for (const cardId of event.cardIds) {
      let entry = byVersion.get(cardId);
      if (!entry) {
        entry = { version: version.version, events: [] };
        byVersion.set(cardId, entry);
        const history = byCard.get(cardId);
        if (history) history.push(entry);
        else byCard.set(cardId, [entry]);
      }
      entry.events.push(event);
    }
  }
}

export function cardHistory(cardId: string): readonly CardHistoryVersion[] {
  return byCard.get(cardId) || [];
}
