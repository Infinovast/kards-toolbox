import type { KardsCardRecord } from '../types/card';

export const DECK_COST_CATEGORIES = [
  { key: 'army', label: '陆军', shortLabel: '陆', color: '#416849' },
  { key: 'air', label: '空军', shortLabel: '空', color: '#477ca8' },
  { key: 'order', label: '指令', shortLabel: '指', color: '#ba7b1e' },
  { key: 'countermeasure', label: '反制指令', shortLabel: '反', color: '#101110' },
] as const;

export type DeckCostCategory = typeof DECK_COST_CATEGORIES[number]['key'];

export function summarizeDeckCosts(entries: Map<string, number>, cardsById: Map<string, KardsCardRecord>) {
  const emptyBucket = () => ({ army: 0, air: 0, order: 0, countermeasure: 0, total: 0 });
  const buckets = Array.from({ length: 8 }, emptyBucket);
  const operationBuckets = Array.from({ length: 8 }, emptyBucket);
  const totals = { army: 0, air: 0, order: 0, countermeasure: 0 };
  const rarities: Record<string, number> = {};
  let deploymentCost = 0, unitDeploymentCost = 0, operationCost = 0, unitCount = 0, operationCount = 0;
  const bucketFor = (cost: number) => Math.min(7, Math.trunc(cost));
  for (const [id, count] of entries) {
    const card = cardsById.get(id);
    if (!card || count <= 0) continue;
    const rarity = card.json.rarity || 'Standard';
    rarities[rarity] = (rarities[rarity] || 0) + count;
    const rawCost = card.json.kredits ?? 0;
    const cost = Number.isFinite(rawCost) ? Math.max(0, rawCost) : 0;
    const type = card.json.type?.toLowerCase();
    const category = type === 'order' || type === 'countermeasure' ? type : type === 'fighter' || type === 'bomber' ? 'air' : 'army';
    buckets[bucketFor(cost)][category] += count;
    buckets[bucketFor(cost)].total += count;
    totals[category] += count;
    deploymentCost += cost * count;
    if (category === 'army' || category === 'air') {
      unitDeploymentCost += cost * count;
      unitCount += count;
      const operation = card.json.operationCost;
      if (typeof operation === 'number' && Number.isFinite(operation) && operation >= 0) {
        operationBuckets[bucketFor(operation)][category] += count;
        operationBuckets[bucketFor(operation)].total += count;
        operationCost += operation * count;
        operationCount += count;
      }
    }
  }
  const totalCount = unitCount + totals.order + totals.countermeasure;
  return {
    buckets, operationBuckets, totals, rarities,
    max: Math.max(1, ...buckets.map(bucket => bucket.total), ...operationBuckets.map(bucket => bucket.total)),
    averages: {
      cost: totalCount ? deploymentCost / totalCount : 0,
      unitDeployment: unitCount ? unitDeploymentCost / unitCount : 0,
      unitOperation: operationCount ? operationCost / operationCount : 0,
    },
  };
}
