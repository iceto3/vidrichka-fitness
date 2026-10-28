/**
 * Open Food Facts client (online, optional). Product lookups by barcode use the v2 API
 * (CORS-enabled). Text search goes through the voice Worker (1.4.0), so callers must still
 * handle `null` (offline, Worker or OFF down) gracefully.
 * @module features/food/off
 */
import { fromOff, implausible } from './logic.js';

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
 * A product the app can use: it has nutrition data and passes {@link implausible} (1.4.0:
 * impossible values such as "Nutella 5 kcal / 100 g" are never shown or used).
 * @param {ReturnType<typeof toFood>} f
 */
export const reliable = (f) => !!f && !implausible(f);

/**
 * Look up a product by barcode.
 * @param {string} code
 * @param {string} lang
 * @returns {Promise<NonNullable<ReturnType<typeof toFood>>|{unreliable: true, name: string}|'notfound'|null>}
 *   null = network error; `{unreliable}` (1.4.0) = found, but its values are impossible
 *   (treated as not found; the name prefills the form).
 */
export async function product(code, lang) {
  const j = await getJson(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`,
  );
  if (!j) return null;
  const f = j.status === 1 ? toFood(j.product, lang) : null;
  if (!f) return 'notfound';
  return reliable(f) ? f : { unreliable: true, name: f.name };
}

/** Session memo of finished searches (lang + normalised text → foods). */
const found = new Map();
/** @param {string} q */
export const normQuery = (q) => q.normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

/**
 * Text search: one request per search (1.4.0). Through the voice Worker's `/off-search`
 * when there is one (OFF's own search endpoints are not usable from a browser: no CORS for
 * search.openfoodfacts.org, and rate-limit/error pages without CORS from cgi/search.pl, which
 * filled the console with errors); straight to the legacy endpoint only when no Worker is
 * configured or it predates /off-search (404).
 * @param {string} q
 * @param {string} lang
 * @param {{proxy?: string, fetchJson?: (url: string, ms: number) => Promise<any>}} [o] For tests.
 * @returns {Promise<NonNullable<ReturnType<typeof toFood>>[]|null>} null = unavailable.
 */
export async function search(q, lang, o = {}) {
  const norm = normQuery(q),
    key = `${lang}|${norm}`;
  if (found.has(key)) return found.get(key);
  const get = o.fetchJson ?? getJsonStatus;
  const proxy = o.proxy ?? (await proxyUrl());
  let j = null;
  if (proxy) j = await get(`${proxy}/off-search?q=${encodeURIComponent(norm)}&lang=${lang}`, SEARCH_TIMEOUT);
  if (!proxy || j === 404)
    j = await get(
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(norm)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`,
      SEARCH_TIMEOUT,
    );
  const list = j && typeof j === 'object' && Array.isArray(j.products) ? j.products : null;
  if (!list) return null;
  // 1.4.0: products with impossible values are dropped (never shown with a warning)
  const foods = /** @type {NonNullable<ReturnType<typeof toFood>>[]} */ (
    list.map((/** @type {any} */ p) => toFood(p, lang)).filter(reliable)
  );
  found.set(key, foods);
  if (found.size > 100) found.delete(found.keys().next().value);
  return foods;
}

/** The voice Worker URL ('' when none). Lazy so this module stays light. */
async function proxyUrl() {
  try {
    return (await import('../voice/config.js')).voiceUrl();
  } catch {
    return '';
  }
}

/** Like getJson, but a 404 is reported as the number 404 (an older Worker without /off-search). @param {string} url @param {number} ms */
async function getJsonStatus(url, ms) {
  const ctl = new AbortController(),
    timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (r.status === 404) return 404;
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * What the "online results" block shows for the typed text (1.4.0: it can never stay on
 * "Searching…" — every search ends as a list, "nothing found" or "not available"). 'none'
 * also covers "every result had impossible values": the user is asked to enter the food.
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
