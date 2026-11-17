import { outfitErrors, pieceErrors } from './model.js';

export const DATABASE = 'cartwise-wardrobe-experimental';

function openDatabase(factory) {
  return new Promise((resolve, reject) => {
    const request = factory.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore('pieces', { keyPath: 'id' });
      request.result.createObjectStore('outfits', { keyPath: 'id' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
}

export function wardrobeStorage(factory = globalThis.indexedDB) {
  // Open only the preview database, and retry on the next operation if opening fails.
  async function transaction(stores, mode, run) {
    const db = await openDatabase(factory);
    try {
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(stores, mode);
        tx.onabort = () => reject(tx.error || new Error('Wardrobe storage was interrupted.'));
        try {
          const result = run(tx, (error) => {
            tx.abort();
            reject(error);
          });
          tx.oncomplete = () => resolve(result());
        } catch (error) {
          tx.abort();
          reject(error);
        }
      });
    } finally {
      db.close();
    }
  }

  return {
    load() {
      return transaction(['pieces', 'outfits'], 'readonly', (tx) => {
        const pieces = tx.objectStore('pieces').getAll();
        const outfits = tx.objectStore('outfits').getAll();
        return () => ({
          pieces: pieces.result.map(({ photoBytes, ...piece }) => ({
            ...piece,
            photo: new Blob([photoBytes], { type: 'image/jpeg' }),
          })),
          outfits: outfits.result,
        });
      });
    },
    async addPiece(piece) {
      if (Object.keys(pieceErrors(piece)).length) throw new Error('Check the piece fields.');
      const { photo, ...fields } = piece;
      const record = { ...fields, id: crypto.randomUUID(), name: piece.name.trim(), createdAt: Date.now() };
      // Keep the JPEG bytes in the record so storage does not depend on IndexedDB's Blob handling.
      const photoBytes = await photo.arrayBuffer();
      return transaction('pieces', 'readwrite', (tx) => {
        tx.objectStore('pieces').add({ ...record, photoBytes });
        return () => ({ ...record, photo });
      });
    },
    async saveOutfit({ id, name, pieceIds }) {
      const ids = [...new Set(pieceIds)];
      if (Object.keys(outfitErrors(name, ids)).length) throw new Error('Check the outfit fields.');
      const record = { id: id || crypto.randomUUID(), name: name.trim(), pieceIds: ids, updatedAt: Date.now() };
      return transaction(['pieces', 'outfits'], 'readwrite', (tx, fail) => {
        const pieces = tx.objectStore('pieces');
        const outfits = tx.objectStore('outfits');
        ids.forEach((pieceId, index) => {
          const request = pieces.getKey(pieceId);
          request.onsuccess = () => {
            if (request.result === undefined) {
              fail(new Error('A selected piece is unavailable. Reopen the outfit and try again.'));
            } else if (index === ids.length - 1) {
              outfits.put(record);
            }
          };
        });
        return () => record;
      });
    },
  };
}
