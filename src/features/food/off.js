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
    name: p.brands ? `${name} · ${String(p.brands).split(',')[0]}` : name,
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
  // Both at once (1.4.0): the search service is preferred, the legacy endpoint is the fallback.
  const a = getJson(
    `https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&langs=${lang},en&fields=${FIELDS}`,
    SEARCH_TIMEOUT,
  );
  const b = getJson(
    `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
    SEARCH_TIMEOUT,
  );
  const list = (await a)?.hits ?? (await b)?.products;
  return list ? list.map((/** @type {any} */ p) => toFood(p, lang)).filter(Boolean) : null;
}
