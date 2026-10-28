// 1.4.0 final fixes: the ONE plausibility check for Open Food Facts values (impossible
// products are filtered out, never shown), missing values counted as 0 but shown and
// fillable (saved with the food and its diary rows), извара salt, grilled meat = cooked meat.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../../src/data/foods.js';
import { applyFix, fromOff, implausible, kcalMismatch, missingValues } from '../../src/features/food/logic.js';
import { product, reliable, search, toFood } from '../../src/features/food/off.js';
import { all, put } from '../../src/core/store.js';
import { logFood, rowFromFood, saveFoodFix } from '../../src/features/food/api.js';
import { setLang, t } from '../../src/core/i18n.js';

const NUT = { p: 6.3, c: 57.5, f: 30.9 }; // 4/4/9 → 534 kcal
const off = (/** @type {any} */ nutriments, code = '1') => ({ code, product_name: `P${code}`, nutriments });

test('implausible(): 4/4/9 mismatch over 30 % AND 30 kcal, kcal > 900, P+C+F or a value > 100 g, negatives', () => {
  assert.equal(implausible({ kcal: 539, ...NUT }), false, 'real Nutella');
  assert.equal(implausible({ kcal: 5, ...NUT }), true, '"Nutella 5 kcal"');
  assert.equal(implausible({ kcal: 950, p: 0, c: 0, f: 100 }), true, 'kcal > 900');
  assert.equal(implausible({ kcal: 400, p: 50, c: 40, f: 20 }), true, 'P+C+F > 100 g');
  assert.equal(implausible({ kcal: 100, p: 5, c: 10, f: 2, salt: 120 }), true, 'salt > 100 g');
  assert.equal(implausible({ kcal: 100, p: -1, c: 20, f: 2 }), true, 'negative macro');
  assert.equal(implausible({ kcal: 100, p: 5, c: 15, f: 2, fib: -2 }), true, 'negative fibre');
  // small foods: 30 kcal absolute tolerance (water, cucumber, diet cola)
  assert.equal(implausible({ kcal: 0, p: 0, c: 0, f: 0 }), false);
  assert.equal(implausible({ kcal: 15, p: 0.7, c: 3.6, f: 0.1 }), false);
  assert.equal(implausible({ kcal: 25, p: 0, c: 0, f: 0 }), false, '25 kcal off is within 30 kcal');
  // a missing macro can only add calories: kcal above the estimate is fine, below is not
  assert.equal(implausible({ kcal: 539, p: 6.3, c: 0, f: 30.9, missing: ['c'] }), false);
  assert.equal(implausible({ kcal: 5, p: 6.3, c: 0, f: 30.9, missing: ['c'] }), true);
  assert.equal(implausible({ kcal: 0, ...NUT, missing: ['kcal'] }), false, 'missing kcal is not compared');
  // alcohol (7 kcal/g) explains the calories of wine and spirits
  assert.equal(implausible({ kcal: 85, p: 0.1, c: 2.6, f: 0 }), true, 'wine without its alcohol');
  assert.equal(implausible({ kcal: 85, p: 0.1, c: 2.6, f: 0, alc: 10.6 }), false);
  const wine = fromOff({
    nutriments: { 'energy-kcal_100g': 85, proteins_100g: 0.1, carbohydrates_100g: 2.6, fat_100g: 0, alcohol_100g: 13 },
  });
  assert.equal(wine?.alc, 10.3, '13 % vol × 0.789 g/ml');
  assert.equal(implausible(/** @type {any} */ (wine)), false);
  // thresholds
  assert.equal(kcalMismatch(130, 100), false, '30 % exactly is fine');
  assert.equal(kcalMismatch(131, 100), true);
  assert.equal(kcalMismatch(60, 31), false, 'more than 30 % but only 29 kcal');
});

test('fromOff: unlisted values count as 0 and are named in `missing` (kcal too); nothing at all → null', () => {
  const a = fromOff({ nutriments: { proteins_100g: 10, carbohydrates_100g: 20, fat_100g: 5 } });
  assert.deepEqual(a, { kcal: 0, p: 10, c: 20, f: 5, missing: ['kcal'] });
  const b = fromOff({ nutriments: { 'energy-kcal_100g': 250, fat_100g: 12 } });
  assert.deepEqual(b?.missing, ['p', 'c']);
  assert.equal(b?.p, 0);
  assert.equal(fromOff({ nutriments: {} }), null);
  assert.equal(fromOff({ nutriments: { fiber_100g: 3 } }), null);
});

test('search drops implausible products; the rest stay in order', async () => {
  const products = [
    off({ 'energy-kcal_100g': 5, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }, '1'),
    off({ 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }, '2'),
    off({ 'energy-kcal_100g': 1200, proteins_100g: 0, carbohydrates_100g: 0, fat_100g: 100 }, '3'),
  ];
  const r = await search('nutella final', 'bg', { proxy: 'https://w.example', fetchJson: async () => ({ products }) });
  assert.deepEqual(
    r?.map((f) => f.barcode),
    ['2'],
  );
  const none = await search('only bad final', 'bg', {
    proxy: 'https://w.example',
    fetchJson: async () => ({ products: [products[0]] }),
  });
  assert.deepEqual(none, [], 'nothing reliable → empty list ("enter it yourself")');
  assert.equal(reliable(toFood(products[1], 'bg')), true);
  assert.equal(reliable(null), false);
});

test('barcode: an implausible product is "not found" with its name for the form', async () => {
  const real = globalThis.fetch;
  /** @type {any} */ let body;
  globalThis.fetch = /** @type {any} */ (async () => ({ ok: true, json: async () => body }));
  try {
    body = {
      status: 1,
      product: off({ 'energy-kcal_100g': 5, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }, '42'),
    };
    assert.deepEqual(await product('42', 'bg'), { unreliable: true, name: 'P42' });
    body = { status: 1, product: off({ 'energy-kcal_100g': 250, proteins_100g: 10, fat_100g: 12 }, '43') };
    const ok = /** @type {any} */ (await product('43', 'bg'));
    assert.equal(ok.id, 'off_43');
    assert.deepEqual(ok.missing, ['c']);
    body = { status: 0 };
    assert.equal(await product('44', 'bg'), 'notfound');
  } finally {
    globalThis.fetch = real;
  }
});

test('missingValues: OFF foods list unlisted kcal/П/В/М plus unknown fibre/salt, in a fixed order', () => {
  const f = toFood(off({ 'energy-kcal_100g': 250, proteins_100g: 10, fat_100g: 12, salt_100g: 1 }, '7'), 'bg');
  assert.deepEqual(missingValues(f), ['c', 'fib']);
  assert.deepEqual(missingValues(FOODS[0]), [], 'built-in foods never');
  assert.deepEqual(missingValues({ missing: ['c'] }), ['c'], 'a diary row carries its own');
  assert.deepEqual(missingValues({ ...f, fixed: true, missing: undefined }), [], 'after the user filled it in');
});

test('the notice text names the values and says they count as 0 (Bulgarian)', async () => {
  await setLang('bg');
  assert.equal(
    t('food.missingValues', { n: 1, what: t('nutrient.c') }),
    'Липсва стойност за въглехидрати – брои се като 0. Попълни я.',
  );
  assert.match(
    t('food.missingValues', { n: 2, what: 'въглехидрати, фибри' }),
    /^Липсват стойности за .* Попълни ги\.$/,
  );
  assert.equal(t('food.noReliable'), 'Няма надежден резултат за тази храна. Въведи я сам.');
  await setLang('en');
});

test('applyFix: typed values replace, empty kcal/П/В/М stay missing, id/barcode kept; saved with the food and its rows', () => {
  const f = /** @type {any} */ (toFood(off({ 'energy-kcal_100g': 250, proteins_100g: 10, fat_100g: 12 }, '99'), 'bg'));
  const row = logFood(f, 200, 'lunch', '2026-10-28');
  assert.equal(row.c, 0, 'counted as 0 before the fix');
  assert.deepEqual(row.missing, ['c']);
  const fixed = applyFix(f, {
    name: f.name,
    kcal: '250',
    p: '10',
    c: '20,5',
    f: '12',
    fib: '',
    salt: '0.4',
    portion: '50',
  });
  assert.equal(fixed.id, 'off_99');
  assert.equal(fixed.barcode, '99');
  assert.equal(fixed.c, 20.5);
  assert.equal(fixed.salt, 0.4);
  assert.equal(fixed.fib, undefined, 'empty fibre stays unknown');
  assert.equal(fixed.missing, undefined);
  assert.equal(fixed.fixed, true);
  assert.deepEqual(missingValues(fixed), []);
  const partly = applyFix(f, { name: f.name, kcal: '250', p: '10', c: '', f: '12', portion: '100' });
  assert.deepEqual(partly.missing, ['c'], 'left empty → still missing');
  const rows = saveFoodFix(fixed);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].c, 41, '20.5 g × 2');
  assert.equal(rows[0].salt, 0.8);
  assert.equal(rows[0].missing, undefined);
  assert.equal(all('foods').find((x) => x.barcode === '99')?.c, 20.5, 'the next scan finds the corrected food');
  // a row without missing values is left alone unless it is the one being edited
  put('food', { ...rows[0], id: 'other', c: 1 });
  assert.equal(saveFoodFix(fixed).length, 0, 'nothing left to fix');
  assert.equal(saveFoodFix(fixed, 'other').length, 1);
  assert.equal(rowFromFood({ grams: 50, fib: 1 }, { name: 'x', kcal: 100, p: 1, c: 1, f: 1 }).fib, undefined);
});

test('built-in foods: извара salt 0.1 g / 100 g; every „на скара“ meat is a cooked-meat entry', () => {
  const izvara = FOODS.find((f) => f.id === 'cottage_cheese');
  assert.equal(izvara?.name.bg, 'Извара');
  assert.equal(izvara?.salt, 0.1);
  const grilled = FOODS.filter((f) => /на скара/.test(f.name.bg));
  assert.ok(grilled.length >= 8);
  for (const f of grilled) {
    assert.equal(f.cat, 'meat', f.id);
    assert.match(f.name.en, /\(grilled\)/, f.id);
    assert.doesNotMatch(f.name.bg, /сур/, `${f.id} is not raw`);
  }
  // cooked weight: more protein per 100 g than the raw cut
  for (const [cooked, raw] of [
    ['chicken_breast', 'chicken_breast_raw'],
    ['turkey_breast', 'turkey_breast_raw'],
    ['pork_loin', 'pork_loin_raw'],
    ['salmon_grilled', 'salmon'],
  ]) {
    const c = FOODS.find((f) => f.id === cooked),
      r = FOODS.find((f) => f.id === raw);
    assert.ok(c && r && c.p > r.p, `${cooked} (cooked) > ${raw}`);
  }
  // the built-in list passes the same check (wine/rakia: their alcohol, 7 kcal/g, explains the kcal)
  const ALC = { wine_red: 10.6, wine_white: 10.3, rakia: 33, beer: 3.9 };
  for (const f of FOODS)
    assert.equal(implausible({ ...f, alc: /** @type {any} */ (ALC)[f.id] }), false, `built-in ${f.id}`);
});
