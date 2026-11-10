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
