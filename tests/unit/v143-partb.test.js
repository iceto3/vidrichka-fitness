// 1.4.3 part B: B1 meals per day (five meals, switches, enabled-only picking).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setKv } from '../../src/core/store.js';
import { setLang, t } from '../../src/core/i18n.js';
import {
  MEALS_ON,
  dailySettings,
  enabledMeals,
  mealsOn,
  proteinBreakfastOn,
  setSettings,
} from '../../src/core/settings.js';
import { MEALS, MEAL_STYLE, MEAL_TIME, mealFor, mealsForDay } from '../../src/features/food/logic.js';
import { MEALS as VOICE_MEALS, assignMeals } from '../../src/features/voice/logic.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
await setLang('bg');

const at = (/** @type {number} */ h, m = 0) => new Date(2026, 10, 10, h, m);

test('B1: five meals in the day’s order; the old snack is the afternoon snack', () => {
  assert.deepEqual(
    MEALS.map(([m]) => m),
    ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner'],
  );
  assert.deepEqual(VOICE_MEALS, ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner']);
  assert.deepEqual(MEALS_ON, { breakfast: true, snack_am: false, lunch: true, snack: true, dinner: true });
  assert.equal(t('meal.snack'), 'Следобедно междинно');
  assert.equal(t('meal.snack_am'), 'Сутрешно междинно');
  assert.ok(MEAL_STYLE.snack_am && MEAL_TIME.snack_am);
  for (const m of ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner'])
    for (const k of [`meal.${m}`, `mealShort.${m}`, `food.usualMeal.${m}`]) assert.ok(bg[k] && en[k], k);
});

test('B1: switches – defaults for existing users, never all off, breakfast off = protein breakfast off', () => {
  setKv('settings', {});
  assert.deepEqual(enabledMeals(), ['breakfast', 'lunch', 'snack', 'dinner']);
  setSettings({ meals: { snack_am: true } }); // partial map: the rest from the defaults
  assert.deepEqual(enabledMeals(), ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner']);
  setSettings({ meals: { breakfast: false, snack_am: false, lunch: false, snack: false, dinner: false } });
  assert.equal(enabledMeals().length, 5, 'all off is never used: every meal');
  setSettings({ meals: { ...mealsOn(), breakfast: false, lunch: true } });
  assert.equal(proteinBreakfastOn(), false, 'no protein breakfast without breakfast');
  assert.equal(dailySettings().protein, false);
  setSettings({ meals: { ...mealsOn(), breakfast: true } });
  assert.equal(proteinBreakfastOn(), true);
  setKv('settings', {});
});

test('B1: time-of-day pick only from the meals that are on', () => {
  const four = ['breakfast', 'lunch', 'snack', 'dinner'];
  assert.equal(mealFor(at(8), four), 'breakfast');
  assert.equal(mealFor(at(10, 30), four), 'breakfast');
  assert.equal(mealFor(at(11), four), 'lunch', 'as before without the morning snack');
  assert.equal(mealFor(at(16), four), 'snack');
  assert.equal(mealFor(at(20), four), 'dinner');
  assert.equal(mealFor(at(2), four), 'snack', 'small hours as before');
  const five = ['breakfast', 'snack_am', 'lunch', 'snack', 'dinner'];
  assert.equal(mealFor(at(10, 30), five), 'snack_am');
  assert.equal(mealFor(at(11, 30), five), 'snack_am');
  assert.equal(mealFor(at(12), five), 'lunch');
  assert.equal(mealFor(at(8), ['lunch', 'dinner']), 'dinner', 'before lunch with no breakfast: last meal');
  assert.equal(mealFor(at(16), ['breakfast', 'lunch', 'dinner']), 'lunch', 'snack off');
  assert.equal(mealFor(at(19)), 'dinner', 'default list');
});

test('B1: hidden meals keep their entries visible on the days that have them', () => {
  const on = ['breakfast', 'lunch', 'dinner'];
  assert.deepEqual(mealsForDay(on, []), ['breakfast', 'lunch', 'dinner']);
  assert.deepEqual(mealsForDay(on, [{ meal: 'snack' }]), ['breakfast', 'lunch', 'snack', 'dinner']);
  assert.deepEqual(mealsForDay(['dinner'], [{ meal: 'snack_am' }]), ['snack_am', 'dinner']);
});

test('B1: voice entries go only to meals that are on', () => {
  const o = { today: '2026-11-10', defaultMeal: 'lunch', enabled: ['breakfast', 'lunch', 'snack_am', 'dinner'] };
  const e = (/** @type {any} */ x) => ({ type: 'food', date: '2026-11-10', time: null, ...x });
  const out = assignMeals(
    /** @type {any} */ ([
      e({ meal: 'snack', meal_named: true }), // afternoon snack off → the morning one
      e({ meal: 'breakfast', meal_named: true }),
      e({ meal: 'dinner', time: '19:00' }),
      e({ meal: 'snack', time: '16:00' }),
    ]),
    o,
  );
  assert.deepEqual(
    out.map((x) => x.meal),
    ['snack_am', 'breakfast', 'dinner', 'snack_am'],
  );
  const noSnacks = assignMeals(/** @type {any} */ ([e({ meal: 'snack', meal_named: true })]), {
    ...o,
    enabled: ['breakfast', 'lunch'],
  });
  assert.equal(noSnacks[0].meal, 'lunch', 'else the current meal');
  assert.equal(
    assignMeals(/** @type {any} */ ([e({ meal: 'snack_am' })]), {
      today: '2026-11-10',
      defaultMeal: 'lunch',
      screenMeal: 'snack_am',
    })[0].meal,
    'snack_am',
    'no list given: unchanged',
  );
});
