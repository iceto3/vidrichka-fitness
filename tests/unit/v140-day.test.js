// 1.4.0 day layer: validation, building a day from stored rows, past-day edits flowing into
// streaks / charts, screenshot rows, and the sleep streak counting manual entries.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, get, put } from '../../src/core/store.js';
import { addDays, dayKey, parseDay } from '../../src/core/dates.js';
import { buildDay, dayError, hasData, lastDays, shotRows } from '../../src/features/day/logic.js';
import { sleepStreak } from '../../src/features/daily/logic.js';
import { stepStreak } from '../../src/features/steps/logic.js';

// The write API pulls in feature modules that touch browser globals at import time.
globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
const { DayEditError, readDay, setDaySleep, setDaySteps, setDayWater, addDaySteps, clearDaySleep, rateDayField } =
  await import('../../src/features/day/api.js');
const { dailyRows } = await import('../../src/features/progress/trends.js');

const today = dayKey();
const back = (n) => dayKey(addDays(parseDay(today), -n));
const empty = { days: [], food: [], sessions: [] };

test('dayError: real, non-future, not ancient', () => {
  assert.equal(dayError('2026-10-20', '2026-10-28'), null);
  assert.equal(dayError('2026-10-28', '2026-10-28'), null);
  assert.equal(dayError('2026-10-29', '2026-10-28'), 'future');
  assert.equal(dayError('2026-02-30', '2026-10-28'), 'invalid');
  assert.equal(dayError('2026-1-5', '2026-10-28'), 'invalid');
  assert.equal(dayError(undefined, '2026-10-28'), 'invalid');
  assert.equal(dayError('2019-12-31', '2026-10-28'), 'tooOld');
});

test('an empty day is all zeros/nulls and has no data', () => {
  const d = buildDay(empty, '2026-10-20');
  assert.equal(d.steps, null);
  assert.equal(d.water, null);
  assert.equal(d.totals, null);
  assert.deepEqual(d.food, []);
  assert.deepEqual(d.workouts, []);
  assert.equal(hasData(d), false);
});

test('buildDay gathers steps, sleep, ratings, water, food totals and workouts of that date only', () => {
  const D = '2026-10-20';
  const data = {
    days: [{ id: D, steps: 8000, sleepH: 7, sleepQ: 4, mood: 3, energy: 5 }],
    food: [
      { id: 'w', type: 'water', date: D, glasses: 5 },
      { id: 'a', date: D, ts: 2, kcal: 100, p: 10, c: 5, f: 2, fib: 1, salt: 0.5 },
      { id: 'b', date: D, ts: 1, kcal: 50, p: 2, c: 8, f: 1, fib: 2 },
      { id: 'x', date: '2026-10-19', kcal: 999, p: 1, c: 1, f: 1 },
      { id: 'r', date: D, kcal: 999, p: 1, c: 1, f: 1, removed: true },
    ],
    sessions: [
      {
        id: 's1',
        name: 'A',
        endedAt: parseDay(D).getTime() + 10 * 3600e3,
        durationSec: 1800,
        volume: 1234.4,
        setsDone: 9,
        items: [{ sets: [{ done: true }] }, { sets: [{ done: false }] }],
      },
    ],
  };
  const d = buildDay(data, D);
  assert.equal(d.steps, 8000);
  assert.deepEqual([d.sleep.hours, d.sleep.q, d.sleep.manual], [7, 4, true]);
  assert.deepEqual([d.mood, d.energy, d.water], [3, 5, 5]);
  assert.deepEqual(
    d.food.map((r) => r.id),
    ['b', 'a'],
  );
  assert.deepEqual(d.totals, { kcal: 150, p: 12, c: 13, f: 3, fib: 3, salt: 0.5 });
  assert.equal(d.workouts.length, 1);
  assert.deepEqual([d.workouts[0].volume, d.workouts[0].exercises], [1234, 1]);
  assert.ok(hasData(d));
});

test('lastDays ends today, oldest first', () => {
  assert.deepEqual(lastDays(3, '2026-10-01'), ['2026-09-29', '2026-09-30', '2026-10-01']);
});

test('day api refuses future dates and bad values', () => {
  assert.throws(() => setDaySteps(back(-1), 100), DayEditError);
  assert.throws(
    () => setDaySleep(back(1), { hours: 30 }),
    (e) => e instanceof DayEditError && e.code === 'range',
  );
  assert.throws(
    () => setDayWater('nope', 2),
    (e) => e.code === 'invalid',
  );
  assert.throws(
    () => rateDayField(back(1), 'weight', 3),
    (e) => e.code === 'field',
  );
});

test('editing a past day: steps, water, sleep, ratings – and it shows in streaks and charts', () => {
  const d3 = back(3);
  setDaySteps(d3, 4000);
  addDaySteps(d3, 1500);
  setDayWater(d3, 40); // clamped
  setDaySleep(d3, { hours: 6.5, q: 3 });
  rateDayField(d3, 'mood', 4);
  const d = readDay(d3);
  assert.equal(d.steps, 5500);
  assert.equal(d.water, 30);
  assert.deepEqual([d.sleep.hours, d.sleep.q], [6.5, 3]);
  assert.equal(d.mood, 4);
  setDayWater(d3, -2);
  assert.equal(readDay(d3).water, 0);
  // charts read the same rows
  const row = dailyRows({ days: all('days'), food: all('food'), sessions: all('sessions') }, 7, today).find(
    (r) => r.day === d3,
  );
  assert.equal(row.steps, 5500);
  assert.equal(row.sleep, 6.5);
  // forgotten steps on a past day fill a streak gap
  for (const n of [0, 1, 2]) setDaySteps(back(n), 20000);
  const before = stepStreak(all('days'), 10000, today);
  setDaySteps(d3, 20000);
  assert.ok(stepStreak(all('days'), 10000, today) > before);
  clearDaySleep(d3);
  assert.equal(readDay(d3).sleep.hours, null);
  rateDayField(d3, 'mood', null);
  assert.equal(readDay(d3).mood, null);
  assert.ok(get('days', d3));
  void put;
});

test('sleep streak counts nights entered by hand (no bedtime tap)', () => {
  const now = parseDay('2026-10-20').getTime() + 12 * 3600e3;
  const rows = [
    { id: '2026-10-18', sleepH: 7 },
    { id: '2026-10-19', sleepH: 7.5 },
    { id: '2026-10-20', sleepH: 8 },
  ];
  assert.ok(sleepStreak(rows, now) >= 2);
  assert.equal(sleepStreak([], now), 0);
});

test('screenshot rows: dated readings kept, undated one goes to the pressed day, future dropped', () => {
  const rows = shotRows(
    [
      { date: '2026-10-26', steps: 9000 },
      { date: '2026-10-27', steps: 11000 },
      { date: '2026-10-27', steps: 1 },
      { date: '2026-10-30', steps: 5000 },
      { date: null, steps: 4000 },
      { date: null, steps: 0 },
    ],
    'steps',
    '2026-10-28',
    '2026-10-28',
  );
  assert.deepEqual(
    rows.map((r) => [r.date, r.value]),
    [
      ['2026-10-28', 4000],
      ['2026-10-27', 11000],
      ['2026-10-26', 9000],
    ],
  );
  const s = shotRows([{ date: null, hours: 7.5, quality: 4 }], 'sleep', '2026-10-20', '2026-10-28');
  assert.deepEqual(s, [{ date: '2026-10-20', value: 7.5, q: 4, on: true }]);
  assert.deepEqual(shotRows(undefined, 'steps', '2026-10-20', '2026-10-28'), []);
});

test('data 4 → 5 backfills fiber/salt on built-in diary rows and meal items, add-only', async () => {
  const { DATA_VERSION, migrate } = await import('../../src/core/migrations.js');
  const { FOODS } = await import('../../src/data/foods.js');
  const oats = FOODS.find((f) => f.id === 'oats');
  const v4 = {
    app: 'vidrichka-fitness',
    version: 4,
    stores: {
      food: [
        { id: 'a', foodId: 'oats', grams: 50, kcal: 1, p: 1, c: 1, f: 1 },
        { id: 'b', foodId: 'oats', grams: 50, kcal: 1, p: 1, c: 1, f: 1, fib: 9, salt: 0 },
        { id: 'c', foodId: 'custom_1', grams: 50, kcal: 1, p: 1, c: 1, f: 1 },
        { id: 'w', type: 'water', date: '2026-10-01', glasses: 3 },
        { id: 'n', name: 'voice', grams: 100, kcal: 5, p: 0, c: 0, f: 0 },
      ],
      meals: [{ id: 'm', items: [{ foodId: 'oats', grams: 100, kcal: 2, p: 1, c: 1, f: 1 }] }, { id: 'odd' }],
      trash: [],
    },
  };
  const m = migrate(v4);
  assert.equal(DATA_VERSION, 5);
  assert.equal(m.version, 5);
  const [a, b, c, w, n] = m.stores.food;
  assert.equal(a.fib, Math.round(oats.fib * 5) / 10);
  assert.equal(a.salt, Math.round(oats.salt * 50) / 100);
  assert.equal(a.kcal, 1, 'macros untouched');
  assert.deepEqual(b, v4.stores.food[1], 'existing values kept');
  assert.deepEqual([c, w, n], v4.stores.food.slice(2), 'custom, water and voice rows kept');
  assert.equal(m.stores.meals[0].items[0].fib, oats.fib);
  assert.deepEqual(m.stores.meals[1], { id: 'odd' });
  assert.equal(v4.stores.food[0].fib, undefined, 'input not mutated');
  assert.deepEqual(migrate(m), m, 'running again changes nothing');
});
