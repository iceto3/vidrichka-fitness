// 1.4.3 tester round: a wake-up recorded by any path starts the protein countdown (today
// only), the gendered user-addressed strings, Bulgarian accessibility labels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { get, put } from '../../src/core/store.js';
import { dayKey } from '../../src/core/dates.js';
import { setSettings } from '../../src/core/settings.js';
import { MIN, PROTEIN_WINDOW, at, proteinState } from '../../src/features/daily/logic.js';
import { pendingMeal, pillVisible } from '../../src/features/daily/mealtime.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
const api = await import('../../src/features/daily/api.js');
const { setDaySleepTimes } = await import('../../src/features/day/api.js');

const D = '2026-11-04',
  Y = '2026-11-03';
const realNow = Date.now;
/** Run `fn` with the clock at `D time` (setSleepTimes / checkNight read Date.now()). */
const atClock = (time, fn, d = D) => {
  const now = at(d, time);
  Date.now = () => now;
  try {
    return fn(now);
  } finally {
    Date.now = realNow;
  }
};
const reset = (...ids) => ids.forEach((id) => put('days', { id }));
const protein = (on) => setSettings({ daily: { protein: on } });

test('sleep editor: a wake-up typed for this morning starts the protein countdown at that time', () => {
  protein(true);
  reset(D, Y);
  atClock('07:20', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:05' });
    const r = get('days', D);
    assert.equal(r.proteinStart, at(D, '07:05'), 'starts at the typed wake-up');
    assert.equal(r.wake, at(D, '07:05'), 'counts as this morning’s wake-up');
    const ps = proteinState(r, now);
    assert.equal(ps.state, 'running');
    assert.equal(ps.left, (PROTEIN_WINDOW - 15) * MIN);
    assert.equal(pendingMeal(r, now)?.time, '15:00');
    assert.equal(pillVisible({ pending: pendingMeal(r, now), tab: 'food', path: 'food' }), true);
    // a corrected wake-up moves the unanswered countdown with it (see the editor test below)
    setDaySleepTimes(D, { bed: '23:30', wake: '07:15' });
    assert.equal(get('days', D).proteinStart, at(D, '07:15'));
  });
});

test('an expired window is overdue: Изядох with the eaten time, or Пропуснах, still work', () => {
  protein(true);
  reset(D, Y);
  atClock('09:40', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:00' });
    const r = get('days', D);
    assert.equal(r.proteinStart, at(D, '07:00'));
    assert.equal(proteinState(r, now).state, 'overdue');
    assert.equal(pendingMeal(r, now)?.mode, 'overdue');
    assert.equal(api.setAteAt(at(D, '08:10'), now), true);
    assert.equal(api.proteinYes(now), true);
    const done = get('days', D);
    assert.deepEqual(done.mealTimes.breakfast, { planned: at(D, '07:30'), actual: at(D, '08:10') });
  });
  reset(D);
  atClock('09:40', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:00' });
    assert.equal(api.proteinSkip(now), true);
    assert.equal(api.proteinFromWake(now), false, 'answered: never restarted');
  });
});

test('wake recorded earlier (protein was off, or typed) → the morning tap / turning protein on starts it', () => {
  reset(D, Y);
  protein(false);
  atClock('07:10', () => {
    assert.equal(api.wakeUp(), true);
    assert.equal(get('days', D).proteinStart, undefined, 'protein off: no countdown');
  });
  protein(true);
  atClock('07:25', (now) => {
    assert.equal(api.wakeUp(), false, 'wake-up already recorded');
    assert.equal(get('days', D).proteinStart, at(D, '07:10'), 'from the recorded wake-up');
    assert.equal(proteinState(get('days', D), now).state, 'running');
  });
  // the morning tap itself (nothing recorded) still starts at the tap
  reset(D, Y);
  atClock('07:40', () => {
    assert.equal(api.wakeUp(), true);
    assert.equal(get('days', D).proteinStart, at(D, '07:40'));
  });
});

test('never on past days, never with protein off, never from a wake-up on another day', () => {
  protein(true);
  reset(D, Y);
  atClock('10:00', () => {
    setDaySleepTimes(Y, { bed: '23:00', wake: '07:00' });
    assert.equal(get('days', Y).proteinStart, undefined, 'past day: no retro start');
    assert.equal(get('days', Y).wake, undefined);
  });
  reset(D);
  protein(false);
  atClock('08:00', () => {
    setDaySleepTimes(D, { bed: '23:00', wake: '07:00' });
    assert.equal(get('days', D).proteinStart, undefined);
    assert.equal(get('days', D).wake, at(D, '07:00'));
  });
  protein(true);
  reset(D);
  put('days', { id: D, wake: at(Y, '23:50') }); // odd record: a wake-up stamped yesterday
  atClock('08:00', (now) => assert.equal(api.proteinFromWake(now), false));
  // an existing start is kept
  put('days', { id: D, wake: at(D, '06:00'), proteinStart: at(D, '06:30') });
  atClock('08:00', (now) => assert.equal(api.proteinFromWake(now), false));
  assert.equal(get('days', D).proteinStart, at(D, '06:30'));
  assert.equal(dayKey(at(D, '06:30')), D);
});

test('user-addressed texts follow the profile gender; Vidrichka herself stays feminine', async () => {
  const { setLang, setGender, t } = await import('../../src/core/i18n.js');
  await setLang('bg');
  setGender('m');
  assert.match(t('mealChart.empty'), /кога си ял\.$/);
  assert.match(t('whatsNew.timing143'), /в който си ял,.*кога си ял навреме/);
  assert.equal(t('food.enterSelf'), 'Въведи храната сам');
  assert.match(t('mascot.plan', { plan: 'Крака' }), /Аз съм готова – щом и ти си готов!$/);
  setGender('f');
  assert.match(t('mealChart.empty'), /кога си яла\.$/);
  assert.equal(t('food.enterSelf'), 'Въведи храната сама');
  assert.match(t('mascot.plan', { plan: 'Крака' }), /щом и ти си!$/);
  // the Home sleep card: right for anyone; the otter tucks herself in
  for (const g of ['f', 'm']) {
    setGender(g);
    assert.equal(t('home.goodnightTitle'), 'Лека нощ!');
    assert.equal(t('home.goodnightSub', { otter: 'Видричка' }), 'Лягаш ли си? Докосни и Видричка ще се завие 🌙');
  }
  setGender('f');
  await setLang('en');
});

test('typed 24-hour time: forms accepted, out of range refused, ±steps snap and wrap', async () => {
  const { parseHM, hmComplete, stepHM } = await import('../../src/core/dates.js');
  for (const [s, v] of [
    ['7', '07:00'],
    ['730', '07:30'],
    ['0730', '07:30'],
    ['7:30', '07:30'],
    ['07.30', '07:30'],
    ['7,30', '07:30'],
    [' 23:59 ', '23:59'],
    ['00:00', '00:00'],
  ])
    assert.equal(parseHM(s), v, s);
  for (const s of ['24:00', '7:60', '12:5', 'ab', '', '7:30 PM', '12345']) assert.equal(parseHM(s), null, s);
  assert.equal(hmComplete('07:3'), false);
  assert.equal(hmComplete('0730'), true);
  assert.equal(hmComplete('07:30'), true);
  // round 2: exactly the step, no snapping; around midnight
  assert.equal(stepHM('06:40', 5), '06:45');
  assert.equal(stepHM('06:45', -5), '06:40');
  assert.equal(stepHM('07:07', 5), '07:12');
  assert.equal(stepHM('07:07', -5), '07:02');
  assert.equal(stepHM('23:58', 5), '00:03');
  assert.equal(stepHM('00:02', -5), '23:57');
  assert.equal(stepHM('00:00', -5), '23:55');
  assert.equal(stepHM('23:55', 5), '00:00');
  assert.equal(stepHM('07:40', -5), '07:35');
});

test('accessibility labels and the time field are translated (no English in BG)', async () => {
  const bg = (await import('../../src/data/i18n/bg.js')).default,
    en = (await import('../../src/data/i18n/en.js')).default;
  assert.equal(bg['a11y.skip'], 'Към съдържанието');
  assert.equal(bg['a11y.nav'], 'Основно меню');
  assert.equal(en['a11y.skip'], 'Skip to content');
  for (const k of [
    'a11y.skip',
    'a11y.nav',
    'time24.ph',
    'time24.minus',
    'time24.plus',
    'time24.bad',
    'home.goodnightTitle',
  ]) {
    assert.ok(en[k], k);
    assert.doesNotMatch(String(bg[k]).replace(/\{\w+\}/g, ''), /[A-Za-z]/, k);
  }
});

test('the editor saves on every change: a corrected wake-up moves the wake-up and an unanswered countdown', () => {
  protein(true);
  reset(D, Y);
  atClock('06:50', () => {
    setDaySleepTimes(D, { bed: '23:10', wake: '06:25' });
    assert.equal(get('days', D).proteinStart, at(D, '06:25'));
    setDaySleepTimes(D, { bed: '23:10', wake: '06:40' });
    const r = get('days', D);
    assert.equal(r.wake, at(D, '06:40'));
    assert.equal(r.proteinStart, at(D, '06:40'));
  });
  // a wake-up from the morning tap is not moved by the editor
  reset(D, Y);
  atClock('07:10', () => {
    api.wakeUp();
    setDaySleepTimes(D, { bed: '23:10', wake: '06:40' });
    assert.equal(get('days', D).wake, at(D, '07:10'));
    assert.equal(get('days', D).proteinStart, at(D, '07:10'));
  });
  // answered: the countdown stays as it was
  reset(D, Y);
  atClock('08:00', (now) => {
    setDaySleepTimes(D, { bed: '23:10', wake: '07:00' });
    api.proteinSkip(now);
    setDaySleepTimes(D, { bed: '23:10', wake: '07:20' });
    assert.equal(get('days', D).proteinStart, at(D, '07:00'));
  });
});

// ── round 2 ──────────────────────────────────────────────────────────────────────────────
const { all, kv, setKv, remove } = await import('../../src/core/store.js');
const { clearDaySleep, restoreDaySleep } = await import('../../src/features/day/api.js');
const bfRow = (id, time, extra = {}) =>
  put('food', {
    id,
    date: D,
    meal: 'breakfast',
    ts: at(D, time),
    time,
    name: 'x',
    grams: 100,
    kcal: 1,
    p: 1,
    c: 0,
    f: 0,
    ...extra,
  });
const clearFood = () => all('food').forEach((r) => remove('food', r.id));

test('round 2: deleting the protein breakfast clears it (pill back, overdue), XP taken back; Undo restores it', () => {
  protein(true);
  reset(D, Y);
  clearFood();
  setKv('xp', { 'quest:2026-11-03:protein': { amt: 15, ts: 1 }, [`quest:${D}:water`]: { amt: 10, ts: 2 } });
  atClock('07:20', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:05' });
    const row = bfRow('f-bf1', '07:20');
    assert.equal(api.proteinLogged(row, now), true);
  });
  const done = get('days', D);
  assert.ok(done.proteinAt && done.mealTimes.breakfast);
  setKv('xp', { ...kv('xp', {}), [`quest:${D}:protein`]: { amt: 15, ts: 3 } });
  atClock('08:00', (now) => {
    remove('food', 'f-bf1');
    assert.equal(api.proteinUnlogged('f-bf1', now), true);
    const r = get('days', D);
    assert.equal(r.proteinAt, null);
    assert.equal(r.mealTimes.breakfast, undefined, 'the meal timing goes with it');
    assert.equal(r.proteinStart, at(D, '07:05'), 'the countdown start stays');
    assert.equal(proteinState(r, now).state, 'overdue');
    assert.equal(pendingMeal(r, now)?.mode, 'overdue', 'the pill is back');
    const xp = kv('xp', {});
    assert.equal(xp[`quest:${D}:protein`], undefined, 'quest XP taken back');
    assert.ok(xp['quest:2026-11-03:protein'] && xp[`quest:${D}:water`], 'history and other quests kept');
    // Undo puts the same row back → exactly what it had recorded
    const back = put('food', {
      ...(done && {
        id: 'f-bf1',
        date: D,
        meal: 'breakfast',
        ts: at(D, '07:20'),
        time: '07:20',
        name: 'x',
        grams: 100,
        kcal: 1,
        p: 1,
        c: 0,
        f: 0,
      }),
    });
    assert.equal(api.proteinLogged(back, now), true);
    const u = get('days', D);
    assert.equal(u.proteinAt, done.proteinAt);
    assert.deepEqual(u.mealTimes.breakfast, done.mealTimes.breakfast);
    assert.equal(u.proteinUndo, null);
    assert.equal(proteinState(u, now).state, 'done');
  });
  clearFood();
});

test('round 2: another breakfast entry left → still eaten; a notification „yes“ is not undone by other meals', () => {
  protein(true);
  reset(D, Y);
  clearFood();
  atClock('07:20', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:05' });
    api.proteinLogged(bfRow('f-a', '07:20'), now);
    bfRow('f-b', '07:21');
    remove('food', 'f-a');
    assert.equal(api.proteinUnlogged('f-a', now), false);
    assert.ok(get('days', D).proteinAt);
  });
  clearFood();
});

test('round 2: deleting today’s sleep entry clears an unanswered protein start; Undo brings it back', () => {
  protein(true);
  reset(D, Y);
  atClock('07:20', () => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:05' });
    const { undo } = clearDaySleep(D);
    let r = get('days', D);
    assert.equal(r.proteinStart, null);
    assert.equal(r.wake, null, 'the wake-up came from this entry');
    assert.equal(pendingMeal(r, Date.now()), null, 'no pill');
    restoreDaySleep(D, undo);
    r = get('days', D);
    assert.equal(r.proteinStart, at(D, '07:05'));
    assert.equal(r.wake, at(D, '07:05'));
    assert.equal(r.sleepWake, at(D, '07:05'));
  });
  // answered (skipped) or a morning-tap wake-up: the start stays
  reset(D, Y);
  atClock('07:30', (now) => {
    api.wakeUp(at(D, '07:10'));
    setDaySleepTimes(D, { bed: '23:30', wake: '07:00' });
    clearDaySleep(D);
    assert.equal(get('days', D).proteinStart, at(D, '07:10'));
    api.proteinSkip(now);
  });
});

test('round 2: the diary row of a late breakfast shows the „Кога яде?“ time', () => {
  protein(true);
  reset(D, Y);
  clearFood();
  atClock('09:40', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:00' });
    api.setAteAt(at(D, '08:10'), now);
    api.proteinLogged(bfRow('f-late', '09:40'), now);
    assert.equal(get('food', 'f-late').time, '08:10');
    assert.equal(get('food', 'f-late').ts, at(D, '08:10'));
    assert.equal(get('days', D).mealTimes.breakfast.actual, at(D, '08:10'));
    // a second item of the same breakfast too
    const second = bfRow('f-late2', '09:41');
    assert.equal(api.ateTimeOnRow(second), true);
    assert.equal(get('food', 'f-late2').time, '08:10');
  });
  // eaten in time (no typed time) → the save time stays
  reset(D, Y);
  clearFood();
  atClock('07:20', (now) => {
    setDaySleepTimes(D, { bed: '23:30', wake: '07:05' });
    api.proteinLogged(bfRow('f-ok', '07:20'), now);
    assert.equal(get('food', 'f-ok').time, '07:20');
  });
  clearFood();
});
