import test from 'node:test';
import assert from 'node:assert/strict';
import { unitPrice, lineTotal, formatUnitPrice } from '../src/lib/units.js';
import { median, priceHistory, productStats, rate } from '../src/lib/stats.js';
import { makeExport, parseImport } from '../src/lib/backup.js';
import { parseChecklist } from '../src/lib/notes.js';

test('unit price: 32 oz yogurt at $5.99 is about $0.19/oz', () => {
  const up = unitPrice({ price: 5.99, size: 32, unit: 'oz' });
  assert.equal(up.label, 'oz');
  assert.equal(formatUnitPrice(up), '$0.187/oz');
});

test('unit price converts lb and g to oz', () => {
  assert.equal(unitPrice({ price: 16, size: 1, unit: 'lb' }).value, 1);
  assert.ok(Math.abs(unitPrice({ price: 10, size: 1, unit: 'kg' }).value - 10 / 35.2739619) < 1e-9);
});

test('unit price without size is per item', () => {
  assert.deepEqual(unitPrice({ price: 3, size: '', unit: 'oz' }), { value: 3, family: 'each', label: 'ea' });
  assert.equal(unitPrice({ price: 'abc' }), null);
});

test('line total uses quantity', () => {
  assert.equal(lineTotal({ price: 2.5, qty: 3 }), 7.5);
  assert.equal(lineTotal({ price: 2.5, qty: '' }), 2.5);
});

test('median', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([1, 2, 3, 4]), 2.5);
  assert.equal(median([]), null);
});

test('stats: last, lowest, median', () => {
  const trips = { a: { date: '2026-01-01', storeId: 's' }, b: { date: '2026-02-01', storeId: 's' }, c: { date: '2026-03-01', storeId: 's' } };
  const stores = { s: { name: 'Costco' } };
  const lines = [
    { tripId: 'a', price: 0.19, size: 1, unit: 'oz' },
    { tripId: 'b', price: 0.15, size: 1, unit: 'oz' },
    { tripId: 'c', price: 0.22, size: 1, unit: 'oz' },
  ];
  const st = productStats(priceHistory(lines, trips, stores));
  assert.equal(st.last.unit.value, 0.22);
  assert.equal(st.lowest.unit.value, 0.15);
  assert.equal(st.median.value, 0.19);
  assert.equal(st.lastStore, 'Costco');
  assert.equal(rate(0.15, st), 'good');
  assert.equal(rate(0.25, st), 'high');
  assert.equal(rate(0.19, st), 'ok');
});

test('stats never mix unit families', () => {
  const trips = { a: { date: '2026-01-01' }, b: { date: '2026-02-01' } };
  const lines = [
    { tripId: 'a', price: 1, size: '', unit: 'ea' },
    { tripId: 'b', price: 6, size: 12, unit: 'oz' },
  ];
  const st = productStats(priceHistory(lines, trips, {}));
  assert.equal(st.lowest.unit.family, 'weight');
});

test('export then import round-trips', () => {
  const data = { stores: [{ id: '1', name: 'Walmart' }], products: [], trips: [], lines: [], wants: [{ id: 'w', name: 'Blender' }], groceries: [], settings: [{ id: 'brandSizes', value: {} }] };
  const back = parseImport(JSON.stringify(makeExport(data)));
  assert.deepEqual(back, data);
});

test('import rejects other files', () => {
  assert.throws(() => parseImport('nope'), /not valid JSON/);
  assert.throws(() => parseImport('{"app":"x"}'), /not a Cartwise backup/);
  assert.throws(() => parseImport({ app: 'cartwise', version: 99, data: {} }), /newer version/);
});

test('Notes checklist: groups, checked state, and outer sections', () => {
  const text = `Shopping

Barbour
- [ ] Powell Quilted Jacket
Charles Trywhitt (wait for $40 deals)
- [ ] Linen
- [x] Flannel
Electronics`;
  const rows = parseChecklist(text);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { name: 'Powell Quilted Jacket', checked: false, group: 'Barbour', outer: 'Shopping' });
  assert.equal(rows[2].group, 'Charles Trywhitt (wait for $40 deals)');
  assert.equal(rows[2].checked, true);
});

test('Notes checklist: store section with category headers', () => {
  const text = `Protein
- [x] Eggs
Other
- [ ] Pickles

Walmart
Protein
- [x] Fairlife milk
Fat
- [x] Lite Mayo`;
  const rows = parseChecklist(text);
  assert.deepEqual(rows.map((r) => [r.name, r.group, r.outer]), [
    ['Eggs', 'Protein', ''],
    ['Pickles', 'Other', ''],
    ['Fairlife milk', 'Protein', 'Walmart'],
    ['Lite Mayo', 'Fat', 'Walmart'],
  ]);
});

test('Notes checklist: unicode checkboxes', () => {
  const rows = parseChecklist('☐ Rice cooker\n☑ Blender');
  assert.deepEqual(rows.map((r) => r.checked), [false, true]);
});

test('same-day purchases: the one logged later counts as last', () => {
  const trips = { a: { date: '2026-03-01', createdAt: 1 }, b: { date: '2026-03-01', createdAt: 2 } };
  const lines = [
    { tripId: 'b', price: 5.49, size: 32, unit: 'oz' },
    { tripId: 'a', price: 5.99, size: 32, unit: 'oz' },
  ];
  assert.equal(priceHistory(lines, trips, {})[0].price, 5.49);
});

test('older backups without settings still import', () => {
  const old = { app: 'cartwise', version: 1, data: { stores: [], products: [], trips: [], lines: [], wants: [], groceries: [] } };
  assert.deepEqual(parseImport(old).settings, []);
});
