// 1.4.0 tester round: sleep in hours + minutes, BG numbers, barcode names and unknown
// nutrients, online search that always ends, meal times for past days, the kcal hint and the
// food data (izvara vs cottage cheese, raw / grilled meat, mince labels).
import test from 'node:test';
import assert from 'node:assert/strict';
import { fmtDuration, fmtNum, parseDuration, setLang } from '../../src/core/i18n.js';
import { offView, toFood, within, withBrand } from '../../src/features/food/off.js';
import { MEAL_TIME, fromOff, kcalOff, mealTs, validateFood } from '../../src/features/food/logic.js';
import { FOODS, FOOD_NOTES } from '../../src/data/foods.js';

const by = Object.fromEntries(FOODS.map((f) => [f.id, f]));
const NB = /[\s\u00a0\u202f]/;

test('durations read as hours and minutes and parse back', async () => {
  await setLang('bg');
  assert.equal(fmtDuration(7 + 20 / 60), '7 ч 20 мин');
  assert.equal(fmtDuration(8), '8 ч 00 мин'); // 1.4.2: always X ч MM мин
  assert.equal(fmtDuration(0.75), '45 мин');
  assert.equal(fmtDuration(6 + 5 / 60), '6 ч 05 мин');
  for (const s of ['7 ч 20 мин', '7h20', '7:20', '7 20']) assert.ok(Math.abs(parseDuration(s) - (7 + 1 / 3)) < 1e-9, s);
  assert.equal(parseDuration('7,5'), 7.5);
  assert.equal(parseDuration('45 мин'), 0.75);
  assert.ok(Number.isNaN(parseDuration('7:75')));
  assert.ok(Number.isNaN(parseDuration('abc')));
  await setLang('en');
  assert.equal(fmtDuration(7 + 20 / 60), '7 h 20 min');
});

test('Bulgarian numbers: decimal comma and grouped thousands (4 digits too)', async () => {
  await setLang('bg');
  assert.equal(fmtNum(2.5, 1), '2,5');
  assert.match(fmtNum(2145), new RegExp(`^2${NB.source}145$`));
  assert.match(fmtNum(12400), new RegExp(`^12${NB.source}400$`));
  assert.equal(fmtNum(999), '999');
  await setLang('en');
});

test('barcode names never repeat the brand', () => {
  assert.equal(withBrand('Nutella', 'Nutella, Ferrero'), 'Nutella');
  assert.equal(withBrand('nutella', 'Nutella'), 'nutella');
  assert.equal(withBrand('Lidl Joghurt', 'Lidl'), 'Lidl Joghurt');
  assert.equal(withBrand('Шоколад', 'Milka'), 'Шоколад · Milka');
  assert.equal(withBrand('Хляб', ''), 'Хляб');
  const f = toFood(
    {
      code: '3017620422003',
      product_name: 'Nutella',
      brands: 'Nutella,Ferrero',
      nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
    },
    'bg',
  );
  assert.equal(f?.name, 'Nutella');
});

test('a product that does not list a nutrient keeps it unknown (shown "–")', () => {
  const n = fromOff({ nutriments: { 'energy-kcal_100g': 250, proteins_100g: 10, fat_100g: 12 } });
  assert.ok(n);
  assert.deepEqual(/** @type {any} */ (n).missing, ['c']);
  assert.equal(n.fib, undefined);
  assert.equal(n.salt, undefined);
  const full = fromOff({
    nutriments: { 'energy-kcal_100g': 250, proteins_100g: 10, carbohydrates_100g: 30, fat_100g: 12, fiber_100g: 3 },
  });
  assert.equal(/** @type {any} */ (full)?.missing, undefined);
  assert.equal(full?.fib, 3);
});

test('a search never hangs: within() caps it and swallows rejections', async () => {
  assert.equal(await within(new Promise(() => {}), 10, 'cap'), 'cap');
  assert.equal(await within(Promise.reject(new Error('x')), 50, 'cap'), 'cap');
});

test('the online block is never stuck on "Searching…" for a finished search', () => {
  const off = { q: 'nute', state: /** @type {any} */ ('done'), list: [] };
  assert.equal(offView(off, 'nu'), '');
  assert.equal(offView(off, 'nute'), 'none');
  assert.equal(offView({ ...off, list: [{}] }, 'nute'), 'list');
  assert.equal(offView({ ...off, state: 'fail' }, 'nute '), 'fail');
  assert.equal(offView({ ...off, state: 'busy' }, 'nute'), 'busy');
  assert.equal(offView(off, 'nutel'), 'busy'); // new text → a new search is on its way
});

test("food for a past day gets the meal's usual time; today keeps the real time", () => {
  assert.deepEqual(MEAL_TIME, { breakfast: '08:00', lunch: '13:00', snack: '16:00', dinner: '19:00' });
  const at = (/** @type {string} */ meal) => new Date(mealTs('2026-10-20', meal, '2026-10-28')).getHours();
  assert.equal(at('breakfast'), 8);
  assert.equal(at('lunch'), 13);
  assert.equal(at('snack'), 16);
  assert.equal(at('dinner'), 19);
  assert.equal(mealTs('2026-10-28', 'breakfast', '2026-10-28', 123), 123);
});

test('kcal vs macros: a gentle hint over 20 % AND 30 kcal, never an error', () => {
  assert.equal(kcalOff(165, 160), false);
  assert.equal(kcalOff(60, 85), false); // 25 kcal: under 30
  assert.equal(kcalOff(400, 300), true);
  assert.equal(kcalOff(130, 165), true); // 35 kcal and 21 %
  assert.equal(kcalOff(140, 165), false); // 25 kcal
  const r = validateFood({ kcal: '50', p: '20', c: '30', f: '10', portion: '100' });
  assert.deepEqual(r.errors, {});
  assert.equal(r.warn, 'manual.warnKcal');
  assert.equal(r.est, 290);
});

test('food data: izvara and cottage cheese differ; raw, grilled and mince rows are labelled', () => {
  assert.notEqual(by.cottage_cheese.kcal, by.cottage_cheese_cream.kcal);
  assert.notEqual(by.cottage_cheese.p, by.cottage_cheese_cream.p);
  assert.ok(by.cottage_cheese.salt < by.cottage_cheese_cream.salt, 'whey izvara is less salty');
  for (const id of [
    'chicken_breast_raw',
    'chicken_thigh_raw',
    'turkey_breast_raw',
    'pork_loin_raw',
    'beef_raw',
    'minced_beef_80',
  ])
    assert.match(by[id]?.name.bg ?? '', /\(сур(ово|ова)\)$/, id);
  for (const id of [
    'chicken_breast',
    'chicken_thigh',
    'turkey_breast',
    'beef_steak',
    'pork_loin',
    'pork_chop',
    'salmon_grilled',
  ])
    assert.match(by[id].name.bg, /\(на скара\)$/, id);
  for (const id of ['chicken_breast', 'turkey_breast', 'pork_loin'])
    assert.ok(by[`${id}_raw`].kcal < by[id].kcal, `${id}: raw is lighter per 100 g than grilled`);
  assert.equal(by.minced_mixed.name.bg, 'Кайма смес 60/40 (свинско/телешко, сурова)');
  assert.equal(by.minced_beef_80.f, 20);
  for (const id of ['minced_beef', 'minced_beef_80', 'minced_mixed', 'minced_mixed_50', 'minced_mixed_75'])
    assert.equal(FOOD_NOTES[id], 'food.noteMince');
  assert.equal(new Set(FOODS.map((f) => f.id)).size, FOODS.length, 'ids are unique');
});
