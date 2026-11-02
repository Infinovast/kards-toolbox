import assert from 'node:assert/strict';
import { summarizeDeckCosts } from './deckCostCurve';
import type { KardsCardRecord } from '../types/card';

const cards: KardsCardRecord[] = [
  { id: 1, cardId: 'free_unit', importId: 'a1', json: { type: 'infantry', kredits: 0, operationCost: 0, rarity: 'Standard' } },
  { id: 2, cardId: 'order', importId: 'a2', json: { type: 'order', kredits: 2, operationCost: 99, rarity: 'Limited' } },
  { id: 3, cardId: 'counter', importId: 'a3', json: { type: 'countermeasure', kredits: 2, rarity: 'Limited' } },
  { id: 4, cardId: 'expensive_unit', importId: 'a4', json: { type: 'tank', kredits: 8, operationCost: 9, rarity: 'Elite' } },
  { id: 5, cardId: 'seven_cost_order', importId: 'a5', json: { type: 'Order', kredits: 7, rarity: 'Special' } },
  { id: 6, cardId: 'fighter', importId: 'a6', json: { type: 'fighter', kredits: 3, operationCost: 1, rarity: 'Special' } },
  { id: 7, cardId: 'bomber', importId: 'a7', json: { type: 'Bomber', kredits: 4, operationCost: 1, rarity: 'Elite' } },
  { id: 8, cardId: 'missing_operation', importId: 'a8', json: { type: 'infantry', kredits: 6 } },
  { id: 9, cardId: 'negative_operation', importId: 'a9', json: { type: 'artillery', kredits: 1, operationCost: -1 } },
  { id: 10, cardId: 'invalid_operation', importId: 'a0', json: { type: 'infantry', kredits: 2, operationCost: NaN } },
];
const index = new Map(cards.map(card => [card.importId, card]));
const entries = new Map([['a1', 4], ['a2', 3], ['a3', 2], ['a4', 2], ['a5', 1], ['a6', 2], ['a7', 1], ['a8', 1], ['a9', 1], ['a0', 1], ['missing', 3]]);
const curve = summarizeDeckCosts(entries, index);
assert.equal(curve.buckets.length, 8);
assert.deepEqual(curve.buckets[0], { army: 4, air: 0, order: 0, countermeasure: 0, total: 4 });
assert.deepEqual(curve.buckets[2], { army: 1, air: 0, order: 3, countermeasure: 2, total: 6 });
assert.deepEqual(curve.buckets[7], { army: 2, air: 0, order: 1, countermeasure: 0, total: 3 });
assert.deepEqual(curve.totals, { army: 9, air: 3, order: 4, countermeasure: 2 });
assert.deepEqual(curve.rarities, { Standard: 7, Limited: 5, Elite: 3, Special: 3 }, 'rarities count copies and match preset-cover fallback for missing rarity');
assert.equal(curve.max, 6);
assert.equal(curve.buckets.reduce((sum, bucket) => sum + bucket.total, 0), 18, 'count copies, exclude missing data and do not add headquarters');
assert.deepEqual(curve.operationBuckets[0], { army: 4, air: 0, order: 0, countermeasure: 0, total: 4 }, 'zero operation cost is valid');
assert.deepEqual(curve.operationBuckets[1], { army: 0, air: 3, order: 0, countermeasure: 0, total: 3 });
assert.deepEqual(curve.operationBuckets[7], { army: 2, air: 0, order: 0, countermeasure: 0, total: 2 }, 'operation costs >=7 share the last bucket');
assert.equal(curve.operationBuckets.reduce((sum, bucket) => sum + bucket.total, 0), 9, 'only units with valid operation costs are counted');
assert.equal(curve.averages.cost, 52 / 18, 'averages use actual costs and copy counts, not capped buckets');
assert.equal(curve.averages.unitDeployment, 35 / 12);
assert.equal(curve.averages.unitOperation, 21 / 9);
assert.equal(summarizeDeckCosts(new Map([['a6', 10], ['a7', 10]]), index).max, 20, 'deployment and operation stacks share one scale');
const removed = summarizeDeckCosts(new Map([['a1', 0], ['a2', -1]]), index);
assert.equal(removed.max, 1);
assert.ok(removed.buckets.every(bucket => bucket.total === 0));
assert.ok(removed.operationBuckets.every(bucket => bucket.total === 0));
assert.deepEqual(summarizeDeckCosts(new Map(), index).totals, { army: 0, air: 0, order: 0, countermeasure: 0 });
assert.deepEqual(summarizeDeckCosts(new Map(), index).rarities, {});
assert.deepEqual(summarizeDeckCosts(new Map(), index).averages, { cost: 0, unitDeployment: 0, unitOperation: 0 });
assert.deepEqual(summarizeDeckCosts(new Map([['a2', 3], ['a3', 2]]), index).averages, { cost: 2, unitDeployment: 0, unitOperation: 0 });
console.log('Deck cost curve tests passed: army/air categories, deployment/operation, weighted averages, 0K/7K+, missing data and empty deck');
