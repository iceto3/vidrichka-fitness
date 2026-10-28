// GET /off-search (1.4.0, additive): Open Food Facts text search through the Worker – origin,
// query checks, one upstream call, slimmed answer, memo/edge cache, rate limit, fallbacks.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { memo, readQuery, slim, UA } from '../src/off.js';

const APP = 'https://vidrichka-beta.pages.dev';
const ENV = { ALLOWED_ORIGINS: APP };
const NUT = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Nutella, Ferrero',
  serving_quantity: 15,
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    fiber_100g: 0,
    'nova-group_100g': 4,
  },
  ingredients_text: 'x'.repeat(5000),
};
/** fetch mock: answers per host; records URLs. */
function fakeFetch(/** @type {Record<string, any>} */ by = {}) {
  /** @type {any[]} */
  const calls = [];
  const f = async (/** @type {string} */ u, /** @type {any} */ init) => {
    calls.push({ u, init });
    const host = new URL(u).host;
    const a = by[host] ?? { status: 200, body: { products: [NUT] } };
    if (a === 'throw') throw new TypeError('network');
    return new Response(JSON.stringify(a.body ?? {}), { status: a.status ?? 200 });
  };
  return Object.assign(f, { calls });
}
const call = (/** @type {any} */ o = {}) =>
  handle(
    new Request(`https://voice.example/off-search${o.q ?? '?q=Nutella&lang=bg'}`, {
      method: o.method ?? 'GET',
      headers: o.origin === null ? {} : { Origin: o.origin ?? APP, 'CF-Connecting-IP': o.ip ?? '1.2.3.4' },
    }),
    o.env ?? ENV,
    {
      fetch: o.fetch ?? fakeFetch(),
      offLimit: o.limit ?? (() => true),
      cache: o.cache ?? null,
      memo: o.memo ?? memo(),
    },
  );

test('searches OFF once (legacy endpoint, with a User-Agent) and returns slim products with CORS', async () => {
  const f = fakeFetch();
  const res = await call({ fetch: f });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Access-Control-Allow-Origin'), APP);
  assert.match(res.headers.get('Cache-Control') ?? '', /public, max-age=86400/);
  const j = await res.json();
  assert.equal(j.products.length, 1);
  assert.deepEqual(Object.keys(j.products[0].nutriments).sort(), [
    'carbohydrates_100g',
    'energy-kcal_100g',
    'fat_100g',
    'fiber_100g',
    'proteins_100g',
  ]);
  assert.equal(j.products[0].nutriments.fiber_100g, 0, 'a reported 0 stays 0');
  assert.equal(j.products[0].ingredients_text, undefined, 'only the fields the app reads');
  assert.equal(f.calls.length, 1);
  assert.match(f.calls[0].u, /^https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=nutella&/);
  assert.equal(f.calls[0].init.headers['User-Agent'], UA);
});

test('falls back to the search service when the legacy endpoint fails; 502 / 429 when both fail', async () => {
  const f = fakeFetch({
    'world.openfoodfacts.org': { status: 503, body: {} },
    'search.openfoodfacts.org': { body: { hits: [NUT, { code: '1', product_name: 'no data' }] } },
  });
  const res = await call({ fetch: f });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).products.length, 1, 'products without nutriments are dropped');
  assert.equal(f.calls.length, 2);
  const bad = await call({
    fetch: fakeFetch({ 'world.openfoodfacts.org': 'throw', 'search.openfoodfacts.org': { status: 500 } }),
  });
  assert.equal(bad.status, 502);
  assert.equal(bad.headers.get('Access-Control-Allow-Origin'), APP, 'errors still readable by the app');
  const busy = await call({
    fetch: fakeFetch({ 'world.openfoodfacts.org': { status: 429 }, 'search.openfoodfacts.org': { status: 429 } }),
  });
  assert.equal(busy.status, 429);
});

test('a repeated search (any case/spacing) is answered from the memo without calling OFF', async () => {
  const m = memo(),
    f = fakeFetch();
  assert.equal((await call({ fetch: f, memo: m })).headers.get('X-Cache'), 'miss');
  const again = await call({ fetch: f, memo: m, q: '?q=%20%20NUTELLA%20&lang=bg' });
  assert.equal(again.headers.get('X-Cache'), 'memo');
  assert.equal((await again.json()).products[0].code, NUT.code);
  assert.equal(f.calls.length, 1);
});

test('edge cache: a hit skips OFF; a miss is stored', async () => {
  /** @type {Map<string, Response>} */
  const store = new Map();
  const cache = /** @type {any} */ ({
    match: async (/** @type {Request} */ r) => store.get(r.url)?.clone() ?? undefined,
    put: async (/** @type {Request} */ r, /** @type {Response} */ res) => void store.set(r.url, res),
  });
  const f = fakeFetch();
  await call({ fetch: f, cache });
  assert.equal(store.size, 1);
  assert.match([...store.keys()][0], /^https:\/\/voice\.example\/off-search\?v=1&lang=bg&q=nutella$/);
  const hit = await call({ fetch: f, cache });
  assert.equal(hit.headers.get('X-Cache'), 'edge');
  assert.equal(f.calls.length, 1);
});

test('origin, method, query checks and the rate limit', async () => {
  assert.equal((await call({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ origin: null })).status, 403);
  assert.equal((await call({ method: 'POST' })).status, 405);
  assert.equal((await call({ q: '?q=a' })).status, 400);
  assert.equal((await call({ q: `?q=${'x'.repeat(61)}` })).status, 413);
  const f = fakeFetch();
  const lim = await call({ fetch: f, limit: () => false });
  assert.equal(lim.status, 429);
  assert.equal(lim.headers.get('Retry-After'), '60');
  assert.equal(f.calls.length, 0);
  let n = 0;
  const env = { ...ENV, OFF_LIMITER: { limit: async () => ({ success: ++n < 2 }) } };
  assert.equal((await call({ env })).status, 200);
  assert.equal((await call({ env, q: '?q=milka' })).status, 429, 'the binding is honoured');
  const pre = await handle(
    new Request('https://voice.example/off-search', { method: 'OPTIONS', headers: { Origin: APP } }),
    ENV,
  );
  assert.equal(pre.status, 204);
});

test('readQuery / slim / memo units', () => {
  assert.deepEqual(readQuery(new URL('https://x/off-search?q=  Кисело   Мляко ')), { q: 'кисело мляко', lang: 'bg' });
  assert.equal(readQuery(new URL('https://x/?q=milk&lang=en')).lang, 'en');
  assert.equal(slim({ code: 5, product_name: 'A', nutriments: { fat_100g: '' } }).nutriments.fat_100g, undefined);
  const m = memo(2, 1000);
  m.set('a', '1', 0);
  m.set('b', '2', 0);
  m.set('c', '3', 0);
  assert.equal(m.get('a', 1), null, 'oldest evicted');
  assert.equal(m.get('c', 1), '3');
  assert.equal(m.get('c', 5000), null, 'expired');
});

test('the query is never logged', async () => {
  const logs = [];
  const log = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    await call({
      q: '?q=secretfood',
      fetch: fakeFetch({ 'world.openfoodfacts.org': 'throw', 'search.openfoodfacts.org': 'throw' }),
    });
  } finally {
    console.log = log;
  }
  assert.ok(logs.every((l) => !l.includes('secretfood')));
});
