import { unitPrice } from './units.js';

export function median(values) {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

/**
 * Price history entries for one product.
 * lines: [{ price, qty, size, unit, onSale, tripId }]
 * tripsById: { [id]: { date, storeId } }, storesById: { [id]: { name } }
 * Returns entries newest first: { date, store, price, unit: {value,family,label}, onSale }
 */
export function priceHistory(lines, tripsById, storesById) {
  return lines
    .map((l) => {
      const trip = tripsById[l.tripId] || {};
      return {
        date: trip.date || '',
        order: trip.createdAt || 0,
        store: storesById[trip.storeId]?.name || '',
        price: Number(l.price),
        size: l.size,
        sizeUnit: l.unit,
        unit: unitPrice(l),
        onSale: !!l.onSale,
      };
    })
    .filter((e) => e.unit)
    .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.order - a.order));
}

/**
 * Stats over a product's history. Only entries in the same unit family as the
 * most recent purchase are compared, so $/oz is never mixed with $/ea.
 */
export function productStats(history) {
  if (!history.length) return null;
  const last = history[0];
  const same = history.filter((e) => e.unit.family === last.unit.family);
  const values = same.map((e) => e.unit.value);
  const lowest = same.reduce((a, b) => (b.unit.value < a.unit.value ? b : a));
  return {
    count: history.length,
    last,
    lowest,
    median: { value: median(values), family: last.unit.family, label: last.unit.label },
    lastStore: last.store,
  };
}

/** Rate a unit price against the stats: 'good' (≤ lowest+2%), 'high' (> median+10%), else 'ok'. */
export function rate(value, stats) {
  if (!stats || value == null) return null;
  if (value <= stats.lowest.unit.value * 1.02) return 'good';
  if (value > stats.median.value * 1.1) return 'high';
  return 'ok';
}

/** Rating of the most recent purchase against the ones before it (same unit family). */
export function lastRating(history) {
  if (history.length < 2) return null;
  const [last, ...rest] = history;
  const prev = rest.filter((e) => e.unit.family === last.unit.family);
  if (!prev.length) return null;
  return rate(last.unit.value, productStats(prev));
}

/** Unit-price values oldest → newest for a sparkline (same family as the latest, at most `max`). */
export function trendValues(history, max = 12) {
  if (!history.length) return [];
  const fam = history[0].unit.family;
  return history
    .filter((e) => e.unit.family === fam)
    .slice(0, max)
    .map((e) => e.unit.value)
    .reverse();
}
