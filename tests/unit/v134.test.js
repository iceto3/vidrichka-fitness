/**
 * 1.3.4: steps maths, manual sleep hours, the post-voice tour plan, Progress › Trends
 * (series, weekly workouts, goal days, insights and their thresholds), the anonymous food
 * payload, screenshot sizing, the feedback body and the new strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_STEPS, clampSteps, stepStreak } from '../../src/features/steps/logic.js';
import { nights } from '../../src/features/daily/logic.js';
import { planTour, placeOf, stopMs } from '../../src/features/voice/tour.js';
import { MIN_DAYS, dailyRows, goalDays, insights, series, weeklyWorkouts } from '../../src/features/progress/trends.js';
import { IMG_SIDE, MAX_IMAGES, feedbackBody, fitSize, foodPayload } from '../../src/features/improve/logic.js';
import { OTHER } from '../../src/features/voice/logic.js';
import { DEFAULTS } from '../../src/core/settings.js';
import { addDays, dayKey, parseDay } from '../../src/core/dates.js';
import { setGender, setLang, t } from '../../src/core/i18n.js';

const TODAY = '2026-10-27';
const back = (/** @type {number} */ n) => dayKey(addDays(parseDay(TODAY), -n));

test('settings defaults: 8000 steps, food sharing on', () => {
  assert.equal(DEFAULTS.stepGoal, 8000);
  assert.equal(DEFAULTS.shareFoods, true);
});

test('steps: clamped whole numbers and the goal streak (today counts once reached)', () => {
  assert.equal(clampSteps('5000.4'), 5000);
  assert.equal(clampSteps(-3), 0);
  assert.equal(clampSteps('lots'), 0);
  assert.equal(clampSteps(1e9), MAX_STEPS);
  const rows = [
    { id: back(3), steps: 9000 },
    { id: back(2), steps: 8000 },
    { id: back(1), steps: 8500 },
    { id: TODAY, steps: 1200 },
  ];
  assert.equal(stepStreak(rows, 8000, TODAY), 3, 'today not reached yet: up to yesterday');
  assert.equal(stepStreak([...rows.slice(0, 3), { id: TODAY, steps: 8000 }], 8000, TODAY), 4);
  assert.equal(stepStreak(rows, 9000, TODAY), 0);
});

test('manual sleep hours win over bedtime/wake-up', () => {
  const rows = [
    { id: back(1), bed: new Date(`${back(1)}T23:00`).getTime() },
    { id: TODAY, wake: new Date(`${TODAY}T07:00`).getTime(), sleepH: 6.5, sleepQ: 4 },
  ];
  const [n] = nights(rows, 1, TODAY);
  assert.equal(n.hours, 6.5);
  assert.equal(n.sleepQ, 4);
  const [m] = nights([rows[0], { id: TODAY, wake: rows[1].wake }], 1, TODAY);
  assert.equal(m.hours, 8);
});

test('voice understands the new entry types', () => {
  assert.deepEqual(OTHER, ['steps', 'sleep', 'weight', 'mood', 'energy']);
});

test('tour: 1 item = full, 2–3 = quick stops (deduped), more = summary only', () => {
  const water = { kind: 'water', date: TODAY, before: 2, after: 4 };
  assert.equal(planTour([], TODAY).mode, 'none');
  const one = planTour([/** @type {any} */ (water)], TODAY);
  assert.equal(one.mode, 'full');
  assert.deepEqual(
    one.stops.map((s) => [s.route, s.sel]),
    [['food', '.food .water']],
  );
  const three = planTour(
    /** @type {any} */ ([
      { kind: 'food', date: TODAY, meal: 'lunch' },
      { kind: 'food', date: TODAY, meal: 'lunch' },
      { kind: 'steps', date: TODAY, before: 0, after: 5000 },
    ]),
    TODAY,
  );
  assert.equal(three.mode, 'quick');
  assert.equal(three.stops.length, 2, 'two foods in the same meal = one stop');
  assert.equal(three.stops[0].items.length, 2);
  assert.equal(three.main, 'food');
  const five = planTour(/** @type {any} */ (Array(5).fill(water)), TODAY);
  assert.equal(five.mode, 'summary');
  assert.deepEqual(five.stops, []);
  assert.equal(five.main, 'food');
  assert.equal(placeOf(/** @type {any} */ ({ kind: 'steps', date: back(1) }), TODAY).route, 'progress/trends');
  assert.equal(placeOf(/** @type {any} */ ({ kind: 'sleep', date: TODAY }), TODAY).sel, '.sleepcard');
  assert.equal(placeOf(/** @type {any} */ ({ kind: 'weight', date: TODAY }), TODAY).route, 'progress/body');
  assert.ok(stopMs('quick', false) >= 1500 && stopMs('quick', false) <= 1700, '~1.6 s per stop (1.4.0)');
  assert.ok(stopMs('full', true) < 500, 'reduced motion: short');
});

/** n days of data ending today with a pattern. */
function data(n, f) {
  const days = [],
    food = [],
    sessions = [];
  for (let i = 0; i < n; i++) {
    const d = back(i),
      r = f(i);
    days.push({ id: d, steps: r.steps, energy: r.energy, mood: r.mood, sleepH: r.sleep });
    if (r.water != null) food.push({ id: `water_${d}`, type: 'water', date: d, glasses: r.water });
    if (r.kcal) food.push({ id: `f${i}`, date: d, kcal: r.kcal, p: 50, fib: 10 });
    if (r.workout) sessions.push({ id: `s${i}`, endedAt: new Date(`${d}T18:00`).getTime(), volume: 1000 });
  }
  return { days, food, sessions };
}

test('trends: daily rows, weekly series, workouts per week and goal days', () => {
  const d = data(21, (i) => ({ steps: i % 2 ? 9000 : 3000, water: 6, kcal: 1500, sleep: 7, workout: i % 7 === 0 }));
  const rows = dailyRows(d, 7, TODAY);
  assert.equal(rows.length, 7);
  assert.equal(rows[6].day, TODAY);
  assert.equal(rows[6].steps, 3000);
  assert.equal(rows[6].water, 6);
  assert.equal(rows[6].kcal, 1500);
  assert.equal(rows[6].protein, 50);
  assert.equal(rows[6].sleep, 7);
  assert.equal(rows[6].workout, true);
  assert.equal(rows[5].salt, null, 'unknown salt stays unknown');
  const wk = series(dailyRows(d, 21, TODAY), 'steps', true);
  assert.ok(wk.length >= 3 && wk.length <= 4);
  assert.ok(wk.every((p) => p.y == null || (p.y >= 3000 && p.y <= 9000)));
  const w = weeklyWorkouts(d.sessions, 4, TODAY);
  assert.equal(w.length, 4);
  assert.equal(
    w.reduce((a, x) => a + x.n, 0),
    d.sessions.filter((s) => s.endedAt >= parseDay(w[0].x).getTime()).length,
  );
  assert.ok(w.every((x) => x.vol === x.n * 1000));
  assert.deepEqual(goalDays(rows, 8000), { hit: 3, best: 1 });
});

test('insights: nothing before 14 days, then only clear differences with 5+ days per group', () => {
  const pattern = (i) => ({ sleep: i % 2 ? 8 : 5.5, energy: i % 2 ? 4 : 2.5, mood: 3, steps: 5000, water: 5 });
  assert.deepEqual(insights(dailyRows(data(MIN_DAYS - 1, pattern), 90, TODAY), { stepGoal: 8000 }), []);
  const found = insights(dailyRows(data(20, pattern), 90, TODAY), { stepGoal: 8000 });
  assert.equal(found.length, 1, 'mood is flat and no step-goal days: only sleep vs energy');
  assert.equal(found[0].id, 'sleepEnergy');
  assert.equal(found[0].a, 4);
  assert.equal(found[0].b, 2.5);
  assert.equal(found[0].up, true);
  const tiny = (i) => ({ sleep: i % 2 ? 8 : 5.5, energy: i % 2 ? 3.2 : 3, mood: 3 });
  assert.deepEqual(insights(dailyRows(data(20, tiny), 90, TODAY), { stepGoal: 8000 }), [], 'difference too small');
  const few = (i) => ({ sleep: i < 3 ? 5 : 8, energy: i < 3 ? 1 : 5, mood: 3 });
  assert.deepEqual(insights(dailyRows(data(20, few), 90, TODAY), { stepGoal: 8000 }), [], 'only 3 short nights');
  const many = (i) => ({
    sleep: i % 2 ? 8 : 6,
    energy: i % 2 ? 5 : 2,
    mood: i % 3 ? 2 : 4.5,
    workout: i % 3 === 0,
    steps: i % 2 ? 10000 : 2000,
    water: i % 2 ? 9 : 4,
  });
  const two = insights(dailyRows(data(30, many), 90, TODAY), { stepGoal: 8000 });
  assert.equal(two.length, 2, 'at most two cards');
  assert.ok(two[0].score >= two[1].score);
});

test('insight texts are gender-aware in Bulgarian', async () => {
  await setLang('bg');
  setGender('f');
  assert.equal(
    t('insight.sleepEnergy', { a: '4', b: '2,5' }),
    'В дни с 7+ часа сън енергията ти е средно 4/5, а при по-малко сън – 2,5/5.',
  );
  assert.match(t('insight.sleepEnergyUp'), /енергична/);
  setGender('m');
  assert.match(t('insight.sleepEnergyUp'), /енергичен/);
  assert.equal(t('voice.savedMany', { n: 5 }), 'Записах 5 неща');
  setGender('f');
  await setLang('en');
});

test('food share: only name, per-100 g values and language', () => {
  const p = foodPayload(
    /** @type {any} */ ({
      id: 'custom_1',
      name: '  Домашна  баница ',
      kcal: 290.4,
      p: 9.04,
      c: 30,
      f: 15,
      salt: 1.234,
      grams: 200,
      barcode: '123',
    }),
    'bg',
  );
  assert.deepEqual(p, {
    name: 'Домашна баница',
    kcal: 290,
    protein: 9,
    carbs: 30,
    fat: 15,
    fiber: null,
    salt: 1.23,
    lang: 'bg',
  });
  assert.equal(foodPayload(/** @type {any} */ ({ name: '', kcal: 1 }), 'bg'), null);
  assert.equal(foodPayload(/** @type {any} */ ({ name: 'x', kcal: Number.NaN }), 'en'), null);
  assert.equal(foodPayload(/** @type {any} */ ({ name: 'x'.repeat(200), kcal: 1 }), 'de')?.name.length, 80);
});

test('screenshots fit 1080 px without upscaling; feedback body is capped', () => {
  assert.deepEqual(fitSize(1290, 2796), { w: 498, h: IMG_SIDE });
  assert.deepEqual(fitSize(800, 600), { w: 800, h: 600 });
  const b = feedbackBody(`  ${'a'.repeat(2500)}`, Array(5).fill({ mime: 'image/jpeg', b64: 'AA==' }), '1.3.4', 'bg');
  assert.equal(b.text.length, 2000);
  assert.equal(b.images.length, MAX_IMAGES);
  assert.deepEqual(Object.keys(b).sort(), ['images', 'lang', 'text', 'version']);
});
