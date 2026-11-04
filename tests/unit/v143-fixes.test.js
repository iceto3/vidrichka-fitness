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
    // typing it again does not restart it
    setDaySleepTimes(D, { bed: '23:30', wake: '07:15' });
    assert.equal(get('days', D).proteinStart, at(D, '07:05'));
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
