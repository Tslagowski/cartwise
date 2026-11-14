export const STORES = ['stores', 'products', 'trips', 'lines', 'wants', 'groceries', 'settings'];
export const EXPORT_VERSION = 1;

export function makeExport(data, now = new Date()) {
  const out = { app: 'cartwise', version: EXPORT_VERSION, exportedAt: now.toISOString(), data: {} };
  for (const s of STORES) out.data[s] = Array.isArray(data[s]) ? data[s] : [];
  return out;
}

/** Parse and validate an export. Throws Error with a readable message. */
export function parseImport(text) {
  let obj;
  try {
    obj = typeof text === 'string' ? JSON.parse(text) : text;
  } catch {
    throw new Error('That file is not valid JSON.');
  }
  if (!obj || obj.app !== 'cartwise') throw new Error('That file is not a Cartwise backup.');
  if (typeof obj.version !== 'number' || obj.version > EXPORT_VERSION) {
    throw new Error('This backup is from a newer version of Cartwise.');
  }
  const data = {};
  for (const s of STORES) {
    const rows = obj.data?.[s] ?? [];
    if (!Array.isArray(rows)) throw new Error(`Backup section "${s}" is malformed.`);
    for (const r of rows) {
      if (!r || typeof r.id !== 'string') throw new Error(`A record in "${s}" has no id.`);
    }
    data[s] = rows;
  }
  return data;
}
