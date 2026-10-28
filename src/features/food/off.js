/**
 * Open Food Facts client (online, optional). Product lookups by barcode use the v2 API
 * (CORS-enabled). Text search tries the search service, then the legacy endpoint; both
 * may be unavailable from a browser, so callers must handle `null` gracefully.
 * @module features/food/off
 */
import { fromOff } from './logic.js';

const FIELDS = 'code,product_name,product_name_bg,product_name_en,brands,nutriments,serving_quantity';
const TIMEOUT = 8000;
/** 1.4.0: text search asks both endpoints at once and gives up after this (was 2 × 8 s in a row). */
export const SEARCH_TIMEOUT = 6000;

/** @param {string} url @param {number} [ms] */
async function getJson(url, ms = TIMEOUT) {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * "Name · Brand" without repeating the brand: "Nutella" + "Nutella, Ferrero" → "Nutella",
 * "Lidl Joghurt" + "Lidl" → "Lidl Joghurt", "Шоколад" + "Milka" → "Шоколад · Milka".
 * @param {string} name @param {unknown} brands
 */
export function withBrand(name, brands) {
  const n = String(name).trim(),
    b = String(brands ?? '')
      .split(',')[0]
      .trim();
  if (!b) return n;
  const low = (/** @type {string} */ x) => x.toLocaleLowerCase().replace(/\s+/g, ' ');
  return low(n).includes(low(b)) || low(b).includes(low(n)) ? n : `${n} · ${b}`;
}

/**
 * Normalise an OFF product to a food (per 100 g), or null if it lacks nutrition data.
 * @param {any} p
 * @param {string} lang
 */
export function toFood(p, lang) {
  const per = fromOff(p);
  const name = p?.[`product_name_${lang}`] || p?.product_name || p?.product_name_en;
  if (!per || !name) return null;
  return {
    id: `off_${p.code}`,
    barcode: p.code,
    name: withBrand(name, p.brands),
    emoji: '🛒',
    cat: 'other',
    source: 'off',
    portion: Number(p.serving_quantity) || 100,
    ...per,
  };
}

/**
 * Look up a product by barcode.
 * @param {string} code
 * @param {string} lang
 * @returns {Promise<ReturnType<typeof toFood>|'notfound'|null>} null = network error.
 */
export async function product(code, lang) {
  const j = await getJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
  );
  if (!j) return null;
  return (j.status === 1 && toFood(j.product, lang)) || 'notfound';
}

/**
 * Text search.
 * @param {string} q
 * @param {string} lang
 * @returns {Promise<NonNullable<ReturnType<typeof toFood>>[]|null>} null = unavailable.
 */
export async function search(q, lang) {
  // Both at once (1.4.0): whichever answers first with a list wins (the search service often
  // answers in < 1 s, the legacy endpoint is slower but more complete); null only when both
  // fail or time out, so the screen can say so instead of waiting.
  const a = getJson(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&langs=${lang},en&fields=${FIELDS}`,
    SEARCH_TIMEOUT,
  ).then((j) => j?.hits ?? null);
  const b = getJson(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
    SEARCH_TIMEOUT,
  ).then((j) => j?.products ?? null);
  const list = await firstList([a, b]);
  return list ? list.map((/** @type {any} */ p) => toFood(p, lang)).filter(Boolean) : null;
}

/**
 * The first promise that resolves to an array (a non-empty one is preferred: an empty answer
 * waits for the other source). Resolves null when none gives an array. Never rejects.
 * @template T @param {Promise<T[]|null>[]} ps @returns {Promise<T[]|null>}
 */
export function firstList(ps) {
  return new Promise((done) => {
    let left = ps.length;
    /** @type {T[]|null} */
    let empty = null;
    if (!left) return done(null);
    for (const p of ps)
      Promise.resolve(p)
        .catch(() => null)
        .then((v) => {
          if (Array.isArray(v) && v.length) return done(v);
          if (Array.isArray(v)) empty = v;
          if (--left === 0) done(empty);
        });
  });
}

/**
 * What the "online results" block shows for the typed text (1.4.0: it can never stay on
 * "Searching…" — every search ends as a list, "nothing found" or "not available").
 * @param {{q: string, state: 'idle'|'busy'|'done'|'fail', list: any[]}} off @param {string} q
 * @returns {''|'busy'|'fail'|'none'|'list'}
 */
export function offView(off, q) {
  const s = q.trim();
  if (s.length < 3) return '';
  if (off.q !== s || off.state === 'busy' || off.state === 'idle') return 'busy';
  if (off.state === 'fail') return 'fail';
  return off.list.length ? 'list' : 'none';
}

/** A promise that settles to `fallback` after `ms` at the latest. @template T @param {Promise<T>} p @param {number} ms @param {T} fallback */
export const within = (p, ms, fallback) =>
  Promise.race([p.catch(() => fallback), new Promise((ok) => setTimeout(() => ok(fallback), ms))]);
