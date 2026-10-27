/**
 * 1.3.4 "Help improve the app" (pure, unit tested): what an anonymous food share contains,
 * feedback limits and the screenshot resize maths.
 * @module features/improve/logic
 */

/** Feedback text limit (chars), screenshots per message and bytes per (JPEG) screenshot. */
export const MAX_FB_TEXT = 2000;
export const MAX_IMAGES = 3;
export const MAX_IMG_BYTES = 300_000;
/** Longest side of a resized screenshot (px). */
export const IMG_SIDE = 1080;
/** Longest food name that is shared. */
export const MAX_NAME = 80;

/** Finite number ≥ 0 rounded to 0.1 g (or 1 kcal), else null. @param {any} v @param {number} [d] */
const num = (v, d = 1) => {
  const n = typeof v === 'number' ? v : Number.NaN;
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  const k = 10 ** d;
  return Math.round(n * k) / k;
};

/**
 * The only thing a food share sends: the name and the per-100 g values, plus the app
 * language. No grams, dates, ids or photos.
 * @param {{name: string, kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} food
 * @param {string} lang
 * @returns {{name: string, kcal: number|null, protein: number|null, carbs: number|null, fat: number|null, fiber: number|null, salt: number|null, lang: string}|null}
 *   null when there is nothing worth sending (no name or no kcal).
 */
export function foodPayload(food, lang) {
  const name = String(food?.name ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_NAME);
  const kcal = num(food?.kcal, 0);
  if (!name || kcal == null) return null;
  return {
    name,
    kcal,
    protein: num(food.p),
    carbs: num(food.c),
    fat: num(food.f),
    fiber: num(food.fib),
    salt: num(food.salt, 2),
    lang: lang === 'en' ? 'en' : 'bg',
  };
}

/**
 * Size that fits `side` on the longest edge (never upscales).
 * @param {number} w @param {number} h @param {number} [side]
 */
export function fitSize(w, h, side = IMG_SIDE) {
  const k = Math.min(1, side / Math.max(w, h, 1));
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) };
}

/**
 * Feedback request body.
 * @param {string} text @param {{mime: string, b64: string}[]} images @param {string} version @param {string} lang
 */
export const feedbackBody = (text, images, version, lang) => ({
  text: text.trim().slice(0, MAX_FB_TEXT),
  version: String(version).slice(0, 40),
  lang: lang === 'en' ? 'en' : 'bg',
  images: images.slice(0, MAX_IMAGES).map((i) => ({ mime: i.mime, data: i.b64 })),
});
