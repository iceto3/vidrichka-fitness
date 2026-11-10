// 1.5.0 part 1: the meal of the time without breakfast, steps fine-tune / slider, live kcal.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mealFor } from '../../src/features/food/logic.js';

const at = (/** @type {number} */ h, m = 0) => new Date(2026, 10, 20, h, m);

test('1b: breakfast off – before 10:00 the current meal is the next one, never the afternoon snack', () => {
  const noBf = ['lunch', 'snack', 'dinner'];
  for (const h of [4, 6, 8, 9]) assert.equal(mealFor(at(h, 59), noBf), 'lunch', `${h}:59`);
  assert.equal(mealFor(at(11), noBf), 'lunch');
  assert.equal(mealFor(at(16), noBf), 'snack');
  assert.equal(mealFor(at(19), noBf), 'dinner');
  // the morning snack on: it is the next meal before 10:00, then itself
  const am = ['snack_am', 'lunch', 'snack', 'dinner'];
  assert.equal(mealFor(at(9), am), 'snack_am');
  assert.equal(mealFor(at(10, 30), am), 'snack_am');
  assert.equal(mealFor(at(12), am), 'lunch');
  assert.equal(mealFor(at(9), ['snack', 'dinner']), 'snack', 'only afternoon meals: the next one');
  assert.equal(mealFor(at(9), ['dinner']), 'dinner');
  // with breakfast on nothing changes
  assert.equal(mealFor(at(9), ['breakfast', 'lunch', 'snack', 'dinner']), 'breakfast');
  // the small hours stay as before (the evening's meal)
  assert.equal(mealFor(at(2), noBf), 'snack');
});

test('1c: the amount follows each key while typing (input), steps on the buttons', async () => {
  globalThis.addEventListener ??= () => {};
  const { gramsFrom } = await import('../../src/features/food/views/grams.js');
  const el = (/** @type {any} */ v, d = '') => /** @type {any} */ ({ value: v, dataset: { d } });
  assert.equal(gramsFrom(100, el('2'), /** @type {any} */ ({ type: 'input' })), 2);
  assert.equal(gramsFrom(100, el('25'), /** @type {any} */ ({ type: 'input' })), 25);
  assert.equal(gramsFrom(100, el('12,6'), /** @type {any} */ ({ type: 'input' })), 13);
  assert.equal(gramsFrom(100, el(''), /** @type {any} */ ({ type: 'input' })), 0, 'cleared: 0 until typed');
  assert.equal(gramsFrom(100, el('250'), /** @type {any} */ ({ type: 'change' })), 250);
  assert.equal(gramsFrom(100, el('', '-10'), /** @type {any} */ ({ type: 'click' })), 90);
});
