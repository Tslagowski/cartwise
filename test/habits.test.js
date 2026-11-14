import test from 'node:test';
import assert from 'node:assert/strict';
import { restockInfo, runningLow, addBoughtDate } from '../src/lib/restock.js';
import { addSize, removeSize, sizeSuggestions } from '../src/lib/sizes.js';

test('restock: usual gap from purchase dates', () => {
  const info = restockInfo(['2026-10-01', '2026-10-10', '2026-10-19'], '2026-10-27');
  assert.equal(info.every, 9);
  assert.equal(info.last, '2026-10-19');
  assert.equal(info.daysSince, 8);
  assert.equal(info.daysLeft, 1);
});

test('restock: needs two dates, ignores same-trip duplicates', () => {
  assert.equal(restockInfo(['2026-10-01'], '2026-10-05'), null);
  assert.equal(restockInfo(['2026-10-01', '2026-10-02'], '2026-10-05'), null);
  assert.equal(restockInfo(['2026-10-01', '2026-10-01', '2026-10-15'], '2026-10-20').every, 14);
});

test('runningLow: only stocked, not snoozed, due within a day', () => {
  const dates = { a: ['2026-10-01', '2026-10-08'], b: ['2026-10-01', '2026-10-30'], c: ['2026-10-01', '2026-10-08'], d: ['2026-10-01', '2026-10-08'] };
  const items = [
    { id: 'a', status: 'stocked' },                          // every 7, 7 days since -> due
    { id: 'b', status: 'stocked' },                          // every 29, 1 day since -> not due
    { id: 'c', status: 'need' },                             // already on the list
    { id: 'd', status: 'stocked', snoozeUntil: '2026-10-20' }, // snoozed
  ];
  const out = runningLow(items, (g) => dates[g.id], '2026-10-15');
  assert.deepEqual(out.map((x) => x.item.id), ['a']);
});

test('addBoughtDate dedupes and keeps the last 12', () => {
  assert.deepEqual(addBoughtDate(['2026-10-01'], '2026-10-01'), ['2026-10-01']);
  const many = Array.from({ length: 12 }, (_, i) => `2026-01-${String(i + 1).padStart(2, '0')}`);
  const out = addBoughtDate(many, '2026-02-01');
  assert.equal(out.length, 12);
  assert.equal(out.at(-1), '2026-02-01');
});

test('sizes: save, dedupe, remove', () => {
  let m = addSize({}, 'Vuori', 'L');
  m = addSize(m, 'vuori', 'l');
  m = addSize(m, 'Vuori', '32" inseam');
  assert.deepEqual(m.vuori.sizes, ['L', '32" inseam']);
  m = removeSize(m, 'Vuori', 'L');
  assert.deepEqual(m.vuori.sizes, ['32" inseam']);
  assert.deepEqual(removeSize(m, 'Vuori', '32" inseam'), {});
});

test('sizes: suggestions are saved sizes first, then sizes used on other wishes', () => {
  const m = addSize({}, 'Vuori', 'L');
  const wants = [
    { id: '1', brand: 'Vuori', details: '33x34 athletic' },
    { id: '2', brand: 'vuori', details: 'L' },
    { id: '3', brand: 'Bonobos', details: '33x34' },
    { id: '4', brand: 'Vuori', details: 'charcoal' },
  ];
  assert.deepEqual(sizeSuggestions(m, wants, 'Vuori', '4'), [
    { size: 'L', saved: true },
    { size: '33x34 athletic', saved: false },
  ]);
  assert.deepEqual(sizeSuggestions(m, wants, '', null), []);
});
