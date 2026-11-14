// Wishlist sorting and custom order.

export const SORTS = [
  { id: 'custom', label: 'My order' },
  { id: 'priority', label: 'Priority' },
  { id: 'priceAsc', label: 'Price: low to high' },
  { id: 'priceDesc', label: 'Price: high to low' },
  { id: 'newest', label: 'Newest first' },
  { id: 'oldest', label: 'Oldest first' },
  { id: 'brand', label: 'Brand A–Z' },
  { id: 'name', label: 'Name A–Z' },
];
export const GROUPS = [
  { id: 'category', label: 'Category' },
  { id: 'brand', label: 'Brand' },
  { id: 'none', label: 'None' },
];

const PRIORITY = { High: 0, Medium: 1, Low: 2 };
const byName = (a, b) => String(a.name || '').localeCompare(String(b.name || ''), undefined, { sensitivity: 'base' });

/** The price we sort by: your target, else the store's price, else what you paid (paidFn). */
export function wantPrice(w, paidFn = () => null) {
  if (w.targetPrice != null && Number.isFinite(Number(w.targetPrice))) return Number(w.targetPrice);
  if (w.sitePrice != null && Number.isFinite(Number(w.sitePrice))) return Number(w.sitePrice);
  const p = paidFn(w);
  return p != null && Number.isFinite(p) ? p : null;
}

/** Fallback rank for items that have never been arranged: oldest first. */
const rankOf = (w) => (Number.isFinite(w.rank) ? w.rank : Date.parse(w.createdAt || 0) || 0);

export function sortWants(list, sort, paidFn) {
  const xs = [...list];
  const price = (w) => wantPrice(w, paidFn);
  // Items without a price always go last, whichever way you sort by price.
  const byPrice = (dir) => (a, b) => {
    const pa = price(a), pb = price(b);
    if (pa == null && pb == null) return byName(a, b);
    if (pa == null) return 1;
    if (pb == null) return -1;
    return (pa - pb) * dir || byName(a, b);
  };
  const created = (w) => Date.parse(w.createdAt || 0) || 0;
  const cmp = {
    custom: (a, b) => rankOf(a) - rankOf(b) || byName(a, b),
    priority: (a, b) => (PRIORITY[a.priority] ?? 1) - (PRIORITY[b.priority] ?? 1) || rankOf(a) - rankOf(b) || byName(a, b),
    priceAsc: byPrice(1),
    priceDesc: byPrice(-1),
    newest: (a, b) => created(b) - created(a) || byName(a, b),
    oldest: (a, b) => created(a) - created(b) || byName(a, b),
    brand: (a, b) => (!a.brand - !b.brand) || String(a.brand || '').localeCompare(String(b.brand || ''), undefined, { sensitivity: 'base' }) || byName(a, b),
    name: byName,
  }[sort] || byName;
  return xs.sort(cmp);
}

/** A rank between two neighbours (either may be missing) for a dragged item. */
export function rankBetween(before, after) {
  const a = before == null ? null : rankOf(before);
  const b = after == null ? null : rankOf(after);
  if (a == null && b == null) return 0;
  if (a == null) return b - 1024;
  if (b == null) return a + 1024;
  return (a + b) / 2;
}

/**
 * Give every item an explicit rank matching their current custom order, spaced out so later
 * moves have room. Returns only the items whose rank changed.
 */
export function normalizeRanks(list) {
  return sortWants(list, 'custom')
    .map((w, i) => ({ w, rank: (i + 1) * 1024 }))
    .filter(({ w, rank }) => w.rank !== rank)
    .map(({ w, rank }) => ({ ...w, rank }));
}
