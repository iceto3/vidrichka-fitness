// 1.4.3 part B: B1 meals per day (five meals, switches, enabled-only picking).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setKv } from '../../src/core/store.js'; // (more store helpers below)
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
  // 1.5.0 1b: before lunch with no breakfast → the next meal (was the last one)
  assert.equal(mealFor(at(8), ['lunch', 'dinner']), 'lunch', 'before lunch with no breakfast: next meal');
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

// ---------------------------------------------------------------- B2: partial workouts
import { XP, partialShare, xpForWorkout } from '../../src/features/motivation/xp.js';
import { activeSet, canResume } from '../../src/features/workouts/logic.js';
import { get, kv, put } from '../../src/core/store.js';
import { activeWorkout, resumable, resumableToday, seedPlans, startWorkout } from '../../src/features/workouts/api.js';
import { finish, resumeSession, toggleDone } from '../../src/features/workouts/session.js';
import { computeStats } from '../../src/features/motivation/stats.js';
import { QUESTS } from '../../src/features/motivation/quests.js';
import { dayKey } from '../../src/core/dates.js';

test('B2: partial XP = done share of 50 + 2/set + full PR XP', () => {
  assert.equal(partialShare(6, 15), 20);
  assert.equal(partialShare(1, 17), 3);
  assert.equal(partialShare(0, 10), 0);
  assert.equal(partialShare(20, 10), 50, 'never more than the bonus');
  assert.equal(xpForWorkout({ setsDone: 6, setsPlanned: 15, prs: 1, partial: true }), 20 + 6 * XP.perSet + XP.pr);
  assert.equal(xpForWorkout({ setsDone: 10, setsPlanned: 15, prs: 0 }), 50 + 20, 'full unchanged');
  assert.equal(xpForWorkout({ setsDone: 0, setsPlanned: 15, prs: 0, partial: true }), 0);
});

test('B2: a resumed workout starts at its first unfinished set; only today, only partial', () => {
  const S = (/** @type {boolean} */ done, /** @type {number} */ at = 0) => ({
    w: 10,
    r: 10,
    done,
    doneAt: done ? at : undefined,
  });
  const items = /** @type {any} */ ([
    { exId: 'a', rest: 60, target: { reps: 10, weight: 10 }, sets: [S(true, 100), S(true, 200), S(false)] },
    { exId: 'b', rest: 60, target: { reps: 10, weight: 10 }, sets: [S(true, 300), S(false), S(false)] },
  ]);
  assert.deepEqual(activeSet(items), [1, 1], 'running: after the last done set');
  assert.deepEqual(activeSet(items, 1000), [0, 2], 'resumed: first unfinished set');
  const d = (/** @type {number} */ ts) => dayKey(new Date(ts)),
    now = Date.now(),
    today = dayKey();
  assert.equal(canResume({ partial: true, endedAt: now }, today, d), true);
  assert.equal(canResume({ partial: true, endedAt: now }, today, d, true), false, 'a workout is running');
  assert.equal(canResume({ partial: true, endedAt: now - 2 * 864e5 }, today, d), false, 'next day: stays partial');
  assert.equal(canResume({ endedAt: now }, today, d), false, 'full');
});

test('B2: partial → finish with Vidrichka → full; XP corrected once, quest gets the rest', () => {
  setKv('xp', {});
  seedPlans();
  const w = startWorkout('plan_leg_day');
  const planned = w.items.reduce((/** @type {number} */ a, /** @type {any} */ it) => a + it.sets.length, 0);
  for (let j = 0; j < 3; j++) toggleDone(0, j);
  toggleDone(1, 0);
  const p = finish();
  assert.equal(p.partial, true);
  assert.equal(p.setsDone, 4);
  assert.equal(p.xp, partialShare(4, planned) + 4 * XP.perSet + XP.pr * p.prs.length);
  assert.equal(kv('xp', {})[`session:${p.id}`].amt, p.xp);
  assert.equal(resumable(p), true);
  assert.equal(resumableToday()?.id, p.id);
  // the quest: ticked „непълна“ with the same share
  const workoutQ = /** @type {any} */ (QUESTS.find((q) => q.id === 'workout'));
  const st0 = computeStats({
    sessions: [get('sessions', p.id)],
    food: [],
    measurements: [],
    photos: [],
    goalAt: () => 3,
    waterGoal: 8,
  });
  assert.deepEqual(workoutQ.state(st0), { done: true, xp: partialShare(4, planned), note: 'quest.partialNote' });
  // resume
  assert.equal(resumeSession(p.id), true);
  assert.equal(resumeSession(p.id), false, 'already running');
  const a = activeWorkout();
  assert.equal(a.id, p.id);
  assert.deepEqual(activeSet(a.items, a.resumed.at), [1, 1], 'first unfinished set');
  for (let i = 1; i < a.items.length; i++)
    for (let j = 0; j < a.items[i].sets.length; j++) if (!a.items[i].sets[j].done) toggleDone(i, j);
  const f = finish();
  assert.equal(f.id, p.id, 'same session, replaced');
  assert.equal(f.partial, undefined);
  assert.equal(f.startedAt, p.startedAt, 'keeps the first start');
  assert.equal(f.xp, XP.workout + planned * XP.perSet + XP.pr * f.prs.length);
  assert.equal(kv('xp', {})[`session:${p.id}`].amt, f.xp, 'corrected, not added');
  assert.equal(Object.keys(kv('xp', {})).filter((k) => k.startsWith('session:')).length, 1);
  const st1 = computeStats({
    sessions: [get('sessions', p.id)],
    food: [],
    measurements: [],
    photos: [],
    goalAt: () => 3,
    waterGoal: 8,
  });
  assert.deepEqual(workoutQ.state(st1), { done: true, xp: XP.workout });
  assert.equal(resumable(f), false);
  // a partial from yesterday stays partial and can't be finished
  put('sessions', { ...p, id: 'old', endedAt: Date.now() - 864e5 * 1.5 });
  assert.equal(resumable(get('sessions', 'old')), false);
});

// ---------------------------------------------------------------- B3: daily and monthly goals
import { QUEST_SECTIONS, questKey, quests } from '../../src/features/motivation/api.js';
import { syncRewards } from '../../src/features/motivation/rewards.js';
import { all, remove } from '../../src/core/store.js';
import '../../src/features/daily/index.js';
import '../../src/features/steps/index.js';

const clearAll = () => {
  for (const st of ['food', 'sessions', 'measurements', 'photos', 'days']) all(st).forEach((r) => remove(st, r.id));
  setKv('xp', {});
  setKv('active', null);
  setKv('settings', {});
};
const meal = (/** @type {string} */ id, /** @type {string} */ m, p = 0) =>
  put('food', { id, date: dayKey(), meal: m, ts: Date.now(), time: '08:00', name: 'x', grams: 100, kcal: 100, p });

test('B3: sections – daily (resets each day) and monthly; a weekly one only needs an entry', () => {
  clearAll();
  assert.deepEqual(
    QUEST_SECTIONS.map((s) => s.id),
    ['daily', 'monthly'],
  );
  const s = { today: '2026-11-09', week: '2026-11-09', month: '2026-11' };
  assert.equal(questKey({ id: 'water' }, s), 'quest:2026-11-09:water');
  assert.equal(questKey({ id: 'measure', section: 'monthly' }, s), 'quest:2026-11:measure');
  assert.equal(questKey({ id: 'x', section: 'weekly' }, s), 'quest:2026-11-09:x');
  const daily = quests('daily').map((q) => q.id);
  for (const id of [
    'workout',
    'meal_breakfast',
    'meal_lunch',
    'meal_snack',
    'meal_dinner',
    'proteinGoal',
    'water',
    'steps',
  ])
    assert.ok(daily.includes(id), id);
  for (const id of ['breakfast', 'meals3', 'measure', 'meal_snack_am', 'photos4']) assert.ok(!daily.includes(id), id);
  assert.ok(daily.includes('protein'), 'protein within 30 min while the protein breakfast is on');
  assert.ok(daily.indexOf('meal_breakfast') < daily.indexOf('protein'));
  assert.ok(daily.indexOf('protein') < daily.indexOf('meal_lunch'));
  assert.ok(
    quests('monthly')
      .map((q) => q.id)
      .includes('measure'),
  );
});

test('B3: one quest per meal that is on; breakfast off also hides the protein quest', () => {
  clearAll();
  setSettings({ meals: { ...MEALS_ON, snack_am: true, breakfast: false } });
  const ids = quests('daily').map((q) => q.id);
  assert.ok(ids.includes('meal_snack_am'));
  assert.ok(!ids.includes('meal_breakfast'));
  assert.ok(!ids.includes('protein'));
  meal('f1', 'snack_am');
  assert.equal(quests('daily').find((q) => q.id === 'meal_snack_am')?.isDone, true);
  syncRewards();
  assert.equal(kv('xp', {})[`quest:${dayKey()}:meal_snack_am`]?.amt, 5);
  setKv('settings', {});
});

test('B3: the day’s protein goal fills from the food diary and ticks at the Profile goal', () => {
  clearAll();
  setSettings({ proteinGoal: 120 });
  meal('f1', 'breakfast', 30.4);
  meal('f2', 'lunch', 51.8);
  let q = quests('daily').find((x) => x.id === 'proteinGoal');
  assert.deepEqual(q?.vars, { n: 82, goal: 120 });
  assert.equal(q?.isDone, false);
  assert.equal(q?.bar, true);
  assert.equal(t('quest.proteinGoal'), 'Протеин за деня');
  meal('f3', 'dinner', 40);
  q = quests('daily').find((x) => x.id === 'proteinGoal');
  assert.equal(q?.isDone, true);
  syncRewards();
  assert.equal(kv('xp', {})[`quest:${dayKey()}:proteinGoal`]?.amt, 15);
  remove('food', 'f3');
  syncRewards();
  assert.equal(kv('xp', {})[`quest:${dayKey()}:proteinGoal`], undefined, 'given back when it drops below');
});

test('B3: monthly measurements stay until done this month; no double XP after the update', () => {
  clearAll();
  const month = dayKey().slice(0, 7);
  let m = quests('monthly').find((x) => x.id === 'measure');
  assert.equal(m?.isDone, false);
  put('measurements', { id: 'm1', date: `${month}-01`, waist: 70 });
  m = quests('monthly').find((x) => x.id === 'measure');
  assert.equal(m?.isDone, true, 'any day of the month');
  syncRewards();
  assert.equal(kv('xp', {})[`quest:${month}:measure`]?.amt, 30);
  // an old day-keyed measure / breakfast of this period counts as paid
  setKv('xp', {
    [`quest:${month}-01:measure`]: { amt: 15, ts: 1 },
    [`quest:${dayKey()}:breakfast`]: { amt: 10, ts: 1 },
  });
  meal('f1', 'breakfast');
  syncRewards();
  const l = kv('xp', {});
  assert.equal(l[`quest:${month}:measure`], undefined);
  assert.equal(l[`quest:${dayKey()}:meal_breakfast`], undefined);
  assert.equal(l[`quest:${month}-01:measure`]?.amt, 15, 'kept');
  assert.equal(l[`quest:${dayKey()}:breakfast`]?.amt, 10, 'kept');
  // a measurement from last month does not count
  clearAll();
  put('measurements', { id: 'm0', date: '2020-01-15', waist: 70 });
  assert.equal(quests('monthly').find((x) => x.id === 'measure')?.isDone, false);
});
