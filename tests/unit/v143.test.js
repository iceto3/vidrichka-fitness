// 1.4.3: meal pill (countdown + visibility + shrink), meal timing (late time entry,
// classification, chart summary, backward compatibility) and the abbreviated nutrients.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dayKey } from '../../src/core/dates.js';
import { setLang, t } from '../../src/core/i18n.js';
import { MIN, PROTEIN_WINDOW, proteinBar, proteinOnTime } from '../../src/features/daily/logic.js';
import {
  TIMED_MEAL,
  actualAt,
  checkAteAt,
  classify,
  hmOn,
  mealTiming,
  pendingMeal,
  pillVisible,
  plannedAt,
  timingDays,
  timingSummary,
} from '../../src/features/daily/mealtime.js';
import { NUTRIENTS, fmtNutr, nutrientCells, nutrientLegend, nutrientLine } from '../../src/features/food/nutrients.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

setLang('bg');
const T0 = new Date(2026, 10, 4, 8, 0, 0).getTime(); // 04.11.2026 08:00 local
const TODAY = dayKey(T0);
const rec = (o = {}) => ({ id: TODAY, proteinStart: T0, ...o });

test('1.4.3: version, What’s new entry, strings in both languages, no English in Bulgarian', async () => {
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.4.3');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.4.3');
  assert.equal(lock.packages[''].version, '1.4.3');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.4.3');
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  assert.equal(NOTES[0].v, '1.4.3');
  assert.deepEqual(
    NOTES[0].items.map(([, k]) => k),
    [
      'whatsNew.pill143',
      'whatsNew.timing143',
      'whatsNew.nutr143',
      'whatsNew.protein143',
      'whatsNew.grams143',
      'whatsNew.meals143',
    ],
  );
  const keys = Object.keys(bg).filter((k) => /^(mealPill|mealTime|mealChart|nutr)\.|143$/.test(k));
  assert.ok(keys.length >= 30);
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    for (const s of typeof bg[k] === 'string' ? [bg[k]] : Object.values(bg[k]))
      assert.doesNotMatch(s.replace(/\{\w+\}/g, ''), /[A-Za-z]/, `English in bg ${k}`);
  }
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.4\.3\]/);
});

test('pill countdown = the Home banner countdown (one logic)', () => {
  // running: same mm:ss as proteinBar
  for (const dt of [0, 1000, 10 * MIN + 500, 29 * MIN + 59_000]) {
    const p = pendingMeal(rec(), T0 + dt);
    assert.deepEqual(p, { meal: TIMED_MEAL, mode: 'running', time: proteinBar(rec(), T0 + dt)?.time, late: null });
  }
  assert.equal(pendingMeal(rec(), T0)?.time, '30:00');
  assert.equal(pendingMeal(rec(), T0 + 29 * MIN + 59_500)?.time, '00:01');
  // overdue: how late, counted up from the end of the window (round 3), until answered
  assert.deepEqual(pendingMeal(rec(), T0 + 3 * 60 * MIN), {
    meal: 'breakfast',
    mode: 'overdue',
    time: '',
    late: { h: 2, m: 30 },
  });
  // nothing pending: no countdown, eaten, skipped, reminder off
  assert.equal(pendingMeal({ id: TODAY }, T0), null);
  assert.equal(pendingMeal(null, T0), null);
  assert.equal(pendingMeal(rec({ proteinAt: T0 + MIN }), T0 + 2 * MIN), null);
  assert.equal(pendingMeal(rec({ proteinSkip: T0 + MIN }), T0 + 2 * MIN), null);
  assert.equal(pendingMeal(rec(), T0 + MIN, false), null);
});

test('pill visibility: other tabs only, pending only, not in a workout, not on the logger', () => {
  const pending = { meal: 'breakfast', mode: 'running', time: '12:00' };
  const base = { pending, tab: 'food', navHidden: false, workout: false, path: 'food' };
  assert.equal(pillVisible(base), true);
  for (const tab of ['food', 'train', 'progress', 'profile']) assert.equal(pillVisible({ ...base, tab }), true, tab);
  assert.equal(pillVisible({ ...base, tab: 'home' }), false);
  assert.equal(pillVisible({ ...base, tab: undefined }), false);
  assert.equal(pillVisible({ ...base, pending: null }), false);
  assert.equal(pillVisible({ ...base, workout: true }), false);
  assert.equal(pillVisible({ ...base, navHidden: true }), false);
  assert.equal(pillVisible({ ...base, path: 'food/add/breakfast' }), false);
  assert.equal(pillVisible({ ...base, path: 'food/add/lunch' }), true);
});

test('late time entry: default now, no future, not before the countdown', () => {
  const now = T0 + 90 * MIN; // 09:30
  assert.equal(hmOn(TODAY, '09:05'), T0 + 65 * MIN);
  assert.equal(hmOn(TODAY, '24:00'), null);
  assert.equal(hmOn(TODAY, 'x'), null);
  assert.deepEqual(checkAteAt(rec(), '09:05', now), { ok: true, at: T0 + 65 * MIN });
  assert.deepEqual(checkAteAt(rec(), '09:30', now + 20_000), { ok: true, at: now }); // this minute = now
  assert.deepEqual(checkAteAt(rec(), '09:31', now), { ok: false, err: 'future' });
  assert.deepEqual(checkAteAt(rec(), '07:59', now), { ok: false, err: 'early' });
  assert.deepEqual(checkAteAt(rec(), '', now), { ok: false, err: 'invalid' });
  // the stored typed time is used only when it is valid
  assert.equal(actualAt(rec({ proteinAteAt: T0 + 65 * MIN }), now), T0 + 65 * MIN);
  assert.equal(actualAt(rec({ proteinAteAt: now + MIN }), now), now);
  assert.equal(actualAt(rec({ proteinAteAt: T0 - MIN }), now), now);
  assert.equal(actualAt(rec(), now), now);
});

test('timing classification: planned = end of the window, late with +N min', () => {
  const planned = T0 + PROTEIN_WINDOW * MIN;
  assert.equal(plannedAt(rec()), planned);
  assert.equal(plannedAt({}), null);
  assert.deepEqual(classify(planned, planned - 5 * MIN), { status: 'ontime', delayMin: 0 });
  assert.deepEqual(classify(planned, planned), { status: 'ontime', delayMin: 0 });
  assert.deepEqual(classify(planned, planned + 20_000), { status: 'ontime', delayMin: 0 }); // rounds to 0
  assert.deepEqual(classify(planned, planned + 17 * MIN), { status: 'late', delayMin: 17 });
  // new records
  const late = mealTiming(
    rec({ proteinAt: T0 + 90 * MIN, mealTimes: { breakfast: { planned, actual: T0 + 65 * MIN } } }),
    TODAY,
  );
  assert.deepEqual(late, { status: 'late', delayMin: 35, planned, actual: T0 + 65 * MIN });
  // old records (no mealTimes): derived from proteinStart / proteinAt / proteinSkip
  assert.equal(mealTiming(rec({ proteinAt: T0 + 10 * MIN }), TODAY)?.status, 'ontime');
  assert.equal(mealTiming(rec({ proteinAt: T0 + 42 * MIN }), TODAY)?.delayMin, 12);
  assert.equal(mealTiming(rec({ proteinSkip: T0 + 5 * MIN }), TODAY)?.status, 'missed');
  assert.equal(mealTiming(rec({ id: '2026-11-03' }), TODAY)?.status, 'missed'); // never answered
  assert.equal(mealTiming(rec(), TODAY)?.status, 'pending');
  assert.equal(mealTiming({ id: TODAY }, TODAY), null);
  assert.equal(mealTiming(null, TODAY), null);
  // the streak's on-time rule follows the typed time (part A: 30 min, no grace)
  assert.equal(
    proteinOnTime(rec({ proteinAt: T0 + 90 * MIN, mealTimes: { breakfast: { planned, actual: T0 + 25 * MIN } } })),
    true,
  );
  assert.equal(
    proteinOnTime(rec({ proteinAt: T0 + 90 * MIN, mealTimes: { breakfast: { planned, actual: T0 + 40 * MIN } } })),
    false,
  );
  assert.equal(proteinOnTime(rec({ proteinAt: T0 + 90 * MIN })), false);
});

test('chart days and summary: on time n/total, average delay of the late ones', () => {
  const at = (day, h, m) => new Date(`${day}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`).getTime();
  /** @type {Record<string, any>} */
  const recs = {};
  const add = (day, o) => (recs[day] = { id: day, proteinStart: at(day, 8, 0), ...o });
  add('2026-10-29', { proteinAt: at('2026-10-29', 8, 20) }); // on time
  add('2026-10-30', { proteinAt: at('2026-10-30', 8, 40) }); // +10
  add('2026-10-31', { proteinSkip: at('2026-10-31', 8, 5) }); // missed
  // 2026-11-01: no countdown
  add('2026-11-02', {
    mealTimes: { breakfast: { planned: at('2026-11-02', 8, 30), actual: at('2026-11-02', 9, 0) } },
    proteinAt: at('2026-11-02', 9, 30),
  }); // +30
  add('2026-11-03', {}); // never answered → missed
  add('2026-11-04', {}); // today, pending
  add('2026-10-20', { proteinAt: at('2026-10-20', 8, 10) }); // outside the 7 days
  const days = timingDays(recs, '2026-11-04', 7);
  assert.deepEqual(
    days.map((d) => d.day),
    ['2026-10-29', '2026-10-30', '2026-10-31', '2026-11-01', '2026-11-02', '2026-11-03', '2026-11-04'],
  );
  assert.deepEqual(
    days.map((d) => d.t?.status ?? null),
    ['ontime', 'late', 'missed', null, 'late', 'missed', 'pending'],
  );
  assert.deepEqual(timingSummary(days), { onTime: 1, total: 5, late: 2, missed: 2, protein: 0, avgDelay: 20 });
  assert.deepEqual(timingSummary([]), { onTime: 0, total: 0, late: 0, missed: 0, protein: 0, avgDelay: null });
  assert.equal(timingSummary(days.slice(0, 1)).avgDelay, null);
  // the Bulgarian summary text
  assert.equal(t('mealChart.summary', { n: 5, total: 7 }), 'навреме 5/7');
  assert.equal(t('mealChart.lateN', { n: 12 }), '+12 мин');
});

test('nutrient abbreviations: пр · вх · мз · кр · фб · сл', () => {
  setLang('bg');
  const row = { p: 25, c: 3.14, f: 10.06, fib: 1.2, salt: 0.3 };
  assert.equal(nutrientLine(row, 450), 'пр 25 · вх 3,1 · мз 10,1 · кр 0,5 · фб 1,2 · сл 0,3');
  // creatine only when the food has some
  assert.equal(nutrientLine(row, 0), 'пр 25 · вх 3,1 · мз 10,1 · фб 1,2 · сл 0,3');
  assert.equal(nutrientLine(row, null), 'пр 25 · вх 3,1 · мз 10,1 · фб 1,2 · сл 0,3');
  // unknown fiber/salt show „–“, missing macros count as 0, traces as „<0,1“
  assert.equal(nutrientLine({ p: 0.02, c: 0 }), 'пр <0,1 · вх 0 · мз 0 · фб – · сл –');
  assert.equal(fmtNutr(null), '–');
  assert.equal(fmtNutr(0), '0');
  assert.equal(fmtNutr(12.34), '12,3');
  assert.deepEqual(
    nutrientCells({ p: 1, c: 2, f: 3, fib: 0, salt: 0 }, 2000).map(([k]) => k),
    ['nutr.p', 'nutr.c', 'nutr.f', 'nutr.cr', 'nutr.fib', 'nutr.salt'],
  );
  assert.equal(NUTRIENTS.length, 6);
  assert.deepEqual(nutrientLegend(), [
    ['пр', 'Протеин'],
    ['вх', 'Въглехидрати'],
    ['мз', 'Мазнини'],
    ['кр', 'Креатин'],
    ['фб', 'Фибри'],
    ['сл', 'Сол'],
  ]);
});
