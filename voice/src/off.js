/**
 * GET /off-search (1.4.0, additive): Open Food Facts text search through the Worker.
 * The OFF search endpoints are not reliably usable from a browser (search.openfoodfacts.org
 * sends no CORS header for other origins, and the legacy cgi/search.pl answers rate-limit and
 * error pages without one), so the app asks here: one request per search, answers cached at the
 * edge for a day (Cache API, free), rate-limited per IP, only small product fields returned.
 * @module off
 */
import { Invalid } from './parse.js';

export const OFF_FIELDS = 'code,product_name,product_name_bg,product_name_en,brands,nutriments,serving_quantity';
/** Only the nutriments the app reads (keeps answers small). */
const NUTRIENTS = [
  'energy-kcal_100g',
  'energy_100g',
  'energy-kj_100g',
  'proteins_100g',
  'carbohydrates_100g',
  'fat_100g',
  'fiber_100g',
  'salt_100g',
  'sodium_100g',
];
export const PAGE = 20;
export const CACHE_TTL = 86400;
export const UA = 'Vidrichka/1.4 (fitness diary PWA; https://vidrichka-beta.pages.dev)';

/**
 * Validate and normalise the query.
 * @param {URL} url
 * @returns {{q: string, lang: 'bg'|'en'}}
 */
export function readQuery(url) {
  const q = (url.searchParams.get('q') || '').normalize('NFC').replace(/\s+/g, ' ').trim().toLocaleLowerCase();
  if (q.length < 2) throw new Invalid('short');
  if (q.length > 60) throw new Invalid('too-long', 413);
  return { q, lang: url.searchParams.get('lang') === 'en' ? 'en' : 'bg' };
}

/** @param {any} p */
export function slim(p) {
  const n = p?.nutriments ?? {};
  /** @type {Record<string, number>} */
  const nutriments = {};
  for (const k of NUTRIENTS) if (n[k] !== undefined && n[k] !== '' && Number.isFinite(+n[k])) nutriments[k] = +n[k];
  /** @type {Record<string, any>} */
  const out = { code: String(p?.code ?? ''), nutriments };
  for (const k of ['product_name', 'product_name_bg', 'product_name_en', 'brands', 'serving_quantity'])
    if (p?.[k] != null && p[k] !== '') out[k] = typeof p[k] === 'string' ? p[k].slice(0, 120) : p[k];
  return out;
}

/** @param {any[]} list */
const usable = (list) =>
  list
    .filter((p) => p && p.code && (p.product_name || p.product_name_en || p.product_name_bg) && p.nutriments)
    .map(slim)
    .slice(0, PAGE);

/**
 * Ask OFF: the legacy search first (more complete), then the search service.
 * @param {{q: string, lang: string}} s @param {typeof fetch} f
 * @returns {Promise<any[]>} throws 'upstream' / 'upstream-busy'
 */
export async function offSearch(s, f) {
  const urls = [
    [
      `https://world.openfoodfacts.org/cgi/search.pl?search_terms=${encodeURIComponent(s.q)}&search_simple=1&action=process&json=1&page_size=${PAGE}&fields=${OFF_FIELDS}`,
      'products',
    ],
    [
      `https://search.openfoodfacts.org/search?q=${encodeURIComponent(s.q)}&page_size=${PAGE}&langs=${s.lang},en&fields=${OFF_FIELDS}`,
      'hits',
    ],
  ];
  let busy = false;
  for (const [u, key] of urls) {
    try {
      const r = await f(u, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(7000),
      });
      if (r.status === 429) busy = true;
      if (!r.ok) continue;
      const j = await r.json();
      if (Array.isArray(j?.[key])) return usable(j[key]);
    } catch {
      /* next source */
    }
  }
  throw new Error(busy ? 'upstream-busy' : 'upstream');
}

/**
 * The edge-cache key for a normalised query on this Worker's own origin (never the client's
 * IP or headers). @param {string} origin @param {{q: string, lang: string}} s
 */
export const cacheKey = (origin, s) =>
  new Request(`${origin}/off-search?v=1&lang=${s.lang}&q=${encodeURIComponent(s.q)}`);

/**
 * Small per-isolate memo (the Cache API is a no-op on workers.dev, so this keeps repeated
 * searches off OFF there). @param {number} max @param {number} ttlMs
 */
export function memo(max = 300, ttlMs = 3_600_000) {
  /** @type {Map<string, {at: number, body: string}>} */
  const m = new Map();
  return {
    /** @param {string} k */
    get(k, now = Date.now()) {
      const e = m.get(k);
      if (!e || now - e.at > ttlMs) return (m.delete(k), null);
      return e.body;
    },
    /** @param {string} k @param {string} body */
    set(k, body, now = Date.now()) {
      m.delete(k);
      m.set(k, { at: now, body });
      if (m.size > max) m.delete(/** @type {string} */ (m.keys().next().value));
    },
  };
}
