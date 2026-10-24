/**
 * Open Food Facts client (online, optional). Product lookups by barcode use the v2 API
 * (CORS-enabled). Text search tries the search service, then the legacy endpoint; both
 * may be unavailable from a browser, so callers must handle `null` gracefully.
 * @module features/food/off
 */
import { fromOff } from './logic.js';

const FIELDS = 'code,product_name,product_name_bg,product_name_en,brands,nutriments,serving_quantity';
const TIMEOUT = 8000;

/** @param {string} url */
async function getJson(url) {
  const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), TIMEOUT);
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
  return { id: `off_${p.code}`, barcode: p.code, name: p.brands ? `${name} · ${String(p.brands).split(',')[0]}` : name, emoji: '🛒', cat: 'other', source: 'off', portion: Number(p.serving_quantity) || 100, ...per };
}

/**
 * Look up a product by barcode.
 * @param {string} code
 * @param {string} lang
 * @returns {Promise<ReturnType<typeof toFood>|'notfound'|null>} null = network error.
 */
export async function product(code, lang) {
  const j = await getJson(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
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
  const a = await getJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=20&langs=${lang},en&fields=${FIELDS}`);
  const list = a?.hits ?? (await getJson(`https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`))?.products;
  return list ? list.map((/** @type {any} */ p) => toFood(p, lang)).filter(Boolean) : null;
}
