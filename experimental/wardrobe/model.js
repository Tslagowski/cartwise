export const CATEGORIES = ['Tops', 'Bottoms', 'Dresses / one-pieces', 'Layers', 'Shoes', 'Accessories'];
export const FIT_STATES = ['Fits now', 'Too large', 'Too small', 'Needs tailoring'];
export const OWNERSHIP = ['Owned', 'Prospective'];
export const MAX_SIDE = 1200;
export const MAX_BYTES = 500_000;

export function photoDimensions(width, height, limit = MAX_SIDE) {
  if (!(width > 0 && height > 0)) throw new Error('This photo has no usable dimensions.');
  const scale = Math.min(1, limit / Math.max(width, height));
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))];
}

export function pieceErrors(piece) {
  const errors = {};
  if (!piece.name.trim()) errors.name = 'Enter a piece name.';
  if (!CATEGORIES.includes(piece.category)) errors.category = 'Choose a category.';
  if (!FIT_STATES.includes(piece.fitState)) errors.fitState = 'Choose a fit state.';
  if (!OWNERSHIP.includes(piece.ownership)) errors.ownership = 'Choose Owned or Prospective.';
  if (!piece.photo?.size || piece.photo.type !== 'image/jpeg' || piece.photo.size > MAX_BYTES) {
    errors.photo = 'Add a photo that can be saved locally.';
  }
  return errors;
}

export function outfitErrors(name, pieceIds) {
  const errors = {};
  if (!name.trim()) errors.name = 'Enter an outfit name.';
  if (!pieceIds.length) errors.board = 'Choose at least one piece.';
  return errors;
}
