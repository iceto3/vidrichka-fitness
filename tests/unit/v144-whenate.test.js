// 1.4.4 C3: „Кога яде?“ – asked once after a late protein breakfast, the picked time drives
// the timing chart and the graded protein-quest XP (15 / 8 / 0), corrected without double pay.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, get, kv, put, remove, setKv } from '../../src/core/store.js';
import { setSettings } from '../../src/core/settings.js';
import { on } from '../../src/core/bus.js';
import { setLang, t } from '../../src/core/i18n.js';
import { at } from '../../src/features/daily/logic.js';
import { askWhenAte, mealTiming, previewAt, withActual } from '../../src/features/daily/mealtime.js';
import { syncRewards } from '../../src/features/motivation/rewards.js';
import '../../src/features/motivation/quests.js';
import { NOTES } from '../../src/features/whatsnew/notes.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
await setLang('bg');
const api = await import('../../src/features/daily/api.js');
await import('../../src/features/daily/index.js');
const { previewText } = await import('../../src/features/daily/views/whenate.js');

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
let asks = 0;
on('meal:whenAte', () => asks++);
const reset = () => {
  for (const st of ['food', 'days']) all(st).forEach((r) => remove(st, r.id));
  setKv('xp', {});
  setSettings({ daily: { protein: true } });
  asks = 0;
  put('days', { id: D, wake: at(D, '07:00'), proteinStart: at(D, '07:00') }); // window 07:00–07:30
};
/** Save a breakfast row at the clock's time, as the store listener of daily/index.js does. */
const logBreakfast = (/** @type {string} */ hm, id = `bf_${hm}`) =>
  atClock(hm, (now) => {
    const row = put('food', {
      id,
      date: D,
      meal: 'breakfast',
      ts: now,
      time: hm,
      name: 'Яйца',
      grams: 150,
      kcal: 210,
      p: 31,
      c: 1,
      f: 14,
    });
    api.proteinLogged(row, now);
    return row;
  });
const xp = () => kv('xp', {})[`quest:${D}:protein`]?.amt ?? 0;
const sync = (/** @type {string} */ hm) => atClock(hm, () => syncRewards());

test('a breakfast logged after the window asks „Кога яде?“ once; on time / typed times never ask', () => {
  reset();
  logBreakfast('07:20');
  assert.equal(asks, 0, 'on time: no question');
  reset();
  atClock('08:00', (now) => api.setAteAt(at(D, '07:40'), now)); // the pill's „Изядох в 07:40“
  logBreakfast('08:00');
  assert.equal(get('days', D).mealTimes.breakfast.actual, at(D, '07:40'));
  assert.equal(asks, 0, 'a time typed from the pill is not asked again');
  reset();
  logBreakfast('08:10');
  assert.equal(asks, 1, 'late → asked');
  assert.ok(atClock('08:10', (n) => askWhenAte(get('days', D), n)));
  assert.ok(!atClock('08:25', (n) => askWhenAte(get('days', D), n)), 'not asked long after the logging');
  logBreakfast('08:11', 'bf_2'); // the second item of the same meal
  assert.equal(asks, 1, 'only the first late item asks');
});

test('a breakfast saved before the wake-up was entered is graded but never asked', () => {
  reset();
  remove('days', D);
  setKv('xp', {});
  const row = atClock('08:10', (now) =>
    put('food', {
      id: 'early',
      date: D,
      meal: 'breakfast',
      ts: now,
      time: '08:10',
      name: 'x',
      grams: 100,
      kcal: 150,
      p: 30,
      c: 1,
      f: 2,
    }),
  );
  assert.ok(row);
  atClock('08:10', (now) => (put('days', { id: D, wake: at(D, '07:00') }), api.proteinFromWake(now)));
  assert.ok(get('days', D).proteinAt, 'recorded');
  assert.equal(asks, 0);
});

test('„Сега“ keeps the logged time and is not asked again', () => {
  reset();
  logBreakfast('08:10');
  assert.equal(
    atClock('08:10', (n) => api.setMealActual(null, n)),
    false,
  );
  const mt = get('days', D).mealTimes.breakfast;
  assert.equal(mt.actual, at(D, '08:10'));
  assert.equal(mt.asked, true);
  assert.ok(!atClock('08:10', (n) => askWhenAte(get('days', D), n)));
});

test('„По-рано“: the picked time drives the chart and the graded XP, re-graded without double pay', () => {
  reset();
  logBreakfast('08:10'); // 40 min after the window → missed, 0 XP
  sync('08:10');
  assert.equal(xp(), 0);
  // 07:25 → on time, 15 XP
  assert.ok(atClock('08:11', (n) => api.setMealActual(at(D, '07:25'), n)));
  const rec = get('days', D);
  assert.equal(rec.mealTimes.breakfast.actual, at(D, '07:25'));
  assert.equal(rec.mealTimes.breakfast.planned, at(D, '07:30'), 'the planned time is kept');
  assert.equal(mealTiming(rec, D)?.status, 'ontime', 'Хранене навреме uses the actual time');
  assert.equal(get('food', 'bf_08:10').time, '07:25', 'the diary row shows when she ate');
  sync('08:11');
  assert.equal(xp(), 15);
  sync('08:12');
  assert.equal(xp(), 15, 'syncing again pays nothing more');
  // changed to 07:50 → +20 мин, 8 XP (the entry is corrected, not added)
  assert.ok(atClock('08:12', (n) => api.setMealActual(at(D, '07:50'), n)));
  sync('08:12');
  assert.equal(xp(), 8);
  assert.equal(Object.keys(kv('xp', {})).filter((k) => k.includes(':protein')).length, 1);
  // a time in the future or before the countdown is refused
  assert.equal(
    atClock('08:12', (n) => api.setMealActual(at(D, '08:30'), n)),
    false,
  );
  assert.equal(
    atClock('08:12', (n) => api.setMealActual(at(D, '06:30'), n)),
    false,
  );
  assert.equal(get('days', D).mealTimes.breakfast.actual, at(D, '07:50'));
});

test('live preview text: Навреме ✓ · +15 XP / +N мин · +8 XP / +N мин · пропуснато', () => {
  reset();
  logBreakfast('09:30');
  const rec = get('days', D);
  assert.deepEqual(previewAt(rec, at(D, '07:30')), { state: 'done', delayMin: 0, xp: 15 });
  assert.deepEqual(previewAt(rec, at(D, '07:45')), { state: 'late', delayMin: 15, xp: 8 });
  assert.equal(previewAt(rec, at(D, '08:45')).state, 'missed');
  assert.equal(previewText(previewAt(rec, at(D, '07:10'))), 'Навреме ✓ · +15 XP');
  assert.equal(previewText(previewAt(rec, at(D, '07:45'))), '+15 мин · +8 XP');
  assert.equal(previewText(previewAt(rec, at(D, '08:45'))), '+1 ч 15 мин · пропуснато');
  assert.equal(withActual(rec, 1).mealTimes.breakfast.planned, rec.mealTimes.breakfast.planned);
});

test("1.4.4: version, What's new (bg + en), no English in Bulgarian", async () => {
  const { readFileSync } = await import('node:fs');
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.4.4');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.4.4');
  assert.equal(lock.packages[''].version, '1.4.4');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.4.4');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.4\.4\]/);
  assert.equal(NOTES[0].v, '1.4.4');
  const keys = Object.keys(bg).filter((k) => /^(whenAte|custom)\.|144$|^food\.(fav|customFoods)/.test(k));
  assert.ok(keys.length >= 40, String(keys.length));
  for (const k of keys) {
    assert.ok(en[k], `en ${k}`);
    assert.doesNotMatch(String(bg[k]).replace(/\{\w+\}|XP/g, ''), /[A-Za-z]/, `English in bg ${k}`);
  }
  for (const [, k] of NOTES[0].items) assert.ok(bg[k] && en[k], k);
  for (const k of Object.keys(bg).filter((k) => k.startsWith('whenAte.'))) assert.ok(en[k], k);
  assert.equal(t('whenAte.now', { time: '08:10' }), 'Сега (08:10)');
  assert.equal(t('whenAte.earlier'), 'По-рано');
});

// ---- 1.4.4 fixes: the result toast by the final grade; no green banner for a missed window
const { proteinBar } = await import('../../src/features/daily/logic.js');
/** @type {any[]} */
const graded = [];
on('protein:graded', (/** @type {any} */ e) => graded.push(e));

test('the result comes after „Кога яде?“, matching the final grade', () => {
  reset();
  graded.length = 0;
  logBreakfast('08:10');
  assert.equal(asks, 1);
  assert.equal(graded.length, 0, 'no „пак се брои“ before the answer');
  atClock('08:10', (n) => api.setMealActual(null, n)); // „Сега“: 40 min after the window
  assert.deepEqual(graded, [{ state: 'missed', delayMin: 40, xp: 0 }]);
  reset();
  graded.length = 0;
  logBreakfast('08:10');
  atClock('08:11', (n) => api.setMealActual(at(D, '07:25'), n)); // „Готово“ with 07:25
  assert.deepEqual(graded, [{ state: 'done', delayMin: 0, xp: 15 }]);
});

test('without „Кога яде?“ the result is shown at once, by its grade', () => {
  // typed from the pill: 07:40 → +10 мин, 8 XP
  reset();
  graded.length = 0;
  atClock('08:00', (now) => api.setAteAt(at(D, '07:40'), now));
  logBreakfast('08:00');
  assert.deepEqual(graded, [{ state: 'late', delayMin: 10, xp: 8 }]);
  // typed 08:45 → 75 min after the window: missed, never „пак се брои“
  reset();
  graded.length = 0;
  atClock('09:00', (now) => api.setAteAt(at(D, '08:45'), now));
  logBreakfast('09:00');
  assert.equal(asks, 0);
  assert.deepEqual(graded, [{ state: 'missed', delayMin: 75, xp: 0 }]);
  // on time
  reset();
  graded.length = 0;
  logBreakfast('07:20');
  assert.deepEqual(graded, [{ state: 'done', delayMin: 0, xp: 15 }]);
});

test('Home banner: green when on time or late (8 XP), grey „пропуснат прозорец“ when missed', () => {
  reset();
  logBreakfast('07:20');
  assert.equal(proteinBar(get('days', D), at(D, '07:21'))?.mode, 'done');
  reset();
  logBreakfast('07:50');
  assert.equal(proteinBar(get('days', D), at(D, '07:51'))?.mode, 'done', 'late within the limit stays green');
  reset();
  logBreakfast('08:10');
  atClock('08:10', (n) => api.setMealActual(null, n));
  assert.equal(proteinBar(get('days', D), at(D, '08:11'))?.mode, 'missed');
  atClock('08:12', (n) => api.setMealActual(at(D, '07:25'), n)); // a later correction turns it green
  assert.equal(proteinBar(get('days', D), at(D, '08:12'))?.mode, 'done');
  assert.equal(t('home.proteinMissed'), 'Протеиновата закуска е записана · пропуснат прозорец');
  for (const k of [
    'cel.proteinLateN',
    'cel.proteinMissed',
    'cel.proteinMissedSub',
    'home.proteinMissed',
    'morning.missed',
  ])
    assert.ok(bg[k] && en[k], k);
  assert.doesNotMatch(bg['cel.proteinMissed'] + bg['cel.proteinMissedSub'], /✓|пак се брои/);
});
