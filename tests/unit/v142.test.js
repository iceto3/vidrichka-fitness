// 1.4.2: creatine (data, day totals, supplement), sleep from bedtime + wake-up time (date
// rule, midnight, override, migration of hours-only entries), the food label → form
// mapping with the plausibility check, and the per-phone daily limit for picture reads.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { get, put } from '../../src/core/store.js';
import { addDays, dayKey, parseDay } from '../../src/core/dates.js';
import { fmtDuration, fmtNum, setLang } from '../../src/core/i18n.js';
import { FOODS } from '../../src/data/foods.js';
import { CREATINE_FOODS, CREATINE_MG, CREATINE_REF, RETENTION, creatinePer100 } from '../../src/data/creatine.js';
import { DEFAULT_CREATINE_DOSE, creatineMg, dayCreatine } from '../../src/features/food/creatine.js';
import { buildDay } from '../../src/features/day/logic.js';
import { at } from '../../src/features/daily/logic.js';
import {
  DEFAULT_BED,
  DEFAULT_WAKE,
  bedDay,
  durationH,
  editorTimes,
  hhmm,
  minutesOf,
  nightFrom,
  shiftOf,
  wakeTs,
} from '../../src/features/daily/sleeptimes.js';
import { formNum, labelToForm } from '../../src/features/food/label.js';
import { VISION_PER_DAY, visionCounted, visionLeft } from '../../src/features/voice/limit.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
const { DayEditError, readDay, setDayCreatine, setDaySleep, setDaySleepTimes, sleepEditorTimes, clearDaySleep } =
  await import('../../src/features/day/api.js');

const today = dayKey();
const back = (n) => dayKey(addDays(parseDay(today), -n));
const empty = { days: [], food: [], sessions: [] };
const byId = Object.fromEntries(FOODS.map((f) => [f.id, f]));

test('1.4.2: version, What’s new entry, strings in both languages', async () => {
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.4.2');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.4.2');
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  assert.equal(NOTES[0].v, '1.4.2');
  assert.deepEqual(
    NOTES[0].items.map(([, k]) => k),
    ['whatsNew.creatine142', 'whatsNew.label142', 'whatsNew.sleep142'],
  );
  for (const k of Object.keys(bg).filter((x) => /^(creatine|label)\.|142$|^sleep\.(bedtime|wakeTime|day)/.test(x)))
    assert.ok(en[k], k);
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.4\.2\]/);
});

test('creatine data: only built-in meat/fish ids, one rule, sources for every species', () => {
  for (const [id, [species, state]] of Object.entries(CREATINE_FOODS)) {
    assert.ok(byId[id], `unknown food id ${id}`);
    assert.ok(['meat'].includes(byId[id].cat), `${id} is ${byId[id].cat}`);
    assert.ok(CREATINE_REF[species]?.src, species);
    assert.ok(state in RETENTION);
    assert.equal(CREATINE_MG[id], creatinePer100(species, state, byId[id].p));
  }
  // rule: reference × protein ratio × retention
  assert.equal(creatinePer100('beef', 'raw', 21), 420);
  assert.equal(creatinePer100('chicken', 'cooked', 31), Math.round(400 * (31 / 22.5) * 0.75));
  assert.equal(creatinePer100('tuna', 'canned', 24.4), 280);
  assert.equal(CREATINE_MG.herring, 650); // new raw herring row
  assert.equal(byId.herring.name.bg, 'Херинга (сурова)');
  // no data → unknown (not invented): processed meat, dairy, eggs, plants
  for (const id of ['ham', 'bacon', 'lukanka', 'sausage', 'kebapche', 'kyufte', 'egg', 'yoghurt', 'rice', 'banana'])
    assert.equal(CREATINE_MG[id], undefined, id);
  // every value is in a sane range for food (≤ 1 g / 100 g)
  for (const v of Object.values(CREATINE_MG)) assert.ok(v > 0 && v <= 1000);
  assert.match(readFileSync('docs/CREATINE.md', 'utf8'), /Harris/);
});

test('creatine of rows and of a day (food with data + supplement), shown as "1,2 г"', async () => {
  const t = { chicken_breast: 400, salmon: 450 };
  assert.equal(creatineMg({ foodId: 'chicken_breast', grams: 150 }, t), 600);
  assert.equal(creatineMg({ foodId: 'custom_x', grams: 150 }, t), null);
  assert.equal(creatineMg({ grams: 150 }, t), null); // voice row without a food id
  assert.equal(creatineMg({ foodId: 'salmon', grams: 0 }, t), null);
  const rows = [
    { foodId: 'chicken_breast', grams: 150 },
    { foodId: 'salmon', grams: 130 },
    { foodId: 'custom_x', grams: 300 },
  ];
  assert.deepEqual(dayCreatine(rows, null, t), { foodG: 1.2, suppG: 0, totalG: 1.2, rows: 2 });
  assert.deepEqual(dayCreatine(rows, 3, t), { foodG: 1.2, suppG: 3, totalG: 4.2, rows: 2 });
  assert.deepEqual(dayCreatine([], 0, t), { foodG: 0, suppG: 0, totalG: 0, rows: 0 });
  assert.equal(dayCreatine([], -2, t).suppG, 0);
  assert.equal(DEFAULT_CREATINE_DOSE, 3);
  await setLang('bg');
  assert.equal(fmtNum(1.2, 1), '1,2');
  // with the real table: 200 g grilled chicken breast
  assert.equal(dayCreatine([{ foodId: 'chicken_breast', grams: 200 }], 0).foodG, 0.8); // 413 mg/100 g
});

test('creatine in the day data and the supplement write (clear, range, future)', () => {
  const d = buildDay(
    {
      days: [{ id: back(1), creatineG: 5 }],
      food: [{ id: 'f1', date: back(1), foodId: 'beef_raw', grams: 100, kcal: 1, p: 0, c: 0, f: 0 }],
      sessions: [],
    },
    back(1),
  );
  assert.deepEqual(d.creatine, { foodG: 0.4, suppG: 5, totalG: 5.4, rows: 1 });
  assert.equal(buildDay(empty, back(1)).creatine.totalG, 0);
  const day = back(3);
  assert.equal(setDayCreatine(day, 3), 3);
  assert.equal(get('days', day).creatineG, 3);
  assert.equal(readDay(day).creatine.suppG, 3);
  setDayCreatine(day, 4.25);
  assert.equal(readDay(day).creatine.suppG, 4.3);
  setDayCreatine(day, null);
  assert.equal(get('days', day).creatineG, null);
  assert.throws(() => setDayCreatine(day, 51), DayEditError);
  assert.throws(() => setDayCreatine(day, -1), DayEditError);
  assert.throws(() => setDayCreatine(dayKey(addDays(new Date(), 1)), 3), DayEditError);
});

test('sleep date rule: 12:00–23:59 → evening before, 00:00–11:59 → after midnight; override ±1', () => {
  const D = '2026-10-20';
  assert.equal(bedDay(D, '22:30'), '2026-10-19');
  assert.equal(bedDay(D, '12:00'), '2026-10-19');
  assert.equal(bedDay(D, '23:59'), '2026-10-19');
  assert.equal(bedDay(D, '00:00'), D);
  assert.equal(bedDay(D, '01:15'), D);
  assert.equal(bedDay(D, '11:59'), D);
  assert.equal(bedDay(D, '22:30', 1), D); // "ден напред"
  assert.equal(bedDay(D, '01:15', -1), '2026-10-19'); // "ден назад"
  assert.equal(bedDay(D, '01:15', -5), '2026-10-19'); // clamped to one day
  assert.equal(minutesOf('7:05'), 425);
  assert.ok(Number.isNaN(minutesOf('25:00')));
});

test('sleep duration: evening bedtime, after midnight, wake = next occurrence, "X ч MM мин"', async () => {
  await setLang('bg');
  const D = '2026-10-20';
  const eve = nightFrom(D, { bed: '22:30', wake: '06:45' });
  assert.equal(eve.bedDay, '2026-10-19');
  assert.equal(eve.wakeDay, D);
  assert.equal(eve.hours, 8.25);
  assert.equal(fmtDuration(eve.hours), '8 ч 15 мин');
  const late = nightFrom(D, { bed: '01:10', wake: '07:00' });
  assert.equal(late.bedDay, D);
  assert.equal(late.wakeDay, D);
  assert.equal(fmtDuration(late.hours), '5 ч 50 мин');
  assert.equal(fmtDuration(8), '8 ч 00 мин');
  // across midnight to the minute
  const m = nightFrom(D, { bed: '23:59', wake: '00:01' });
  assert.equal(m.hours * 60, 2);
  // wake equal to bed → next day (24 h), which the editor then refuses
  assert.equal(durationH(at(D, '07:00'), wakeTs(at(D, '07:00'), '07:00')), 24);
  // morning nap after an all-nighter: bed 08:00 (D) → wake 15:30
  assert.equal(nightFrom(D, { bed: '08:00', wake: '15:30' }).hours, 7.5);
  // override: bed 23:00 moved a day forward
  const fwd = nightFrom(D, { bed: '23:00', wake: '07:00', shift: 1 });
  assert.equal(fwd.bedDay, D);
  assert.equal(fwd.wakeDay, '2026-10-21');
  assert.equal(shiftOf(D, fwd.bed), 1);
  assert.equal(shiftOf(D, eve.bed), 0);
  assert.equal(shiftOf(D, at('2026-10-19', '01:00')), -1);
});

test('editor times: saved times, old hours-only entries (migration), tracked night, defaults', () => {
  const D = '2026-10-20',
    E = '2026-10-19';
  const saved = { sleepBed: at(E, '23:10'), sleepWake: at(D, '06:55'), sleepH: 7.75 };
  assert.deepEqual(editorTimes(D, saved), { bed: '23:10', wake: '06:55', shift: 0, source: 'times' });
  // hours only, wake-up recorded that morning → bed = wake − hours
  assert.deepEqual(editorTimes(D, { sleepH: 7.5, wake: at(D, '06:40') }), {
    bed: '23:10',
    wake: '06:40',
    shift: 0,
    source: 'hours',
  });
  // hours only, no wake-up → 07:00
  assert.deepEqual(editorTimes(D, { sleepH: 7 + 20 / 60 }), { bed: '23:40', wake: '07:00', shift: 0, source: 'hours' });
  // a short night after midnight keeps its date
  assert.deepEqual(editorTimes(D, { sleepH: 3 }), { bed: '04:00', wake: '07:00', shift: 0, source: 'hours' });
  // goodnight + wake-up, nothing typed
  assert.deepEqual(editorTimes(D, { wake: at(D, '07:20') }, { bed: at(E, '23:50') }), {
    bed: '23:50',
    wake: '07:20',
    shift: 0,
    source: 'tracked',
  });
  assert.deepEqual(editorTimes(D, {}, {}), { bed: DEFAULT_BED, wake: DEFAULT_WAKE, shift: 0, source: 'default' });
  assert.deepEqual(editorTimes(D, undefined, undefined).source, 'default');
  assert.equal(nightFrom(D, editorTimes(D)).hours, 7.5);
  assert.equal(hhmm(at(D, '05:07')), '05:07');
});

test('sleep editor writes: times → hours everywhere; hours-only entry clears times; refusals', () => {
  const D = back(2);
  const n = setDaySleepTimes(D, { bed: '23:15', wake: '06:50' });
  assert.equal(n.hours, 7 + 35 / 60);
  const rec = get('days', D);
  assert.equal(rec.sleepH, n.hours);
  assert.equal(rec.sleepBed, n.bed);
  assert.equal(rec.sleepWake, n.wake);
  const s = readDay(D).sleep;
  assert.equal(s.hours, n.hours);
  assert.equal(s.manual, true);
  assert.equal(s.bed, n.bed);
  assert.deepEqual(sleepEditorTimes(D), { bed: '23:15', wake: '06:50', shift: 0, source: 'times' });
  // after midnight, same morning
  setDaySleepTimes(D, { bed: '00:40', wake: '07:10' });
  assert.equal(readDay(D).sleep.hours, 6.5);
  assert.equal(dayKey(get('days', D).sleepBed), D);
  // the goodnight/wake fields are not touched
  put('days', { ...get('days', D), wake: at(D, '07:12') });
  setDaySleepTimes(D, { bed: '22:00', wake: '06:00' });
  assert.equal(get('days', D).wake, at(D, '07:12'));
  // voice / screenshot hours replace the times
  setDaySleep(D, { hours: 6 });
  assert.equal(get('days', D).sleepBed, null);
  assert.equal(sleepEditorTimes(D).source, 'hours');
  assert.deepEqual(sleepEditorTimes(D), { bed: '01:12', wake: '07:12', shift: 0, source: 'hours' });
  // too long (bed 12:00 the day before → wake 07:00 = 19 h) and future wake-up
  assert.throws(
    () => setDaySleepTimes(D, { bed: '12:00', wake: '07:00' }),
    (e) => e instanceof DayEditError && e.code === 'sleepLong',
  );
  assert.throws(
    () => setDaySleepTimes(today, { bed: '23:00', wake: '23:59', shift: 1 }),
    (e) => e instanceof DayEditError && e.code === 'sleepFuture',
  );
  clearDaySleep(D);
  assert.equal(get('days', D).sleepWake, null);
  assert.equal(readDay(D).sleep.hours === null || readDay(D).sleep.hours > 0, true);
  assert.ok(bg['day.err.sleepLong'] && en['day.err.sleepFuture']);
});

test('label → form: per-100 g strings with a decimal comma, name, unknown fields left alone', () => {
  const r = labelToForm({ name: 'Овесени ядки', kcal: 372, p: 13.5, f: 7, c: 58.7, fib: 10, salt: 0.02 }, 'bg');
  assert.equal(r.err, null);
  assert.deepEqual(r.v, { name: 'Овесени ядки', kcal: '372', p: '13,5', f: '7', c: '58,7', fib: '10', salt: '0,02' });
  assert.deepEqual(r.filled, ['name', 'kcal', 'p', 'c', 'f', 'fib', 'salt']);
  assert.equal(labelToForm({ kcal: 54.6, p: 3.333 }, 'en').v.p, '3.33');
  assert.equal(labelToForm({ kcal: 54.6, p: 3.333 }, 'en').v.kcal, '55');
  // fibre/salt not on the label → not filled (stay "unknown")
  const part = labelToForm({ name: null, kcal: 64, p: 3.2, f: 3.6, c: 4.7, fib: null, salt: null });
  assert.deepEqual(part.filled, ['kcal', 'p', 'c', 'f']);
  assert.equal('fib' in part.v, false);
  assert.equal(formNum(0.125, 'salt', 'bg'), '0,13');
});

test('label → form: unreadable and implausible readings pre-fill nothing but the name', () => {
  assert.equal(labelToForm(null).err, 'unreadable');
  assert.equal(labelToForm({ name: 'X' }).err, 'unreadable');
  assert.deepEqual(labelToForm({ name: 'X' }).v, { name: 'X' });
  // kcal the macros cannot explain ("Nutella 5 kcal")
  const bad = labelToForm({ name: 'Nutella', kcal: 5, p: 6.3, f: 30.9, c: 57.5 });
  assert.equal(bad.err, 'implausible');
  assert.deepEqual(bad.v, { name: 'Nutella' });
  assert.equal(labelToForm({ kcal: 300, p: 60, f: 30, c: 30 }).err, 'implausible'); // П+В+М > 100 g
  assert.equal(labelToForm({ kcal: 950, p: 0, f: 100, c: 0 }).err, 'implausible');
  assert.equal(labelToForm({ kcal: 100, p: -1, f: 1, c: 1 }).err, 'implausible');
  // the values that pass also pass the form's own validation
  const ok = labelToForm({ kcal: 884, p: 0, f: 100, c: 0, salt: 0 });
  assert.equal(ok.err, null);
});

test('per-phone daily limit for picture reads', () => {
  assert.equal(VISION_PER_DAY, 20);
  assert.equal(visionLeft(null, '2026-10-28'), 20);
  let rec = null;
  for (let i = 0; i < 20; i++) rec = visionCounted(rec, '2026-10-28');
  assert.deepEqual(rec, { day: '2026-10-28', n: 20 });
  assert.equal(visionLeft(rec, '2026-10-28'), 0);
  assert.equal(visionLeft(rec, '2026-10-29'), 20); // a new day starts from zero
  assert.deepEqual(visionCounted(rec, '2026-10-29'), { day: '2026-10-29', n: 1 });
  assert.ok(bg['label.err.limit'] && bg['label.err.offline'] && bg['label.err.unreadable']);
});
