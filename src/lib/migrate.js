// One-time upgrades of stored records to the v0.3 shape. Returns write ops for changed records.
import { aisleFor, classifyWant } from './categorize.js';

export const SCHEMA = 2;

export function migrateGrocery(g) {
  if (g.v >= SCHEMA) return null;
  const status = g.status || (!g.checked ? 'need' : g.logged ? 'stocked' : 'cart');
  const { checked, logged, category, checkedAt, ...rest } = g;
  return { ...rest, status, aisle: aisleFor(g.name), store: g.store || '', v: SCHEMA };
}

export function migrateWant(w) {
  if (w.v >= SCHEMA) return null;
  const c = classifyWant(w.group || '', w.name);
  const { group, ...rest } = w;
  const notes = [w.notes, c.note].filter(Boolean).join(' · ');
  return { ...rest, brand: w.brand ?? c.brand, category: w.category || c.category, notes, v: SCHEMA };
}

export function migrateAll(data) {
  const ops = [];
  for (const g of data.groceries || []) {
    const m = migrateGrocery(g);
    if (m) ops.push({ store: 'groceries', put: m });
  }
  for (const w of data.wants || []) {
    const m = migrateWant(w);
    if (m) ops.push({ store: 'wants', put: m });
  }
  return ops;
}
