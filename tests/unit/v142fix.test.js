// 1.4.2 tester round (findings 1–6): label wording, live sleep checks (future wake-up →
// Готово off + inline message), the visible note when dates move, the ±1 day buttons,
// stale label values after a failed reading, and undo for removing the creatine supplement.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get } from '../../src/core/store.js';
import { addDays, dayKey, parseDay } from '../../src/core/dates.js';
import { at } from '../../src/features/daily/logic.js';
import { FUTURE_SLACK_MIN, MAX_NIGHT_H, checkNight } from '../../src/features/daily/sleeptimes.js';
import { applyScan, labelToForm } from '../../src/features/food/label.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
const { MAX_SLEEP_H, DayEditError, readDay, removeDayCreatine, setDayCreatine, setDaySleepTimes } =
  await import('../../src/features/day/api.js');

const D = '2026-10-28';
const prev = (d, n = 1) => dayKey(addDays(parseDay(d), -n));

test('finding 1: label wording – "Провери етикета", no "Проверя" anywhere in the strings', () => {
  assert.match(bg['label.err.implausible'], /Провери етикета и ги въведи ръчно\./);
  for (const [k, s] of Object.entries(bg)) assert.ok(!/Проверя/.test(String(s)), k);
  for (const f of ['src/data/i18n/bg.js', 'voice/src/label.js', 'voice/src/vision.js', 'voice/src/prompt.js'])
    assert.ok(!/Проверя етикета/.test(readFileSync(f, 'utf8')), f);
});

test('finding 2: a wake-up that has not come yet is caught live (same rule as saving)', () => {
  assert.equal(MAX_NIGHT_H, MAX_SLEEP_H);
  const now = at(D, '06:30');
  assert.equal(checkNight(D, { bed: '23:30', wake: '07:00' }, now).err, 'sleepFuture');
  // within the 5 min slack is fine (the clock of the phone may lag a little)
  assert.equal(checkNight(D, { bed: '23:30', wake: '06:34' }, now).err, null);
  assert.equal(FUTURE_SLACK_MIN, 5);
  assert.equal(checkNight(D, { bed: '23:30', wake: '06:00' }, now).err, null);
  // an older day is never "future"
  assert.equal(checkNight(prev(D), { bed: '23:30', wake: '07:00' }, now).err, null);
  // too long wins over future
  assert.equal(checkNight(D, { bed: '12:00', wake: '07:00' }, now).err, 'sleepLong');
  // the save refuses exactly what the editor disables
  const today = dayKey();
  assert.throws(
    () => setDaySleepTimes(today, { bed: '23:00', wake: '23:59', shift: 1 }),
    (e) => e instanceof DayEditError && e.code === checkNight(today, { bed: '23:00', wake: '23:59', shift: 1 }).err,
  );
  assert.equal(bg['day.err.sleepFuture'], 'Часът на ставане още не е дошъл.');
});

test('finding 3: `moved` flags every night that is not "evening before → this morning"', () => {
  const now = at(D, '12:00');
  const usual = checkNight(D, { bed: '23:30', wake: '07:00' }, now);
  assert.equal(usual.moved, false);
  assert.deepEqual([usual.bedDay, usual.wakeDay], [prev(D), D]);
  // bedtime after midnight → same day as the wake-up
  const late = checkNight(D, { bed: '00:40', wake: '07:10' }, now);
  assert.equal(late.moved, true);
  assert.deepEqual([late.bedDay, late.wakeDay], [D, D]);
  // a day back / forward
  const back = checkNight(D, { bed: '23:30', wake: '07:00', shift: -1 }, now);
  assert.equal(back.moved, true);
  assert.deepEqual([back.bedDay, back.wakeDay], [prev(D, 2), prev(D)]);
  const fwd = checkNight(prev(D), { bed: '23:30', wake: '07:00', shift: 1 }, now);
  assert.equal(fwd.moved, true);
  assert.deepEqual([fwd.bedDay, fwd.wakeDay], [prev(D), D]);
  // the note text in both languages, e.g. "Лягане вт, 27.10 → ставане ср, 28.10"
  assert.equal(bg['sleep.datesNote'], 'Лягане {bed} → ставане {wake}');
  assert.ok(en['sleep.datesNote'].includes('{bed}') && en['sleep.datesNote'].includes('{wake}'));
});

test('finding 4: the ±1 day controls are real buttons with a 44×44 px target', () => {
  const js = readFileSync('src/features/day/views/cards.js', 'utf8');
  assert.equal((js.match(/<button type="button" class="sshiftb" data-act="sshift"/g) || []).length, 2);
  const css = readFileSync('src/features/steps/steps.css', 'utf8');
  const rule = css.slice(
    css.indexOf('.sleeptimes .sshiftb {'),
    css.indexOf('}', css.indexOf('.sleeptimes .sshiftb {')),
  );
  assert.match(rule, /min-height: 44px/);
  assert.match(rule, /min-width: 44px/);
});

test('finding 5: a failed or blocked reading clears values of the previous scan, keeps typed ones', () => {
  const form = { name: '', kcal: '', p: '', c: '', f: '', fib: '', salt: '', portion: '' };
  const ok = labelToForm({ name: 'Кисело мляко', kcal: 62, p: 3.2, c: 4.5, f: 3.5 }, 'bg');
  let s = applyScan(form, {}, ok);
  assert.equal(form.kcal, '62');
  assert.deepEqual(s.filled.sort(), ['c', 'f', 'kcal', 'name', 'p']);
  // the user corrects fat and types fibre by hand
  form.f = '3,6';
  form.fib = '1';
  // the next photo is implausible → name only; everything else of the old scan goes
  const bad = labelToForm({ name: 'Друго', kcal: 900, p: 80, c: 80, f: 80 }, 'bg');
  assert.equal(bad.err, 'implausible');
  s = applyScan(form, s.scan, { err: bad.err, v: { name: bad.v.name } });
  assert.deepEqual(
    { kcal: form.kcal, p: form.p, c: form.c, f: form.f, fib: form.fib, name: form.name },
    { kcal: '', p: '', c: '', f: '3,6', fib: '1', name: 'Друго' },
  );
  assert.deepEqual(s.cleared.sort(), ['c', 'kcal', 'p']);
  // offline / error: nothing new, the name of the failed photo goes too
  s = applyScan(form, s.scan, { err: 'offline', v: {} });
  assert.equal(form.name, '');
  assert.deepEqual(s.scan, {});
  // a new good scan replaces the old one's values, also those it does not have
  form.kcal = '';
  s = applyScan(form, {}, { err: null, v: { kcal: '100', salt: '1,2' } });
  s = applyScan(form, s.scan, { err: null, v: { kcal: '120' } });
  assert.equal(form.kcal, '120');
  assert.equal(form.salt, '');
  assert.ok(bg['label.cleared'] && en['label.cleared']);
});

test('finding 6: removing the creatine supplement returns the grams for „Отмени“', () => {
  const day = dayKey(addDays(new Date(), -4));
  setDayCreatine(day, 5);
  const was = removeDayCreatine(day);
  assert.equal(was, 5);
  assert.equal(get('days', day).creatineG, null);
  assert.equal(readDay(day).creatine.suppG, 0);
  setDayCreatine(day, was); // what the undo pill does
  assert.equal(readDay(day).creatine.suppG, 5);
  setDayCreatine(day, null);
  assert.equal(removeDayCreatine(day), 0); // nothing to remove → no pill
  const js = readFileSync('src/features/day/views/cards.js', 'utf8');
  assert.match(js, /snack\(t\('creatine\.removed'\)/);
  assert.ok(bg['creatine.removed'] && en['creatine.removed']);
});
