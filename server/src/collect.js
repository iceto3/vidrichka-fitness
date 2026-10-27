/**
 * 1.3.4 anonymous collection: validation for POST /foods (a manually entered food: name +
 * per-100 g values + app language) and POST /feedback (text, version, language, ≤3
 * screenshots), and a per-isolate in-memory rate limit that stores nothing about the sender.
 * @module collect
 */
import { Invalid } from './validate.js';

/** Body caps (bytes): a food is tiny; feedback carries up to 3 × 300 KB images as base64. */
export const MAX_FOOD_BODY = 1024;
export const MAX_FEEDBACK_BODY = 1_400_000;
export const MAX_NAME = 80;
export const MAX_TEXT = 2000;
export const MAX_IMAGES = 3;
export const MAX_IMAGE = 300 * 1024;
const MIMES = /** @type {const} */ (['image/jpeg', 'image/png', 'image/webp']);
const VERSION = /^[0-9A-Za-z.+_-]{1,40}$/;

/** @param {boolean} ok @param {string} what */
const need = (ok, what) => {
  if (!ok) throw new Invalid(what);
};
/** @param {unknown} v @param {number} max @param {number} [d] @returns {number|null} */
const num = (v, max, d = 1) => {
  if (v == null) return null;
  need(typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max, 'value');
  const k = 10 ** d;
  return Math.round(/** @type {number} */ (v) * k) / k;
};
/** @param {unknown} l */
const lang = (l) => (l === 'en' ? 'en' : 'bg');

/**
 * Read a body with its own cap (the device endpoints keep the 8 kB one).
 * @param {Request} req @param {number} max
 */
export async function body(req, max) {
  need(Number(req.headers.get('content-length') || 0) <= max, 'too large');
  const buf = await req.arrayBuffer();
  need(buf.byteLength <= max, 'too large');
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new Invalid('json');
  }
}

/**
 * @typedef {{name: string, lang: string, kcal: number, protein: number|null, carbs: number|null,
 *   fat: number|null, fiber: number|null, salt: number|null}} SharedFood
 */

/** @param {any} b @returns {SharedFood} */
export function food(b) {
  need(!!b && typeof b === 'object', 'body');
  const name =
    typeof b.name === 'string'
      ? b.name
          // eslint-disable-next-line no-control-regex -- strip control characters
          .replace(/[\u0000-\u001f\u007f]/g, '')
          .replace(/\s+/g, ' ')
          .trim()
      : '';
  need(name.length >= 1 && name.length <= MAX_NAME, 'name');
  const kcal = num(b.kcal, 900, 0);
  need(kcal != null, 'kcal');
  return {
    name,
    lang: lang(b.lang),
    kcal: /** @type {number} */ (kcal),
    protein: num(b.protein, 100),
    carbs: num(b.carbs, 100),
    fat: num(b.fat, 100),
    fiber: num(b.fiber, 100),
    salt: num(b.salt, 100, 2),
  };
}

/** Magic bytes check so only real images are kept. @param {Uint8Array} u @param {string} mime */
const looksLike = (u, mime) =>
  mime === 'image/jpeg'
    ? u[0] === 0xff && u[1] === 0xd8 && u[2] === 0xff
    : mime === 'image/png'
      ? u[0] === 0x89 && u[1] === 0x50 && u[2] === 0x4e && u[3] === 0x47
      : u[0] === 0x52 && u[1] === 0x49 && u[2] === 0x46 && u[3] === 0x46 && u[8] === 0x57 && u[9] === 0x45;

/** @param {string} b64 */
function decode(b64) {
  need(
    typeof b64 === 'string' && /^[A-Za-z0-9+/]+={0,2}$/.test(b64) && b64.length <= Math.ceil(MAX_IMAGE / 3) * 4,
    'image',
  );
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return u;
}

/**
 * @typedef {{text: string, version: string, lang: string, images: {mime: string, data: Uint8Array}[]}} Feedback
 * @param {any} b @returns {Feedback}
 */
export function feedback(b) {
  need(!!b && typeof b === 'object', 'body');
  // eslint-disable-next-line no-control-regex -- strip control characters
  const text = typeof b.text === 'string' ? b.text.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, '').trim() : '';
  need(text.length >= 1 && text.length <= MAX_TEXT, 'text');
  need(typeof b.version === 'string' && VERSION.test(b.version), 'version');
  const imgs = b.images ?? [];
  need(Array.isArray(imgs) && imgs.length <= MAX_IMAGES, 'images');
  const images = imgs.map((/** @type {any} */ i) => {
    need(!!i && MIMES.includes(i.mime), 'image');
    const data = decode(i.data);
    need(data.length > 12 && data.length <= MAX_IMAGE && looksLike(data, i.mime), 'image');
    return { mime: /** @type {string} */ (i.mime), data };
  });
  return { text, version: b.version, lang: lang(b.lang), images };
}

/**
 * Fixed-window limit for the whole isolate (no per-sender key, so nothing about who sent it
 * is kept even in memory). Returns false when the window is full.
 * @param {Map<string, {start: number, n: number}>} state @param {string} key
 * @param {number} max @param {number} windowMs @param {number} now
 */
export function allow(state, key, max, windowMs, now) {
  const w = state.get(key);
  if (!w || now - w.start >= windowMs) return (state.set(key, { start: now, n: 1 }), true);
  if (w.n >= max) return false;
  w.n++;
  return true;
}
