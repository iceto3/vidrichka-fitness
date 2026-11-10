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

test('1d: steps – slider every 500, fine-tune ±50/±100, never below 0', async () => {
  globalThis.addEventListener ??= () => {};
  const { FINE_STEPS, SLIDER_STEP, clampDelta, sliderMax, snapSteps } =
    await import('../../src/features/steps/logic.js');
  const { addSteps, setSteps, steps } = await import('../../src/features/steps/api.js');
  const { addDaySteps } = await import('../../src/features/day/api.js');
  assert.deepEqual([...FINE_STEPS], [-100, -50, 50, 100]);
  assert.equal(SLIDER_STEP, 500);
  assert.equal(snapSteps(7230), 7000);
  assert.equal(snapSteps(7250), 7500);
  assert.equal(snapSteps(-300), 0);
  assert.equal(snapSteps(200_000), 100_000);
  assert.equal(sliderMax(0, 8000), 16_000);
  assert.equal(sliderMax(17_230, 8000), 17_500, 'room for a big day');
  assert.equal(sliderMax(99_999, 30_000), 100_000);
  assert.equal(clampDelta(-100), -100);
  assert.equal(clampDelta('x'), 0);
  const D = '2026-11-01';
  setSteps(D, 120);
  assert.equal(addSteps(D, -100), 20);
  assert.equal(addSteps(D, -50), 0, 'never below 0');
  assert.equal(steps(D), 0);
  assert.equal(addDaySteps(D, 50), 50);
  assert.equal(addDaySteps(D, -100), 0);
  assert.equal(addDaySteps(D, 100), 100);
});
