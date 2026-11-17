import { MAX_BYTES, MAX_SIDE, photoDimensions } from './model.js';

export async function compressPhoto(file) {
  const sourceUrl = URL.createObjectURL(file);
  const image = new Image();
  const canvas = document.createElement('canvas');
  try {
    try {
      image.src = sourceUrl;
      await image.decode();
    } catch {
      throw new Error('This photo could not be opened. Try another photo or a screenshot.');
    }

    const context = canvas.getContext('2d');
    if (!context) throw new Error('Photo processing is unavailable. Try reloading the preview.');
    for (const limit of [MAX_SIDE, 960, 720, 540]) {
      if (limit < MAX_SIDE && Math.max(canvas.width, canvas.height) <= limit) continue;
      [canvas.width, canvas.height] = photoDimensions(image.naturalWidth, image.naturalHeight, limit);
      context.fillStyle = '#fff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0, canvas.width, canvas.height);
      for (const quality of [0.86, 0.72, 0.56, 0.4]) {
        const photo = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
        if (photo?.size && photo.size <= MAX_BYTES && photo.type === 'image/jpeg') return photo;
      }
    }
    throw new Error('This photo could not be compressed to 500 KB. Try a smaller photo.');
  } finally {
    URL.revokeObjectURL(sourceUrl);
    canvas.width = canvas.height = 1;
  }
}
