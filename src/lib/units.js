// Unit families and conversion to a base unit per family.
// Price per item is divided by (size in base units) to get a comparable unit price.

export const UNITS = {
  ea: { family: 'each', factor: 1, label: 'ea' },
  ct: { family: 'count', factor: 1, label: 'ct' },
  oz: { family: 'weight', factor: 1, label: 'oz' },
  lb: { family: 'weight', factor: 16, label: 'lb' },
  g: { family: 'weight', factor: 0.0352739619, label: 'g' },
  kg: { family: 'weight', factor: 35.2739619, label: 'kg' },
  floz: { family: 'volume', factor: 1, label: 'fl oz' },
  ml: { family: 'volume', factor: 0.0338140227, label: 'ml' },
  l: { family: 'volume', factor: 33.8140227, label: 'l' },
  gal: { family: 'volume', factor: 128, label: 'gal' },
};

export const BASE_LABEL = { each: 'ea', count: 'ct', weight: 'oz', volume: 'fl oz' };

/**
 * Unit price for one line.
 * price = price paid for ONE item; size/unit = size of one item.
 * Lines without a size (or unit "ea") give price per item.
 * Returns { value, family, label } or null when price is missing.
 */
export function unitPrice({ price, size, unit }) {
  const p = Number(price);
  if (!Number.isFinite(p) || p < 0) return null;
  const u = UNITS[unit] || UNITS.ea;
  const s = Number(size);
  if (u.family === 'each' || !Number.isFinite(s) || s <= 0) {
    return { value: p, family: 'each', label: 'ea' };
  }
  return { value: p / (s * u.factor), family: u.family, label: BASE_LABEL[u.family] };
}

/** Line total = price per item × quantity (qty defaults to 1). */
export function lineTotal({ price, qty }) {
  const p = Number(price) || 0;
  const q = Number(qty);
  return p * (Number.isFinite(q) && q > 0 ? q : 1);
}

export function formatMoney(n) {
  if (n == null || !Number.isFinite(n)) return '—';
  return '$' + n.toFixed(2);
}

/** Unit prices are often fractions of a cent; show 3 decimals below $1. */
export function formatUnitPrice(up) {
  if (!up) return '—';
  const digits = up.value < 1 ? 3 : 2;
  return `$${up.value.toFixed(digits)}/${up.label}`;
}
