import test from 'node:test';
import assert from 'node:assert/strict';
import { sparkPath, sparkEnd } from '../src/lib/spark.js';
import { priceHistory, lastRating, trendValues } from '../src/lib/stats.js';

test('sparkline needs two points', () => {
  assert.equal(sparkPath([1], 100, 20), '');
});

test('sparkline scales min to bottom and max to top', () => {
  assert.equal(sparkPath([1, 3], 100, 20, 0), 'M0.0 20.0 L100.0 0.0');
  assert.deepEqual(sparkEnd([1, 3], 100, 20, 0), { x: 100, y: 0 });
});

test('flat sparkline sits in the middle', () => {
  assert.equal(sparkPath([2, 2, 2], 10, 20, 0), 'M0.0 10.0 L5.0 10.0 L10.0 10.0');
});

const trips = { a: { date: '2026-01-01' }, b: { date: '2026-02-01' }, c: { date: '2026-03-01' } };
const hist = (prices) =>
  priceHistory(prices.map((p, i) => ({ tripId: 'abc'[i], price: p, size: 1, unit: 'oz' })), trips, {});

test('last purchase rated against earlier ones', () => {
  assert.equal(lastRating(hist([1.0, 1.0, 0.8])), 'good');
  assert.equal(lastRating(hist([1.0, 1.0, 1.5])), 'high');
  assert.equal(lastRating(hist([1.0])), null);
});

test('trend values run oldest to newest', () => {
  assert.deepEqual(trendValues(hist([1, 2, 3])), [1, 2, 3]);
});
