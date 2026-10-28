// 1.4.0 tester round 3: online search through the Worker (one request, memo, 404 fallback),
// Nutella's reported fibre, the weight-step label, the nights list without times, the build id.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normQuery, search, toFood } from '../../src/features/food/off.js';

const NUT = {
  code: '3017620422003',
  product_name: 'Nutella',
  brands: 'Nutella, Ferrero',
  nutriments: {
    'energy-kcal_100g': 539,
    proteins_100g: 6.3,
    carbohydrates_100g: 57.5,
    fat_100g: 30.9,
    fiber_100g: 0,
    salt_100g: 0.107,
  },
};

test('online search: one request to the Worker, memoised per language and normalised text', async () => {
  /** @type {string[]} */
  const urls = [];
  const fetchJson = async (/** @type {string} */ u) => (urls.push(u), { products: [NUT] });
  const a = await search('  NUTella ', 'bg', { proxy: 'https://w.example', fetchJson });
  assert.equal(a?.length, 1);
  assert.equal(a?.[0]?.name, 'Nutella');
  assert.deepEqual(urls, ['https://w.example/off-search?q=nutella&lang=bg']);
  await search('nutella', 'bg', { proxy: 'https://w.example', fetchJson });
  assert.equal(urls.length, 1, 'second identical search served from memory');
  assert.equal(normQuery(' Кисело  МЛЯКО'), 'кисело мляко');
});

test('online search: falls back to OFF directly only without a Worker or when it has no /off-search', async () => {
  /** @type {string[]} */
  const urls = [];
  const old = async (/** @type {string} */ u) => (urls.push(u), u.includes('/off-search') ? 404 : { products: [NUT] });
  assert.equal((await search('milka1', 'bg', { proxy: 'https://w.example', fetchJson: old }))?.length, 1);
  assert.equal(urls.length, 2);
  assert.match(urls[1], /^https:\/\/world\.openfoodfacts\.org\/cgi\/search\.pl\?search_terms=milka1&/);
  urls.length = 0;
  assert.equal((await search('milka2', 'bg', { proxy: '', fetchJson: old }))?.length, 1);
  assert.equal(urls.length, 1);
  urls.length = 0;
  const down = async (/** @type {string} */ u) => (urls.push(u), null);
  assert.equal(await search('milka3', 'bg', { proxy: 'https://w.example', fetchJson: down }), null, 'unavailable');
  assert.equal(urls.length, 1, 'no second request (and no CORS console spam) when the Worker is down');
  assert.deepEqual(
    await search('milka4', 'bg', { proxy: 'https://w.example', fetchJson: async () => ({ products: [] }) }),
    [],
    'nothing found',
  );
});

test('Nutella: OFF reports fibre 0 g → kept as 0 (not "unknown"); absent fibre stays unknown', () => {
  const f = toFood(NUT, 'bg');
  assert.equal(f?.fib, 0);
  const n2 = toFood({ ...NUT, nutriments: { ...NUT.nutriments, fiber_100g: undefined } }, 'bg');
  assert.equal(/** @type {any} */ (n2)?.fib, undefined);
});

test('Нощи list: no "– → –" when bed and wake are missing; only the known end otherwise', async () => {
  globalThis.addEventListener ??= () => {};
  // @ts-ignore minimal storage for the i18n module
  globalThis.localStorage ??= { getItem: () => null, setItem() {}, removeItem() {} };
  const { bedWake } = await import('../../src/features/daily/views/sleep.js');
  const bed = new Date(2026, 0, 1, 23, 10).getTime(),
    wake = new Date(2026, 0, 2, 7, 5).getTime();
  assert.equal(String(bedWake({})), '');
  assert.equal(String(bedWake({ bed: null, wake: null })), '');
  assert.match(String(bedWake({ bed, wake })), />23:10 → 07:05</);
  assert.match(String(bedWake({ wake })), />→ 07:05</);
  assert.doesNotMatch(String(bedWake({ wake })), /–/);
  assert.match(String(bedWake({ bed })), />23:10 →</);
});
