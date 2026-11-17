import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_BYTES, outfitErrors, photoDimensions, pieceErrors } from '../experimental/wardrobe/model.js';
import { wardrobeStorage } from '../experimental/wardrobe/storage.js';

test('Wardrobe photo dimensions preserve aspect ratio, without scaling up', () => {
  assert.deepEqual(photoDimensions(4032, 3024), [1200, 900]);
  assert.deepEqual(photoDimensions(3024, 4032), [900, 1200]);
  assert.deepEqual(photoDimensions(600, 300), [600, 300]);
  assert.deepEqual(photoDimensions(1, 12000), [1, 1200]);
  assert.throws(() => photoDimensions(0, 0));
});

test('Wardrobe requires piece details and a compressed JPEG within the byte limit', () => {
  const photo = { type: 'image/jpeg', size: MAX_BYTES };
  const piece = { name: ' Linen shirt ', category: 'Tops', fitState: 'Fits now', ownership: 'Prospective', photo };
  assert.deepEqual(pieceErrors(piece), {});
  assert.deepEqual(Object.keys(pieceErrors({
    name: ' ', category: '', fitState: '', ownership: '', photo: { ...photo, size: MAX_BYTES + 1 },
  })), ['name', 'category', 'fitState', 'ownership', 'photo']);
  assert.ok(pieceErrors({ ...piece, photo: { type: 'image/png', size: 1000 } }).photo);
});

test('Wardrobe accepts partial outfits and rejects blank names and empty boards', () => {
  assert.deepEqual(outfitErrors(' Day trip ', ['piece-id']), {});
  assert.deepEqual(Object.keys(outfitErrors('   ', [])), ['name', 'board']);
});

test('Wardrobe opens only the experimental database, including on retry after an open error', async () => {
  const calls = [];
  const failure = new DOMException('Storage unavailable', 'UnknownError');
  const storage = wardrobeStorage({
    open(...args) {
      calls.push(args);
      const request = { error: failure };
      queueMicrotask(() => request.onerror());
      return request;
    },
  });
  await assert.rejects(storage.load(), failure);
  await assert.rejects(storage.load(), failure);
  assert.deepEqual(calls, Array(2).fill(['cartwise-wardrobe-experimental', 1]));
});
