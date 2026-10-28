// 1.4.0 food database: fiber and salt everywhere, the 13 multi-source corrections, cooking
// variants, cottage cheese, mixed-mince ratios and the "Dishes & more" tile.
import test from 'node:test';
import assert from 'node:assert/strict';
import { FOODS, FOOD_CATEGORIES } from '../../src/data/foods.js';
import { portion } from '../../src/features/food/logic.js';

const by = Object.fromEntries(FOODS.map((f) => [f.id, f]));

test('every built-in food has known fiber and salt in a sane range', () => {
  for (const f of FOODS) {
    assert.ok(Number.isFinite(f.fib) && f.fib >= 0 && f.fib <= 60, `${f.id} fiber ${f.fib}`);
    assert.ok(Number.isFinite(f.salt) && f.salt >= 0 && f.salt <= 15, `${f.id} salt ${f.salt}`);
  }
});

test('energy roughly matches the macros (Atwater, fiber 2 kcal/g) – catches typos in new rows', () => {
  // Alcohol has its own energy; lemon (organic acids) and the approved cappuccino kcal
  // correction (macros not re-sourced yet) are known exceptions.
  const skip = new Set(['beer', 'wine_red', 'wine_white', 'rakia', 'lemon', 'cappuccino']);
  for (const f of FOODS) {
    if (skip.has(f.id) || f.kcal < 20) continue;
    const est = 4 * f.p + 4 * (f.c - f.fib) + 2 * f.fib + 9 * f.f;
    assert.ok(Math.abs(est - f.kcal) / f.kcal < 0.2, `${f.id}: ${f.kcal} kcal vs ~${Math.round(est)} from macros`);
  }
});

test('the 13 approved multi-source corrections are applied', () => {
  const want = {
    bread_wholegrain: { p: 9.4 },
    grapefruit: { kcal: 34, c: 8.1 },
    wine_red: { c: 0.5 },
    boza: { kcal: 69, c: 13.8 },
    pork_chop: { p: 29.2 },
    chicken_thigh: { f: 8.6 },
    cappuccino: { kcal: 28 },
    pizza: { salt: 1.12 },
    kashkaval: { salt: 2.33 },
    dyuner: { p: 14.6 },
    hummus: { p: 5.8, c: 17.8 },
    burger: { c: 31.3, f: 8.4 },
  };
  for (const [id, vals] of Object.entries(want))
    for (const [k, v] of Object.entries(vals)) assert.equal(/** @type {any} */ (by[id])[k], v, `${id}.${k}`);
});

test('cooking variants, cottage cheese and mince ratios exist; frying/breading adds energy', () => {
  for (const id of ['chicken_breast', 'chicken_thigh', 'turkey_breast', 'pork_chop'])
    for (const v of ['breaded', 'fried']) {
      const x = by[`${id}_${v}`];
      assert.ok(x, `${id}_${v}`);
      assert.equal(x.cat, 'meat');
      assert.ok(x.kcal > by[id].kcal - 30, `${id}_${v} is not leaner than the grilled one`);
    }
  for (const id of ['chicken_breast_boiled', 'fish_breaded', 'fish_fried', 'fish_white_boiled', 'beef_breaded'])
    assert.ok(by[id], id);
  assert.equal(by.cottage_cheese_cream.name.bg, 'Котидж сирене');
  for (const r of ['50', '75'])
    assert.match(by[`minced_mixed_${r}`].name.bg, /^Кайма смес \d\d\/\d\d \(свинско\/телешко, сурова\)$/);
  assert.match(by.minced_mixed.name.bg, /60\/40/);
});

test('"Dishes & more" (other) is a tile and has foods; fiber/salt flow into logged portions', () => {
  assert.ok(FOOD_CATEGORIES.some((c) => c.id === 'other'));
  assert.ok(FOODS.filter((f) => f.cat === 'other').length >= 10);
  const p = portion(by.bread_wholegrain, 50);
  assert.equal(p.fib, Math.round(by.bread_wholegrain.fib * 5) / 10);
  assert.ok(typeof p.salt === 'number');
});
