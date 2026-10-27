// Nutrition maths and the built-in food database.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { portion, totals, signature, timesEaten, fromOff, mealFor } from '../../src/features/food/logic.js';
import { FOODS, FOOD_CATEGORIES, QUICK_PICKS } from '../../src/data/foods.js';

test('portion scales per-100 g values', () => {
  assert.deepEqual(portion({ kcal: 165, p: 31, c: 0, f: 3.6 }, 170), { kcal: 281, p: 52.7, c: 0, f: 6.1 });
  assert.deepEqual(portion({ kcal: 100, p: 0, c: 0, f: 0 }, 0), { kcal: 0, p: 0, c: 0, f: 0 });
});

test('totals sum rows', () => {
  assert.deepEqual(
    totals([
      { kcal: 100, p: 1, c: 2, f: 3 },
      { kcal: 50, p: 1, c: 1, f: 1 },
    ]),
    { kcal: 150, p: 2, c: 3, f: 4, fib: 0, salt: 0, fibN: 0, saltN: 0 },
  );
});

test('regular-meal detection matches the same foods on earlier days, order-independent', () => {
  const rows = [
    { date: '2026-10-01', meal: 'breakfast', foodId: 'oats' },
    { date: '2026-10-01', meal: 'breakfast', foodId: 'banana' },
    { date: '2026-10-02', meal: 'breakfast', foodId: 'banana' },
    { date: '2026-10-02', meal: 'breakfast', foodId: 'oats' },
    { date: '2026-10-03', meal: 'breakfast', foodId: 'banana' },
    { date: '2026-10-03', meal: 'breakfast', foodId: 'oats' },
  ];
  const sig = signature([{ foodId: 'oats' }, { foodId: 'banana' }]);
  assert.equal(timesEaten(rows, sig, '2026-10-03'), 2);
});

test('Open Food Facts nutriments, with kJ fallback', () => {
  assert.deepEqual(
    fromOff({ nutriments: { 'energy-kcal_100g': 52, proteins_100g: 0.3, carbohydrates_100g: 14, fat_100g: 0.2 } }),
    { kcal: 52, p: 0.3, c: 14, f: 0.2 },
  );
  assert.equal(fromOff({ nutriments: { energy_100g: 418.4 } }).kcal, 100);
  assert.equal(fromOff({ nutriments: {} }), null);
});

test('meal of day by hour', () => {
  assert.equal(mealFor(new Date(2026, 0, 1, 8)), 'breakfast');
  assert.equal(mealFor(new Date(2026, 0, 1, 12)), 'lunch');
  assert.equal(mealFor(new Date(2026, 0, 1, 19)), 'dinner');
});

test('food database: 9 categories (1.4.0 adds "other"), bilingual names, valid macros, quick picks exist', () => {
  assert.equal(FOOD_CATEGORIES.length, 9);
  const ids = new Set(FOODS.map((f) => f.id));
  assert.equal(ids.size, FOODS.length, 'unique ids');
  for (const f of FOODS) {
    assert.ok(f.name.en && f.name.bg, `${f.id} has EN and BG names`);
    assert.ok(f.kcal >= 0 && f.p >= 0 && f.c >= 0 && f.f >= 0, `${f.id} macros`);
  }
  for (const q of QUICK_PICKS) assert.ok(ids.has(q), q);
});
