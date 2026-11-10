// 1.4.3 fixes after the Part A/B beta: a breakfast saved before the sleep sheet counts for the
// protein quest, the add page of a switched-off meal, XP after a settings change, the same
// kcal in the add and the edit sheet, and the daily goals in the order of the day.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, get, kv, put, remove, setKv } from '../../src/core/store.js';
import { dayKey } from '../../src/core/dates.js';
import { setSettings } from '../../src/core/settings.js';
import { setLang } from '../../src/core/i18n.js';
import { at, proteinQuest } from '../../src/features/daily/logic.js';
import { addMealRedirect, portion, scaleRow } from '../../src/features/food/logic.js';
import { FOODS } from '../../src/features/food/api.js';
import { quests } from '../../src/features/motivation/api.js';
import { startRewards, syncRewards } from '../../src/features/motivation/rewards.js';
import '../../src/features/motivation/quests.js';
import '../../src/features/steps/index.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
await setLang('bg');
await import('../../src/features/daily/api.js');
await import('../../src/features/daily/index.js');
const { setDaySleepTimes } = await import('../../src/features/day/api.js');

const D = '2026-11-04';
const realNow = Date.now;
const atClock = (/** @type {string} */ time, /** @type {(now: number) => any} */ fn) => {
  const now = at(D, time);
  Date.now = () => now;
  try {
    return fn(now);
  } finally {
    Date.now = realNow;
  }
};
const clearAll = () => {
  for (const st of ['food', 'sessions', 'measurements', 'photos', 'days']) all(st).forEach((r) => remove(st, r.id));
  setKv('xp', {});
  setKv('settings', {});
};
const breakfastAt = (/** @type {string} */ hm) =>
  put('food', {
    id: `bf_${hm}`,
    date: D,
    meal: 'breakfast',
    ts: at(D, hm),
    time: hm,
    name: 'x',
    grams: 100,
    kcal: 150,
    p: 30,
    c: 1,
    f: 2,
  });

/** Breakfast saved at `ate`, then the sleep sheet (bed 23:30, wake) filled in at `now`. */
const breakfastThenSleep = (/** @type {string} */ ate, /** @type {string} */ wake, /** @type {string} */ now) => {
  clearAll();
  setSettings({ daily: { protein: true } });
  breakfastAt(ate);
  return atClock(now, (t) => {
    setDaySleepTimes(D, { bed: '23:30', wake });
    return proteinQuest(get('days', D), t);
  });
};

test('a breakfast saved before the wake-up was entered counts for the protein quest (graded)', () => {
  // window 07:00–07:30: eaten 07:20 → on time, 15 XP
  let q = breakfastThenSleep('07:20', '07:00', '08:30');
  assert.deepEqual(q, { state: 'done', delayMin: 0, xp: 15 });
  const r = get('days', D);
  assert.equal(r.proteinStart, at(D, '07:00'));
  assert.equal(r.mealTimes.breakfast.actual, at(D, '07:20'), 'graded by when it was eaten');
  assert.equal(r.proteinAteAt, null);
  // eaten 07:45 → 15 min after the window: 8 XP with „+15 мин“
  q = breakfastThenSleep('07:45', '07:00', '08:30');
  assert.deepEqual(q, { state: 'late', delayMin: 15, xp: 8 });
  // eaten 08:45 → 75 min after the window: missed („пропуснато“, 0)
  q = breakfastThenSleep('08:45', '07:00', '09:00');
  assert.equal(q.state, 'missed');
  assert.equal(q.xp, 0);
  // a breakfast entered before the typed wake-up counts from the start (on time)
  q = breakfastThenSleep('06:50', '07:00', '08:00');
  assert.equal(q.state, 'done');
});

test('the latest breakfast of today is the one graded; nothing without the protein breakfast', () => {
  clearAll();
  setSettings({ daily: { protein: true } });
  breakfastAt('07:10');
  breakfastAt('07:50');
  const q = atClock(
    '08:30',
    (t) => (setDaySleepTimes(D, { bed: '23:30', wake: '07:00' }), proteinQuest(get('days', D), t)),
  );
  assert.deepEqual(q, { state: 'late', delayMin: 20, xp: 8 });
  // protein breakfast off in Profile: a breakfast is just a breakfast
  clearAll();
  setSettings({ daily: { protein: true }, proteinBreakfast: false });
  breakfastAt('07:20');
  atClock('08:30', () => setDaySleepTimes(D, { bed: '23:30', wake: '07:00' }));
  assert.equal(get('days', D).proteinAt, undefined);
  // no breakfast yet: the countdown just starts (overdue), as before
  clearAll();
  setSettings({ daily: { protein: true } });
  atClock('07:10', () => setDaySleepTimes(D, { bed: '23:30', wake: '07:00' }));
  assert.equal(get('days', D).proteinStart, at(D, '07:00'));
  assert.equal(get('days', D).proteinAt, undefined);
  clearAll();
});

test('the add page of a switched-off meal opens the meal of this time instead', () => {
  const on = ['snack_am', 'lunch', 'snack', 'dinner'];
  const nine = new Date(2026, 10, 10, 10, 30);
  assert.equal(addMealRedirect('breakfast', on, false, nine), 'snack_am');
  assert.equal(addMealRedirect('breakfast', ['lunch', 'snack', 'dinner'], false, new Date(2026, 10, 10, 13)), 'lunch');
  assert.equal(addMealRedirect('lunch', on, false, nine), null, 'a meal in use stays');
  assert.equal(addMealRedirect('breakfast', on, true, nine), null, 'a hidden meal with entries that day stays');
  assert.equal(addMealRedirect('nope', on, true, nine), 'snack_am', 'an unknown meal never stays');
  const src = (/** @type {string} */ f) => import('node:fs').then((fs) => fs.readFileSync(f, 'utf8'));
  return src('src/features/food/views/add.js').then((js) => {
    assert.match(js, /addMealRedirect\(\s*meal,\s*enabledMeals\(\)/);
    assert.match(js, /navigate\(`food\/add\/\$\{other\}/);
    assert.match(js, /\{ replace: true \}/);
  });
});

test('a changed goal or meal switch re-checks the XP without another data change', async () => {
  clearAll();
  const wait = () => new Promise((r) => setTimeout(r, 120));
  startRewards();
  await wait();
  const id = `quest:${dayKey()}:water`;
  put('food', { id: `water_${dayKey()}`, type: 'water', date: dayKey(), glasses: 3 });
  await wait();
  assert.equal(kv('xp', {})[id], undefined, '3 of 8 glasses');
  setSettings({ waterGoal: 3 }); // only the setting changes
  await wait();
  assert.equal(kv('xp', {})[id]?.amt, 10, 'paid at once');
  setSettings({ waterGoal: 8 });
  await wait();
  assert.equal(kv('xp', {})[id], undefined, 'a quest no longer done gives its XP back');
  // a meal switched back on with an entry today: paid once, never twice
  setSettings({ meals: { breakfast: true, snack_am: false, lunch: true, snack: true, dinner: true } });
  put('food', {
    id: 'am1',
    date: dayKey(),
    meal: 'snack_am',
    ts: Date.now(),
    time: '10:00',
    name: 'x',
    grams: 100,
    kcal: 100,
    p: 1,
  });
  await wait();
  const am = `quest:${dayKey()}:meal_snack_am`;
  assert.equal(kv('xp', {})[am], undefined, 'switched off: no quest');
  setSettings({ meals: { breakfast: true, snack_am: true, lunch: true, snack: true, dinner: true } });
  await wait();
  assert.equal(kv('xp', {})[am]?.amt, 5);
  setSettings({ meals: { breakfast: true, snack_am: false, lunch: true, snack: true, dinner: true } });
  await wait();
  assert.equal(kv('xp', {})[am]?.amt, 5, 'hidden quests are never touched');
  setSettings({ meals: { breakfast: true, snack_am: true, lunch: true, snack: true, dinner: true } });
  await wait();
  const paid = Object.keys(kv('xp', {})).filter((k) => k.endsWith(':meal_snack_am'));
  assert.deepEqual(paid, [am], 'no double pay');
  clearAll();
});

test('the edit sheet shows the same kcal as the add sheet (catalog per 100 g)', () => {
  const chicken = /** @type {any} */ (FOODS.find((f) => f.id === 'chicken_breast'));
  assert.equal(chicken.kcal, 165);
  const row = { id: 'r', foodId: 'chicken_breast', grams: 150, ...portion(chicken, 150) };
  assert.equal(row.kcal, 248);
  assert.equal(portion(chicken, 160).kcal, 264, 'add 160 g');
  assert.equal(scaleRow(row, 160, chicken).kcal, 264, 'edit 150 → 160 g: same as adding');
  assert.equal(scaleRow(row, 160).kcal, 265, 'without the food: scaled from the row as before');
  const e = scaleRow(row, 160, chicken);
  assert.deepEqual([e.p, e.c, e.f], [portion(chicken, 160).p, portion(chicken, 160).c, portion(chicken, 160).f]);
  assert.equal(e.id, 'r');
  assert.equal(e.grams, 160);
  // unknown fiber stays unknown even if the food lists it later; a voice row has no food
  const voice = { grams: 200, kcal: 300, p: 10, c: 40, f: 8 };
  assert.deepEqual(scaleRow(voice, 100, null), { grams: 100, kcal: 150, p: 5, c: 20, f: 4 });
  const { fib: _fib, ...noFib } = row;
  assert.equal('fib' in scaleRow(noFib, 160, { ...chicken, fib: 1 }), false);
});

test('daily goals in the order of the day: meals, protein, workout, water, steps', () => {
  clearAll();
  setSettings({
    daily: { protein: true },
    meals: { breakfast: true, snack_am: true, lunch: true, snack: true, dinner: true },
  });
  assert.deepEqual(
    quests('daily').map((q) => q.id),
    [
      'meal_breakfast',
      'protein',
      'meal_snack_am',
      'meal_lunch',
      'meal_snack',
      'meal_dinner',
      'proteinGoal',
      'workout',
      'water',
      'steps',
    ],
  );
  // switched-off items are skipped; breakfast off also hides the protein quest
  setSettings({ meals: { breakfast: false, snack_am: false, lunch: true, snack: true, dinner: true } });
  assert.deepEqual(
    quests('daily').map((q) => q.id),
    ['meal_lunch', 'meal_snack', 'meal_dinner', 'proteinGoal', 'workout', 'water', 'steps'],
  );
  // the protein breakfast choice is kept and comes back with breakfast
  setSettings({ meals: { breakfast: true, snack_am: false, lunch: true, snack: true, dinner: true } });
  assert.ok(quests('daily').some((q) => q.id === 'protein'));
  syncRewards();
  clearAll();
});
