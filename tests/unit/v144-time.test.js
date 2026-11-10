// 1.4.4 (time): a meal can never be before the wake-up – the wake-up is refused when it is
// later than a logged breakfast, „Кога яде?“ starts at the wake-up – and the time of a diary
// entry is edited in the item editor („Час“), re-grading today's protein breakfast.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, get, kv, put, remove, setKv } from '../../src/core/store.js';
import { setSettings } from '../../src/core/settings.js';
import { on } from '../../src/core/bus.js';
import { setLang, t } from '../../src/core/i18n.js';
import { at, proteinQuest } from '../../src/features/daily/logic.js';
import { checkAteAt, checkMealTime, mealFloor, wakeAfterBreakfast } from '../../src/features/daily/mealtime.js';
import { syncRewards } from '../../src/features/motivation/rewards.js';
import '../../src/features/motivation/quests.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
await setLang('bg');
const api = await import('../../src/features/daily/api.js');
await import('../../src/features/daily/index.js');
const { setDaySleepTimes } = await import('../../src/features/day/api.js');

const D = '2026-11-10';
const realNow = Date.now;
/** @template T @param {string} hm @param {(now: number) => T} fn @returns {T} */
const atClock = (hm, fn) => {
  const now = at(D, hm);
  Date.now = () => now;
  try {
    return fn(now);
  } finally {
    Date.now = realNow;
  }
};
/** @type {any[]} */
let graded = [];
on('protein:graded', (q) => graded.push(q));
let asks = 0;
on('meal:whenAte', () => asks++);
const clear = () => {
  for (const st of ['food', 'days']) all(st).forEach((r) => remove(st, r.id));
  setKv('xp', {});
  setSettings({ daily: { protein: true } });
  graded = [];
  asks = 0;
};
const row = (/** @type {string} */ hm, meal = 'breakfast', id = `${meal}_${hm}`, date = D) =>
  put('food', { id, date, meal, ts: at(date, hm), time: hm, name: 'Яйца', grams: 150, kcal: 210, p: 31, c: 1, f: 14 });
const xp = () => kv('xp', {})[`quest:${D}:protein`]?.amt ?? 0;

test('wakeAfterBreakfast / mealFloor / checkMealTime (pure)', () => {
  const rows = [
    { meal: 'breakfast', ts: at(D, '07:30') },
    { meal: 'breakfast', ts: at(D, '07:10') },
    { meal: 'breakfast', type: 'water', ts: at(D, '06:00') },
    { meal: 'lunch', ts: at(D, '06:30') },
  ];
  assert.equal(wakeAfterBreakfast(rows, at(D, '07:11')), at(D, '07:10'), 'the first breakfast entry');
  assert.equal(wakeAfterBreakfast(rows, at(D, '07:10') + 59_000), null, 'the same minute is fine');
  assert.equal(wakeAfterBreakfast(rows, at(D, '06:45')), null);
  assert.equal(wakeAfterBreakfast([], at(D, '09:00')), null);
  // the floor: the wake-up of that day, else the countdown start
  assert.equal(mealFloor({ wake: at(D, '07:00') + 30_000 }, D), at(D, '07:00'));
  assert.equal(mealFloor({ sleepWake: at(D, '06:40') }, D), at(D, '06:40'));
  assert.equal(mealFloor({ wake: at('2026-11-09', '07:00'), proteinStart: at(D, '07:05') }, D), at(D, '07:05'));
  assert.equal(mealFloor({}, D), null);
  const rec = { wake: at(D, '07:00') };
  const now = at(D, '09:00');
  assert.deepEqual(checkAteAt(rec, '06:55', now), { ok: false, err: 'early' }, '„Кога яде?“ floor = wake-up');
  assert.deepEqual(checkAteAt(rec, '07:00', now), { ok: true, at: at(D, '07:00') });
  assert.deepEqual(checkMealTime(rec, D, '09:05', now), { ok: false, err: 'future' });
  assert.deepEqual(checkMealTime({}, '2026-11-09', '23:55', now), { ok: true, at: at('2026-11-09', '23:55') });
  assert.equal(t('mealTime.err.early'), 'Храненето не може да е преди ставането – избери по-късен час.');
});

test('a wake-up later than the logged breakfast is refused (sleep editor and morning tap)', () => {
  clear();
  row('07:30');
  assert.throws(() => atClock('09:00', () => setDaySleepTimes(D, { bed: '23:30', wake: '08:00' })), {
    code: 'wakeAfterBreakfast',
  });
  assert.equal(get('days', D)?.sleepWake, undefined, 'nothing saved');
  assert.equal(
    t('day.err.wakeAfterBreakfast', { time: '07:30' }),
    'Закуската е записана в 07:30 – ставането трябва да е преди това',
  );
  assert.equal(
    en['day.err.wakeAfterBreakfast'].replace('{time}', '07:30'),
    'Breakfast is logged at 07:30 – the wake-up has to be before that',
  );
  // the morning tap („Току-що станах“) at 09:00 after a 07:30 breakfast: refused, no wake-up
  assert.equal(
    atClock('09:00', (now) => api.wakeUp(now)),
    false,
  );
  assert.equal(get('days', D)?.wake, undefined);
  assert.equal(api.wakeConflict(D, at(D, '09:00')), at(D, '07:30'));
  // a wake-up before (or at) the breakfast is fine, and the breakfast is graded normally
  atClock('09:00', () => setDaySleepTimes(D, { bed: '23:30', wake: '07:10' }));
  assert.equal(get('days', D).sleepWake, at(D, '07:10'));
  assert.deepEqual(
    atClock('09:00', (now) => proteinQuest(get('days', D), now)),
    { state: 'done', delayMin: 0, xp: 15 },
    'window 07:10–07:40, eaten 07:30',
  );
  assert.equal(asks, 0);
});

test('older data with a breakfast before the stored wake-up: other sleep fields stay editable', () => {
  clear();
  row('06:50');
  put('days', { id: D, sleepWake: at(D, '07:00'), sleepBed: at('2026-11-09', '23:30') });
  // same wake-up, another bedtime: not refused; the breakfast counts as on time (clamped)
  atClock('08:00', () => setDaySleepTimes(D, { bed: '23:00', wake: '07:00' }));
  const r = get('days', D);
  assert.equal(r.sleepWake, at(D, '07:00'));
  assert.equal(atClock('08:00', (now) => proteinQuest(r, now)).state, 'done');
  // a changed wake-up is checked again
  assert.throws(() => atClock('08:00', () => setDaySleepTimes(D, { bed: '23:00', wake: '07:05' })), {
    code: 'wakeAfterBreakfast',
  });
});

test('the i18n keys exist in both languages; the unused „Малко късно“ toast is gone', () => {
  for (const k of [
    'day.err.wakeAfterBreakfast',
    'food.time',
    'food.timeHint',
    'food.timeBreakfast',
    'whatsNew.time144',
  ])
    assert.ok(bg[k] && en[k], k);
  assert.equal(bg['cel.proteinLate'], undefined);
  assert.equal(en['cel.proteinLate'], undefined);
});

/** Today's protein breakfast logged at `hm` (window from the 07:00 wake-up), as daily/index.js does. */
const gradedBreakfast = (/** @type {string} */ hm, n = 1) =>
  atClock(hm, (now) => {
    put('days', { id: D, wake: at(D, '07:00'), proteinStart: at(D, '07:00') }); // window 07:00–07:30
    let r;
    for (let i = 0; i < n; i++) r = row(hm, 'breakfast', `bf${i}_${hm}`);
    api.proteinLogged(r, now);
    api.setMealActual(null, now); // „Сега“ (when asked)
    syncRewards();
    graded = [];
  });

test('item editor time: today’s graded breakfast re-grades – all its entries move, no double XP', () => {
  clear();
  gradedBreakfast('08:20', 2); // 50 min after the window → missed, 0 XP
  assert.equal(xp(), 0);
  const r = atClock('09:00', (now) => api.setFoodTime('bf0_08:20', '07:20', now));
  assert.deepEqual(r, { ok: true, at: at(D, '07:20'), graded: true });
  for (const x of all('food')) assert.equal(x.time, '07:20', `${x.id} moved with the meal`);
  assert.equal(get('days', D).mealTimes.breakfast.actual, at(D, '07:20'), 'timing chart');
  assert.equal(graded.length, 1, 'one result toast, after the change');
  assert.equal(graded[0].state, 'done');
  atClock('09:00', () => syncRewards());
  assert.equal(xp(), 15);
  // back to late: corrected down, not paid twice
  atClock('09:05', (now) => api.setFoodTime('bf1_08:20', '07:45', now));
  atClock('09:05', () => syncRewards());
  assert.equal(xp(), 8);
  assert.equal(graded.at(-1).state, 'late');
  atClock('09:05', () => syncRewards());
  assert.equal(xp(), 8, 'stable');
});

test('item editor time: refused in the future / before the wake-up; other meals move alone', () => {
  clear();
  gradedBreakfast('07:20');
  assert.deepEqual(
    atClock('09:00', (now) => api.setFoodTime('bf0_07:20', '09:05', now)),
    { ok: false, err: 'future' },
  );
  assert.deepEqual(
    atClock('09:00', (now) => api.setFoodTime('bf0_07:20', '06:55', now)),
    { ok: false, err: 'early' },
  );
  assert.equal(get('food', 'bf0_07:20').time, '07:20');
  assert.equal(api.foodTimeFloor(D), '07:00');
  row('12:30', 'lunch', 'l1');
  row('12:30', 'lunch', 'l2');
  atClock('14:00', (now) => api.setFoodTime('l1', '13:05', now));
  assert.equal(get('food', 'l1').time, '13:05');
  assert.equal(get('food', 'l2').time, '12:30', 'only that entry');
  assert.equal(get('food', 'bf0_07:20').time, '07:20');
  assert.equal(graded.length, 0, 'no protein toast for a lunch');
});

test('item editor time: a past day’s breakfast moves as one meal, no protein re-grade', () => {
  clear();
  const P = '2026-11-09';
  put('days', { id: P, sleepWake: at(P, '07:30') });
  row('09:00', 'breakfast', 'p1', P);
  row('09:10', 'breakfast', 'p2', P);
  atClock('10:00', (now) => api.setFoodTime('p2', '08:15', now));
  assert.equal(get('food', 'p1').time, '08:15');
  assert.equal(get('food', 'p2').ts, at(P, '08:15'));
  assert.deepEqual(
    atClock('10:00', (now) => api.setFoodTime('p1', '07:25', now)),
    { ok: false, err: 'early' },
  );
  assert.equal(graded.length, 0);
});
