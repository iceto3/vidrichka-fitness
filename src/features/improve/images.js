/**
 * Screenshot preparation for feedback: decode, scale to ≤1080 px on the longest side and
 * re-encode as JPEG, lowering quality (then size) until it is ≤300 KB.
 * @module features/improve/images
 */
import { IMG_SIDE, MAX_IMG_BYTES, fitSize } from './logic.js';

/** @param {Blob} blob @returns {Promise<string>} base64 without the data: prefix */
const toB64 = (blob) =>
  new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(',')[1] ?? '');
    r.onerror = () => rej(r.error);
    r.readAsDataURL(blob);
  });

/** @param {Blob} file @returns {Promise<CanvasImageSource & {width: number, height: number}>} */
async function decode(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall back to <img> (e.g. older Safari with HEIC → JPEG conversion done by the picker) */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return /** @type {any} */ (Object.assign(img, { width: img.naturalWidth, height: img.naturalHeight }));
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
}

/**
 * @param {Blob} file An image from the gallery.
 * @returns {Promise<{mime: string, b64: string, url: string, bytes: number, blob: Blob}>} `url` = local preview.
 * @throws {Error} 'image' when it can't be read or squeezed under the limit.
 */
export async function prepareImage(file) {
  if (!/^image\//.test(file.type || 'image/')) throw new Error('image');
  const src = await decode(file).catch(() => {
    throw new Error('image');
  });
  let side = IMG_SIDE;
  for (let round = 0; round < 4; round++, side = Math.round(side * 0.8)) {
    const { w, h } = fitSize(src.width, src.height, side);
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const g = c.getContext('2d');
    if (!g) throw new Error('image');
    g.fillStyle = '#fff';
    g.fillRect(0, 0, w, h);
    g.drawImage(src, 0, 0, w, h);
    for (const q of [0.82, 0.7, 0.58, 0.46]) {
      const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', q));
      if (blob && /** @type {Blob} */ (blob).size <= MAX_IMG_BYTES) {
        const b = /** @type {Blob} */ (blob);
        return { mime: 'image/jpeg', b64: await toB64(b), url: URL.createObjectURL(b), bytes: b.size, blob: b };
      }
    }
  }
  throw new Error('image');
}
