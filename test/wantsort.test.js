import test from 'node:test';
import assert from 'node:assert/strict';
import { sortWants, rankBetween, normalizeRanks, wantPrice } from '../src/lib/wantsort.js';

const W = [
  { id: 'a', name: 'Blender', brand: '', priority: 'Medium', targetPrice: 80, createdAt: '2026-11-01', rank: 3072 },
  { id: 'b', name: 'Jacket', brand: 'Barbour', priority: 'High', sitePrice: 450, createdAt: '2026-11-10', rank: 1024 },
  { id: 'c', name: 'Chinos', brand: 'Bonobos', priority: 'Low', createdAt: '2026-11-05', rank: 2048 },
  { id: 'd', name: 'Rice cooker', brand: '', priority: 'Medium', createdAt: '2026-11-03' },
];
const ids = (xs) => xs.map((x) => x.id).join('');

test('custom order uses rank; never-arranged items fall back to oldest first after ranked ones', () => {
  assert.equal(ids(sortWants(W, 'custom')), 'bcad');
});

test('price sorts put items without a price last both ways', () => {
  const paid = (w) => (w.id === 'c' ? 60 : null);
  assert.equal(ids(sortWants(W, 'priceAsc', paid)), 'cabd');
  assert.equal(ids(sortWants(W, 'priceDesc', paid)), 'bacd');
});

test('wantPrice prefers target, then site price, then paid', () => {
  assert.equal(wantPrice({ targetPrice: 40, sitePrice: 50 }, () => 30), 40);
  assert.equal(wantPrice({ sitePrice: 50 }, () => 30), 50);
  assert.equal(wantPrice({}, () => 30), 30);
  assert.equal(wantPrice({}), null);
});

test('priority, newest, oldest, brand, name', () => {
  assert.equal(ids(sortWants(W, 'priority')), 'badc');
  assert.equal(ids(sortWants(W, 'newest')), 'bcda');
  assert.equal(ids(sortWants(W, 'oldest')), 'adcb');
  assert.equal(ids(sortWants(W, 'brand')), 'bcad');
  assert.equal(ids(sortWants(W, 'name')), 'acbd');
});

test('rankBetween lands between neighbours, or past the ends', () => {
  assert.equal(rankBetween({ rank: 1024 }, { rank: 2048 }), 1536);
  assert.equal(rankBetween(null, { rank: 1024 }), 0);
  assert.equal(rankBetween({ rank: 3072 }, null), 4096);
});

test('normalizeRanks spaces items out in their current order and returns only changes', () => {
  const out = normalizeRanks(W);
  const all = Object.fromEntries(W.map((w) => [w.id, w.rank]));
  for (const w of out) all[w.id] = w.rank;
  assert.deepEqual(all, { b: 1024, c: 2048, a: 3072, d: 4096 });
  assert.deepEqual(out.map((w) => w.id), ['d']);
});
