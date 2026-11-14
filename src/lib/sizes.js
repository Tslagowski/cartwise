// "My sizes" per brand. Stored as { [brandKey]: { brand, sizes: [string] } } where brandKey is lowercase.

export const brandKey = (b) => String(b || '').trim().toLowerCase();

export function addSize(map, brand, size) {
  const key = brandKey(brand), s = String(size || '').trim();
  if (!key || !s) return map;
  const cur = map[key] || { brand: String(brand).trim(), sizes: [] };
  if (cur.sizes.some((x) => x.toLowerCase() === s.toLowerCase())) return map;
  return { ...map, [key]: { ...cur, sizes: [...cur.sizes, s] } };
}

export function removeSize(map, brand, size) {
  const key = brandKey(brand);
  const cur = map[key];
  if (!cur) return map;
  const sizes = cur.sizes.filter((x) => x !== size);
  const next = { ...map };
  if (sizes.length) next[key] = { ...cur, sizes };
  else delete next[key];
  return next;
}

/**
 * Size suggestions for a brand: your saved sizes first, then sizes you've used on other wishes
 * from that brand. Returns [{ size, saved }].
 */
export function sizeSuggestions(map, wants, brand, excludeId) {
  const key = brandKey(brand);
  if (!key) return [];
  const saved = map[key]?.sizes || [];
  const seen = new Set(saved.map((s) => s.toLowerCase()));
  const used = [];
  for (const w of wants) {
    if (w.id === excludeId || brandKey(w.brand) !== key) continue;
    const d = String(w.details || '').trim();
    if (d && !seen.has(d.toLowerCase())) { seen.add(d.toLowerCase()); used.push(d); }
  }
  return [...saved.map((size) => ({ size, saved: true })), ...used.slice(0, 6).map((size) => ({ size, saved: false }))];
}
