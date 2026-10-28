import assert from 'node:assert/strict';
import { paginationItems } from './pagination';

assert.deepEqual(paginationItems(9, 32), [1, 'start-gap', 6, 7, 8, 9, 10, 11, 12, 'end-gap', 32]);
assert.deepEqual(paginationItems(1, 1), [1]);
assert.deepEqual(paginationItems(0, 0), [1]);
assert.deepEqual(paginationItems(4, 8), [1, 2, 3, 4, 5, 6, 7, 8]);
assert.deepEqual(paginationItems(1, 32), [1, 2, 3, 4, 5, 6, 7, 8, 'end-gap', 32]);
assert.deepEqual(paginationItems(32, 32), [1, 'start-gap', 25, 26, 27, 28, 29, 30, 31, 32]);
for (const count of [12, 13, 32, 101]) for (let page = 1; page <= count; page++) {
  const items = paginationItems(page, count);
  const numbers = items.filter((item): item is number => typeof item === 'number');
  assert.equal(numbers[0], 1);
  assert.equal(numbers.at(-1), count);
  assert.ok(numbers.includes(page));
  assert.equal(new Set(items).size, items.length, 'page numbers and gap keys are unique');
  assert.deepEqual(numbers, [...numbers].sort((a, b) => a - b));
  assert.ok(items.length <= 12, 'pagination remains bounded as the page count grows');
}
console.log('Pagination tests passed: reference layout, small counts, boundaries and stable keys');
