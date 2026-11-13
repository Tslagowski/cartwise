// Upgrades of stored records. Returns write ops for changed records.
//   v2: groceries get status (need|cart|stocked) + aisle; wants get brand + category.
//   v3: grocery names like "Potatoes (gold/russet/sweet)" split into name + details.
import { aisleFor, classifyWant, splitHeading } from './categorize.js';

export const SCHEMA = 3;

/** "Potatoes (gold/russet/sweet)" -> { name: "Potatoes", details: "gold/russet/sweet" } */
export function splitItemName(raw) {
  const { name, note } = splitHeading(raw);
  return { name, details: note };
}

export function migrateGrocery(g) {
  if (g.v >= SCHEMA) return null;
  let out = { ...g };
  if (!(out.v >= 2)) {
    const status = out.status || (!out.checked ? 'need' : out.logged ? 'stocked' : 'cart');
    const { checked, logged, category, checkedAt, ...rest } = out;
    out = { ...rest, status, aisle: aisleFor(out.name), store: out.store || '' };
  }
  if (!out.details) {
    const s = splitItemName(out.name);
    if (s.details) out = { ...out, name: s.name, details: s.details };
  }
  out.details = out.details || '';
  out.qty = out.qty || '';
  out.v = SCHEMA;
  return out;
}

export function migrateWant(w) {
  if (w.v >= 2) return null;
  const c = classifyWant(w.group || '', w.name);
  const { group, ...rest } = w;
  const notes = [w.notes, c.note].filter(Boolean).join(' · ');
  return { ...rest, brand: w.brand ?? c.brand, category: w.category || c.category, notes, v: 2 };
}

export function migrateAll(data) {
  const ops = [];
  const renames = new Map(); // old lowercase name -> new name
  for (const g of data.groceries || []) {
    const m = migrateGrocery(g);
    if (!m) continue;
    if (m.name !== g.name) renames.set(g.name.trim().toLowerCase(), m.name);
    ops.push({ store: 'groceries', put: m });
  }
  // Keep price history attached: rename products that used the old grocery name.
  for (const p of data.products || []) {
    const n = renames.get(String(p.name || '').trim().toLowerCase());
    if (n) ops.push({ store: 'products', put: { ...p, name: n } });
  }
  for (const w of data.wants || []) {
    const m = migrateWant(w);
    if (m) ops.push({ store: 'wants', put: m });
  }
  return ops;
}
