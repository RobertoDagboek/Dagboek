import { readExif } from './exif.js';

const MAX_EDGE = 1600;   // plenty for a diary, keeps Supabase's free 1GB happy
const QUALITY = 0.82;

/**
 * Read a picked file: grab EXIF (GPS + capture time) from the original,
 * then downscale and re-encode as JPEG for upload.
 * @returns {Promise<{blob: Blob, width: number, height: number, takenAt: string|null, lat: number|null, lng: number|null}>}
 */
export async function preparePhoto(file) {
  const exif = await readExif(file);

  let bitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    bitmap = await createImageBitmap(file); // older browsers: no orientation flag
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', QUALITY));

  return {
    blob,
    width,
    height,
    takenAt: exif.takenAt ?? null,
    lat: exif.lat ?? null,
    lng: exif.lng ?? null,
  };
}

/** Instant preview while the upload runs. Caller must revoke the URL. */
export function localPreview(file) {
  return URL.createObjectURL(file);
}
