/**
 * Progress photos: downscale to JPEG (max 1280 px), store as IndexedDB blobs, and cache
 * object URLs for display.
 * @module features/body/photos
 */
import { put, uid } from '../../core/store.js';
import { dayKey } from '../../core/dates.js';

const MAX = 1280;
/** @type {Map<string, string>} */
const urls = new Map();

/** Object URL for a photo row. @param {{id: string, blob: Blob}} p */
export function photoUrl(p) {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return /** @type {string} */ (urls.get(p.id));
}

/**
 * Downscale an image file to a JPEG blob.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function shrink(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k), (c.height = Math.round(img.height * k));
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
}

/**
 * Save a photo from a file input.
 * @param {File} file
 * @param {string} [date]
 */
export const addPhoto = async (file, date = dayKey()) => put('photos', { id: uid('ph'), date, ts: Date.now(), blob: await shrink(file) });
