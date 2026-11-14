// Tiny IndexedDB wrapper. Every object store uses `id` (string) as its key.
import { STORES } from './lib/backup.js';

const DB_NAME = 'cartwise';
const DB_VERSION = 2; // v2 adds the 'settings' store (my sizes)
let dbPromise;

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const s of STORES) {
          if (!db.objectStoreNames.contains(s)) db.createObjectStore(s, { keyPath: 'id' });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

function done(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function getAll(store) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const req = db.transaction(store).objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadAll() {
  const out = {};
  for (const s of STORES) out[s] = await getAll(s);
  return out;
}

/** Apply many writes atomically: ops = [{ store, put: obj } | { store, del: id }] */
export async function write(ops) {
  const db = await open();
  const names = [...new Set(ops.map((o) => o.store))];
  if (!names.length) return;
  const tx = db.transaction(names, 'readwrite');
  for (const o of ops) {
    const os = tx.objectStore(o.store);
    if (o.put) os.put(o.put);
    else if (o.del) os.delete(o.del);
  }
  return done(tx);
}

export async function replaceAll(data) {
  const db = await open();
  const tx = db.transaction(STORES, 'readwrite');
  for (const s of STORES) {
    const os = tx.objectStore(s);
    os.clear();
    for (const row of data[s] || []) os.put(row);
  }
  return done(tx);
}

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
