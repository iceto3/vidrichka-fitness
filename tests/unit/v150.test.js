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

// ---- part 2 ----
/** Today (real): the add path uses the real date for „today“; the clock is mocked. */
const P2 = (() => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
})();
const p2at = (/** @type {string} */ hm, d = P2) => new Date(`${d}T${hm}:00`).getTime();
const withClock = (/** @type {string} */ hm, /** @type {(now: number) => any} */ fn) => {
  const real = Date.now,
    now = p2at(hm);
  Date.now = () => now;
  try {
    return fn(now);
  } finally {
    Date.now = real;
  }
};
const p2 = async () => {
  globalThis.addEventListener ??= () => {};
  globalThis.removeEventListener ??= () => {};
  const store = await import('../../src/core/store.js');
  const { setLang } = await import('../../src/core/i18n.js');
  await setLang('bg');
  const { setSettings } = await import('../../src/core/settings.js');
  const food = await import('../../src/features/food/api.js');
  const daily = await import('../../src/features/daily/api.js');
  await import('../../src/features/daily/index.js');
  const { syncRewards } = await import('../../src/features/motivation/rewards.js');
  await import('../../src/features/motivation/quests.js');
  const clear = () => {
    for (const st of ['food', 'days']) store.all(st).forEach((r) => store.remove(st, r.id));
    store.setKv('xp', {});
    setSettings({ daily: { protein: true } });
  };
  const egg = { id: 'egg', name: 'Яйце', emoji: '🥚', kcal: 155, p: 13, c: 1, f: 11, cat: 'protein' };
  return { ...store, food, daily, syncRewards, clear, egg };
};

test('2a: one time per meal – a new entry takes the meal’s time; moving any entry moves the meal', async () => {
  const { food, daily, get, all, put, clear, egg } = await p2();
  const { mealTimeOf } = await import('../../src/features/food/logic.js');
  clear();
  put('days', { id: P2, wake: p2at('07:00') });
  food.view.date = P2;
  const a = withClock('12:40', () => food.logFood(egg, 100, 'lunch', P2));
  const b = withClock('13:30', () => food.logFood(egg, 50, 'lunch', P2));
  assert.equal(b.ts, a.ts, 'the second entry takes the meal’s time');
  assert.equal(b.time, '12:40');
  assert.equal(mealTimeOf(all('food'), P2, 'lunch'), p2at('12:40'));
  assert.equal(mealTimeOf(all('food'), P2, 'dinner'), null);
  // an explicit clock time wins for the new entry (the view then moves the meal)
  const c = withClock('13:30', () => food.logFood(egg, 50, 'lunch', P2, p2at('13:10')));
  assert.equal(c.time, '13:10');
  // the item editor's „Час“ on any entry moves the whole meal (lunch, snack, dinner…)
  const r = withClock('14:00', (now) => daily.setFoodTime(b.id, '12:15', now));
  assert.equal(r.ok, true);
  assert.deepEqual(
    all('food')
      .filter((x) => x.meal === 'lunch')
      .map((x) => x.time),
    ['12:15', '12:15', '12:15'],
  );
  assert.deepEqual(
    withClock('14:00', (now) => daily.setMealClock(P2, 'lunch', '06:55', now)),
    {
      ok: false,
      err: 'early',
    },
  );
  // moved into another meal → it takes that meal's time
  const d = withClock('19:30', () => food.logFood(egg, 80, 'dinner', P2));
  withClock('19:40', () => food.editRow(a.id, { meal: 'dinner' }));
  assert.equal(get('food', a.id).time, d.time);
  // a saved combination logged into a meal takes the meal's time too
  put('meals', {
    id: 'm1',
    name: 'Обяд',
    items: [{ name: 'Ориз', grams: 100, kcal: 130, p: 3, c: 28, f: 0 }],
  });
  const res = withClock('20:30', () => food.logSavedMeal('m1', 'dinner'));
  assert.equal(res?.rows[0].time, '19:30');
});

test('2a: breakfast re-grades through the „Кога яде?“ save – no double XP', async () => {
  const { food, daily, kv, all, put, clear, egg, syncRewards } = await p2();
  clear();
  put('days', { id: P2, wake: p2at('07:00'), proteinStart: p2at('07:00') });
  food.view.date = P2;
  const row = withClock('08:20', (now) => {
    const x = food.logFood(egg, 150, 'breakfast', P2);
    daily.proteinLogged(x, now);
    daily.setMealActual(null, now);
    syncRewards();
    return x;
  });
  const xp = () => kv('xp', {})[`quest:${P2}:protein`]?.amt ?? 0;
  assert.equal(xp(), 0, '50 min after the window: missed');
  withClock('08:25', () => food.logFood(egg, 50, 'breakfast', P2));
  const r = withClock('09:00', (now) => daily.setFoodTime(row.id, '07:20', now));
  assert.equal(r.ok && r.graded, true);
  withClock('09:00', () => syncRewards());
  assert.equal(xp(), 15);
  assert.deepEqual(
    all('food').map((x) => x.time),
    ['07:20', '07:20'],
  );
  withClock('09:05', () => syncRewards());
  assert.equal(xp(), 15, 'not paid twice');
});

test('2b: a breakfast saved with an earlier clock time is graded by it – no „Кога яде?“', async () => {
  const { food, daily, get, put, clear, egg, kv, syncRewards } = await p2();
  const { on } = await import('../../src/core/bus.js');
  let asks = 0;
  on('meal:whenAte', () => asks++);
  /** @type {any[]} */
  const graded = [];
  on('protein:graded', (q) => graded.push(q));
  clear();
  put('days', { id: P2, wake: p2at('07:00'), proteinStart: p2at('07:00') }); // window 07:00–07:30
  food.view.date = P2;
  withClock('08:30', (now) => {
    const x = food.logFood(egg, 150, 'breakfast', P2, p2at('07:20')); // the clock set to 07:20
    daily.proteinLogged(x, now);
    syncRewards();
  });
  assert.equal(asks, 0, 'the time was given on the clock');
  assert.equal(get('days', P2).mealTimes.breakfast.actual, p2at('07:20'));
  assert.equal(graded.at(-1)?.state, 'done');
  assert.equal(kv('xp', {})[`quest:${P2}:protein`]?.amt, 15);
  // the clock left at now (late) → „Кога яде?“ as in 1.4.4
  clear();
  put('days', { id: P2, wake: p2at('07:00'), proteinStart: p2at('07:00') });
  withClock('08:30', (now) => {
    const x = food.logFood(egg, 150, 'breakfast', P2, now);
    daily.proteinLogged(x, now);
  });
  assert.equal(asks, 1, 'asked once');
  // the clock: never in the future, never before the wake-up
  assert.deepEqual(
    withClock('08:30', (now) => daily.checkFoodTime(P2, '08:35', now)),
    { ok: false, err: 'future' },
  );
  assert.deepEqual(
    withClock('08:30', (now) => daily.checkFoodTime(P2, '06:55', now)),
    { ok: false, err: 'early' },
  );
  assert.equal(daily.foodTimeFloor(P2), '07:00');
});

test('2c: unplanned meals – named by their place in the day, listed by time, no XP / goals', async () => {
  const { extraKind, isExtra, mealsWithExtras, newExtraId, mealStyle } =
    await import('../../src/features/food/logic.js');
  const { computeStats } = await import('../../src/features/motivation/stats.js');
  const D = '2026-11-20';
  const ts = (/** @type {string} */ hm) => new Date(`${D}T${hm}`).getTime();
  const row = (/** @type {string} */ meal, /** @type {string} */ hm, p = 10) => ({
    id: `${meal}${hm}`,
    date: D,
    meal,
    ts: ts(hm),
    time: hm,
    kcal: 100,
    p,
  });
  assert.equal(isExtra('x_abc'), true);
  assert.equal(isExtra('snack'), false);
  assert.match(newExtraId(1_700_000_000_000), /^x_[0-9a-z]+$/);
  assert.deepEqual(mealStyle('x_1'), ['🍽️', '#F1ECE4']);
  // usual times 08:00 / 13:00 / 19:00
  assert.equal(extraKind(ts('07:30'), D, []), 'extra', 'before breakfast');
  assert.equal(extraKind(ts('10:30'), D, []), 'extraAm');
  assert.equal(extraKind(ts('15:00'), D, []), 'extraPm');
  assert.equal(extraKind(ts('21:00'), D, []), 'extra', 'after dinner');
  // the logged times count: lunch at 11:30 → 12:00 is already „следобедно“
  const rows = [row('breakfast', '07:00'), row('lunch', '11:30'), row('dinner', '18:00')];
  assert.equal(extraKind(ts('12:00'), D, rows), 'extraPm');
  assert.equal(extraKind(ts('18:30'), D, rows), 'extra');
  assert.equal(extraKind(ts('06:30'), D, rows), 'extra');
  // listed chronologically among the planned meals
  const day = [...rows, row('x_a', '10:00'), row('x_b', '21:30'), row('x_c', '15:00')];
  assert.deepEqual(mealsWithExtras(['breakfast', 'lunch', 'snack', 'dinner'], day, D), [
    'breakfast',
    'x_a',
    'lunch',
    'x_c',
    'snack',
    'dinner',
    'x_b',
  ]);
  assert.deepEqual(mealsWithExtras(['breakfast', 'lunch'], [], D), ['breakfast', 'lunch'], 'old data as before');
  // no XP, no goals: not a meal of the day, not a food day, not in the protein goal
  const stats = computeStats({
    sessions: [],
    food: [row('x_a', '10:00', 40)],
    measurements: [],
    photos: [],
    goalAt: () => 3,
    waterGoal: 8,
    proteinGoal: 100,
    now: new Date(`${D}T12:00`),
  });
  assert.equal(stats.todayMeals.size, 0, 'no meal quest');
  assert.equal(stats.todayProtein, 40, 'its protein counts for the protein goal');
  assert.equal(stats.food.current ?? 0, 0, 'not a food-streak day');
});

test('2c: protein from an unplanned meal completes the protein goal (the goal’s own 15 XP)', async () => {
  const { computeStats } = await import('../../src/features/motivation/stats.js');
  const { QUESTS, QUEST_XP } = await import('../../src/features/motivation/quests.js');
  const D = '2026-11-20';
  const r = (/** @type {string} */ meal, /** @type {number} */ p) => ({ date: D, meal, ts: 1, p, kcal: 100 });
  const s = (/** @type {any[]} */ food) =>
    computeStats({
      sessions: [],
      food,
      measurements: [],
      photos: [],
      goalAt: () => 3,
      waterGoal: 8,
      proteinGoal: 100,
      now: new Date(`${D}T20:00`),
    });
  const goal = /** @type {any} */ (QUESTS.find((q) => q.id === 'proteinGoal'));
  const planned = s([r('lunch', 90)]);
  assert.equal(goal.done(planned), false);
  const both = s([r('lunch', 90), r('x_a', 20)]);
  assert.equal(both.todayProtein, 110, '90 g planned + 20 g unplanned');
  assert.deepEqual(goal.detail(both), { n: 110, goal: 100 });
  assert.equal(goal.done(both), true);
  assert.equal(goal.xp, QUEST_XP.proteinGoal);
  assert.deepEqual([...both.todayMeals], ['lunch'], 'no meal quest for the unplanned meal');
  const meal = /** @type {any} */ (QUESTS.find((q) => q.id === 'meal_snack_am'));
  assert.equal(meal.done(s([r('x_a', 20)])), false);
});

test('2c: the name follows the time; the day totals include unplanned meals', async () => {
  const { food, put, clear } = await p2();
  const { totals } = await import('../../src/features/food/logic.js');
  clear();
  put('food', { id: 'e1', date: P2, meal: 'x_q', ts: p2at('10:20'), time: '10:20', kcal: 200, p: 20, c: 0, f: 0 });
  put('food', { id: 'l1', date: P2, meal: 'lunch', ts: p2at('13:00'), time: '13:00', kcal: 500, p: 30, c: 0, f: 0 });
  assert.equal(food.mealName('x_q', P2), 'Междинно сутрешно');
  assert.equal(food.mealName('x_q', P2, p2at('16:00')), 'Междинно следобедно');
  assert.equal(food.mealName('x_q', P2, p2at('22:00')), 'Допълнително хранене');
  assert.equal(food.mealName('lunch', P2), 'Обяд');
  assert.equal(totals(food.dayRows(P2)).kcal, 700);
});

test("1.5.0: version, What's new (bg + en), no English in Bulgarian", async () => {
  const { readFileSync } = await import('node:fs');
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  const bg = (await import('../../src/data/i18n/bg.js')).default;
  const en = (await import('../../src/data/i18n/en.js')).default;
  // the version itself is checked by the newest release's test (1.6.0: v160.test.js)
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.5\.0\]/);
  const rel = NOTES.find((r) => r.v === '1.5.0');
  assert.equal(rel?.items.length, 4);
  const keys = [
    ...(rel?.items ?? []).map(([, k]) => k),
    'meal.extraAm',
    'meal.extraPm',
    'meal.extra',
    'food.addMeal',
    'food.addMealHint',
    'food.mealTime',
    'food.timeMeal',
    'steps.slider',
    'steps.n',
    'steps.minus',
    'steps.plus',
  ];
  for (const k of keys) {
    assert.ok(bg[k] && en[k], k);
    assert.doesNotMatch(String(bg[k]).replace(/\{\w+\}|XP/g, ''), /[A-Za-z]/, `English in bg ${k}`);
  }
  assert.equal(bg['meal.extraAm'], 'Междинно сутрешно');
  assert.equal(bg['meal.extraPm'], 'Междинно следобедно');
  assert.equal(bg['meal.extra'], 'Допълнително хранене');
});

test('2c: rewards pay the protein goal’s XP when an unplanned meal completes it – once', async () => {
  const { put, kv, clear, syncRewards } = await p2();
  const { setSettings } = await import('../../src/core/settings.js');
  clear();
  setSettings({ daily: { protein: true }, proteinGoal: 100 });
  put('food', { id: 'pl', date: P2, meal: 'lunch', ts: p2at('12:00'), time: '12:00', kcal: 400, p: 90, c: 0, f: 0 });
  withClock('15:00', () => syncRewards());
  const amt = () => kv('xp', {})[`quest:${P2}:proteinGoal`]?.amt ?? 0;
  assert.equal(amt(), 0, '90/100 g');
  put('food', { id: 'ex', date: P2, meal: 'x_q', ts: p2at('16:00'), time: '16:00', kcal: 150, p: 20, c: 0, f: 0 });
  withClock('16:05', () => syncRewards());
  assert.equal(amt(), 15, 'goal completed by the unplanned meal: the goal’s normal XP');
  withClock('16:10', () => syncRewards());
  assert.equal(amt(), 15, 'not paid twice');
  assert.equal(Object.keys(kv('xp', {})).filter((k) => k.includes('x_')).length, 0, 'nothing for the meal itself');
});
