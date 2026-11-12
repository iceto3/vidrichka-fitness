// 1.6.4: scroll-wheel picker and wake-up time (chosen hour, not the tap).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../../src/core/i18n.js';
import {
  clampHM,
  clampISO,
  daysInMonth,
  durationHours,
  minuteValues,
  monthLabel,
  parseDuration,
  yearValues,
} from '../../src/ui/wheel.js';
import { at } from '../../src/features/daily/logic.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

test('1.6.4 wheel: month names follow the language, days and leap years, year range', async () => {
  await setLang('bg');
  assert.match(monthLabel(1), /януари/i);
  assert.match(monthLabel(11), /ноември/i);
  await setLang('en');
  assert.match(monthLabel(1), /January/i);
  assert.match(monthLabel(11), /November/i);
  assert.equal(daysInMonth(2026, 2), 28);
  assert.equal(daysInMonth(2024, 2), 29);
  assert.equal(daysInMonth(2026, 11), 30);
  const years = yearValues('2024-09-01', '2026-11-12');
  assert.deepEqual(years[0], 2024);
  assert.deepEqual(years.at(-1), 2026);
});

test('1.6.4 wheel: time and date clamps, minute steps, duration parse', () => {
  assert.equal(clampHM('10:00', '07:00', '09:30'), '09:30');
  assert.equal(clampHM('06:00', '07:00', '09:30'), '07:00');
  assert.equal(clampHM('08:15', '07:00', '09:30'), '08:15');
  assert.equal(clampISO('2026-11-20', '2026-01-01', '2026-11-12'), '2026-11-12');
  assert.equal(clampISO('2025-12-01', '2026-01-01', '2026-11-12'), '2026-01-01');
  assert.deepEqual(minuteValues(15), [0, 15, 30, 45]);
  assert.deepEqual(minuteValues(5, 7), [0, 5, 7, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]);
  assert.deepEqual(parseDuration('7:20'), { h: 7, m: 20 });
  assert.equal(durationHours(7, 20), 7 + 20 / 60);
  assert.deepEqual(parseDuration(7.5), { h: 7, m: 30 });
});

test('1.6.4 wake: chosen time is stored; not the tap; bedtime and future are refused', async () => {
  const { get, put } = await import('../../src/core/store.js');
  const { setSettings } = await import('../../src/core/settings.js');
  const api = await import('../../src/features/daily/api.js');
  const { checkWakeTime, wakeFloor, wakeUp } = api;
  const D = '2026-11-06',
    Y = '2026-11-05';
  const reset = () => (put('days', { id: D }), put('days', { id: Y }));
  setSettings({ daily: { protein: true } });
  const now = at(D, '10:00');
  const early = at(D, '07:15');
  reset();
  const ok = checkWakeTime('07:15', now);
  assert.equal(ok.ok, true);
  assert.equal(ok.ok && ok.at, early);
  assert.equal(wakeUp(early), true);
  const rec = get('days', D);
  assert.equal(rec.wake, early);
  assert.equal(rec.proteinStart, early, 'protein countdown follows the chosen wake, not 10:00');
  assert.equal(wakeUp(at(D, '07:30')), false, 'already recorded');
  reset();
  put('days', { id: Y, bed: at(Y, '23:30'), bedEst: false });
  assert.equal(wakeFloor(now), at(Y, '23:30'));
  assert.equal(checkWakeTime('07:00', now).ok, true);
  reset();
  put('days', { id: D, sleepBed: at(D, '01:30') });
  assert.equal(checkWakeTime('01:00', now).ok, false);
  assert.equal(checkWakeTime('01:00', now).err, 'early');
  assert.equal(checkWakeTime('07:00', now).ok, true);
  assert.equal(checkWakeTime('10:30', now).err, 'future');
  assert.equal(checkWakeTime('10:00', now).ok, true, 'exactly now is allowed');
});

test('1.6.4: no native time/date inputs left in src views', () => {
  const files = [
    'src/ui/components.js',
    'src/features/food/views/diary.js',
    'src/features/body/views/body.js',
    'src/features/body/views/photos.js',
    'src/features/day/views/shot.js',
    'src/features/day/views/cards.js',
    'src/features/daily/views/whenate.js',
    'src/features/daily/views/mealsheet.js',
    'src/features/food/views/add.js',
    'src/features/food/views/supps.js',
    'src/features/profile/views/reminders.js',
  ];
  for (const f of files) {
    const s = readFileSync(f, 'utf8');
    assert.doesNotMatch(s, /type=["'](time|date|datetime-local)["']/, f);
  }
});

test("1.6.4: version, What's new (bg + en), CHANGELOG, no English in Bulgarian", async () => {
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  const { setLang, t } = await import('../../src/core/i18n.js');
  const bg = (await import('../../src/data/i18n/bg.js')).default;
  const en = (await import('../../src/data/i18n/en.js')).default;
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.6.4');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.6.4');
  assert.equal(lock.packages[''].version, '1.6.4');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.6.4');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.6\.4\] – 2026-11-12/);
  assert.equal(NOTES[0].v, '1.6.4');
  assert.deepEqual(
    NOTES[0].items.map(([, k]) => k),
    ['whatsNew.wake164', 'whatsNew.wheels164'],
  );
  await setLang('bg');
  assert.equal(t('home.woke'), 'Събудих се');
  for (const k of [
    'whatsNew.wake164',
    'whatsNew.wheels164',
    'home.woke',
    'home.wokeSub',
    'morning.wakeTitle',
    'morning.wakeHint',
  ]) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(
      JSON.stringify(/** @type {any} */ (bg)[k]).replace(/\{\w+\}|"[fm]":/g, ''),
      /[A-Za-z]/,
      `English in bg ${k}`,
    );
  }
});
