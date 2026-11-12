// 1.6.2 tester fixes on 1.6.1-beta: the library count follows the filters, supplement
// streaks shown from day 1, every measurement opens a working form, 4 kg of added weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

test('1.6.2 fix 1: the Exercises header count follows the active filters', async () => {
  await setLang('bg');
  const L = await import('../../src/features/library/views/list.js');
  L.resetFilters();
  assert.equal(L.countLabel(), '66 упражнения');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'kettlebell' } }));
  assert.equal(L.filtered().length, 40);
  assert.equal(L.countLabel(), '40 от 66 упражнения');
  L.filterActions.place(/** @type {any} */ ({ dataset: { v: 'gym' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 66 упражнения`);
  L.filterActions.group(/** @type {any} */ ({ dataset: { v: 'glutes' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 66 упражнения`);
  L.resetFilters();
  assert.equal(L.countLabel(), '66 упражнения');
  await setLang('en');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'band' } }));
  assert.match(L.countLabel(), /^\d+ of 66 exercises$/);
  L.resetFilters();
  const src = readFileSync('src/features/library/views/list.js', 'utf8');
  assert.match(src, /countLabel\(\)/);
});

test('1.6.2 fix 2: the supplement streak is shown on every row, from day 1 (creatine too)', async () => {
  await setLang('bg');
  const { setKv, put } = await import('../../src/core/store.js');
  const { dayKey, addDays, parseDay } = await import('../../src/core/dates.js');
  const sa = await import('../../src/features/food/supps-api.js');
  const { suppsCard } = await import('../../src/features/food/views/supps.js');
  const today = dayKey();
  const back = (/** @type {number} */ n) => dayKey(addDays(parseDay(today), -n));
  setKv('supplements', undefined);
  setKv('creatineDose', undefined);
  put('days', { id: today });
  put('days', { id: back(1) });
  sa.addReady('vitd');
  const html0 = String(suppsCard(today));
  assert.match(html0, /suppstreak" data-n="0">🔥 0 дни подред/);
  // day 1: „Взех“ on creatine → „🔥 1 ден подред“ on the creatine row
  const cr = sa.supplements()[0];
  sa.setTaken(cr, today, cr.dose);
  const html1 = String(suppsCard(today));
  const crRow = html1.slice(html1.indexOf('data-supp="creatine"'), html1.indexOf('data-supp="vitd"'));
  assert.match(crRow, /suppstreak on" data-n="1">🔥 1 ден подред/);
  // yesterday too → 2 days; vitamin D still 0 (its own streak)
  sa.setTaken(cr, back(1), 3);
  const html2 = String(suppsCard(today));
  assert.match(html2.slice(html2.indexOf('data-supp="creatine"')), /🔥 2 дни подред/);
  assert.match(html2.slice(html2.indexOf('data-supp="vitd"')), /data-n="0"/);
  // the day view of yesterday counts up to that day
  assert.match(String(suppsCard(back(1))).slice(0, 4000), /data-n="1"/);
  sa.setTaken(cr, today, null);
  sa.setTaken(cr, back(1), null);
});

test('1.6.2 fix 3: every measurement tile (both gender sets) opens a sheet with working inputs + save', async () => {
  await setLang('bg');
  const { MEASURE_SETS, MEASURE_FIELDS } = await import('../../src/data/measurements.js');
  const { ALL_TILES, measureRow, shownTiles, tileOf } = await import('../../src/features/body/fields.js');
  const { chartHtml } = await import('../../src/features/body/views/body.js');
  const { all, put, setKv } = await import('../../src/core/store.js');
  const { dayKey } = await import('../../src/core/dates.js');
  const keys = [...new Set([...MEASURE_SETS.common, ...MEASURE_SETS.m, ...MEASURE_SETS.f, 'belly', 'bodyfat'])];
  assert.deepEqual([...keys].sort(), ALL_TILES.map((x) => x.id).sort(), 'every tile covered');
  const sample = { kg: '62.5', cm: '55', '%': '24' };
  for (const id of keys) {
    const tile = /** @type {any} */ (ALL_TILES.find((x) => x.id === id));
    const first = tile.fields[0];
    assert.equal(tileOf(first)?.id, id);
    if (first === 'weight') continue; // weight with no data keeps its own empty state („Добави тегло“)
    const out = String(chartHtml(first, { typed: {}, bad: {} }));
    for (const f of tile.fields) {
      assert.match(out, new RegExp(`id="q_${f}"[^>]*data-input="qv"[^>]*data-k="${f}"`), `${id}: input ${f}`);
      const cue = /** @type {any} */ (MEASURE_FIELDS.find((x) => x.id === f)).hint.bg;
      assert.ok(out.includes(cue), `${id}: where-to-measure cue for ${f}`);
    }
    assert.match(out, /data-act="qsave"/, `${id}: save button`);
    assert.ok(out.includes(`<h2 class="h2">${bg[`measure.${id}`]}</h2>`), `${id}: title`);
    // typed values → a saved row with every field of the tile
    const typed = Object.fromEntries(tile.fields.map((/** @type {string} */ f) => [f, sample[tile.unit]]));
    const { row, bad } = measureRow(tile.fields, typed, dayKey(), 1);
    assert.deepEqual(bad, {}, id);
    for (const f of tile.fields) assert.equal(row?.[f], Number(sample[tile.unit]), `${id}: ${f} saved`);
  }
  // nothing typed / out of range → no row, inline error
  assert.equal(measureRow(['glutes'], {}, dayKey(), 1).row, null);
  assert.equal(measureRow(['glutes'], { glutes: '5' }, dayKey(), 1).bad.glutes.error, 'body.errRange');
  const errHtml = String(
    chartHtml('glutes', { typed: { glutes: '5' }, bad: measureRow(['glutes'], { glutes: '5' }, dayKey(), 1).bad }),
  );
  assert.match(errHtml, /class="ferr" id="qh_glutes" role="alert"/);
  // a saved glutes value stays after switching gender (and its tile stays visible)
  setKv('measureTiles', undefined);
  const { row } = measureRow(['glutes'], { glutes: '98' }, dayKey(), 2);
  put('measurements', /** @type {any} */ ({ id: 'm_glutes162', ...row }));
  const rows = all('measurements');
  assert.ok(shownTiles(undefined, 'f', rows).includes('glutes'));
  assert.ok(shownTiles(undefined, 'm', rows).includes('glutes'), 'men: kept visible because it has a value');
  assert.equal(all('measurements').find((r) => r.id === 'm_glutes162')?.glutes, 98);
  assert.match(String(chartHtml('glutes', { typed: {}, bad: {} })), /98[,.]0 см/);
});

test('1.6.2 fix 4: Bulgarian split squat – log 0 kg then 4 kg (± by 1 kg, or typed)', async () => {
  const { put } = await import('../../src/core/store.js');
  const { EXERCISES } = await import('../../src/data/exercises.js');
  const { clampKg, kgStep, logsKg } = await import('../../src/features/workouts/logic.js');
  const { activeWorkout, startWorkout } = await import('../../src/features/workouts/api.js');
  const S = await import('../../src/features/workouts/session.js');
  const bss = /** @type {any} */ (EXERCISES.find((e) => e.id === 'bulgarian_split_squat'));
  assert.ok(logsKg(bss));
  assert.equal(kgStep(bss, 2.5), 1, 'optional added weight: 1 kg steps');
  assert.equal(
    kgStep(
      EXERCISES.find((e) => e.id === 'back_squat'),
      2.5,
    ),
    2.5,
    'weighted: the Profile step',
  );
  assert.equal(
    kgStep(
      EXERCISES.find((e) => e.id === 'back_squat'),
      5,
    ),
    5,
  );
  assert.equal(
    kgStep(
      EXERCISES.find((e) => e.id === 'plank'),
      2.5,
    ),
    2.5,
  );
  for (const e of EXERCISES.filter((x) => x.optionalWeight && !x.weighted)) assert.equal(kgStep(e, 2.5), 1, e.id);
  assert.equal(clampKg('4'), 4);
  assert.equal(clampKg(4.5), 4.5, '0.5 kg resolution when typed');
  // a workout: set 1 at 0 kg (bodyweight), set 2 at 4 kg reached with + (as the stepper does)
  S.discard();
  put('plans', {
    id: 'plan_t162',
    name: 'T',
    days: [],
    place: 'home',
    items: [{ exId: 'bulgarian_split_squat', sets: 2, reps: 10, weight: 0, rest: 60 }],
  });
  startWorkout('plan_t162');
  S.setWeight(0, 0, 0);
  assert.deepEqual(
    activeWorkout().items[0].sets.map((/** @type {any} */ s) => s.w),
    [0, 0],
  );
  S.toggleDone(0, 0);
  for (let k = 0; k < 4; k++) {
    const cur = activeWorkout().items[0].sets[1].w;
    S.setWeight(0, 1, cur + 1 * kgStep(bss, 2.5)); // the „+“ button
  }
  assert.deepEqual(
    activeWorkout().items[0].sets.map((/** @type {any} */ s) => s.w),
    [0, 4],
  );
  S.setWeight(0, 1, 0);
  S.setWeight(0, 1, clampKg('4')); // typed „4“
  assert.equal(activeWorkout().items[0].sets[1].w, 4);
  S.discard();
  // the active workout and the plan editor use the per-exercise step
  const active = readFileSync('src/features/workouts/views/active.js', 'utf8');
  assert.match(active, /kgStep\(exById\(activeWorkout\(\)\.items\[i\]\.exId\), settings\(\)\.weightStep\)/);
  assert.match(readFileSync('src/features/workouts/views/editor.js', 'utf8'), /kgStep\(exById\(it\.exId\), st\)/);
});

test("1.6.2: What's new (bg + en), CHANGELOG, no English in Bulgarian", async () => {
  const en = (await import('../../src/data/i18n/en.js')).default;
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  // 1.6.3: the version moved on (asserted in v163.test.js); the 1.6.2 entry stays
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.6\.2\] – 2026-11-11/);
  const n162 = /** @type {any} */ (NOTES.find((n) => n.v === '1.6.2'));
  assert.deepEqual(
    n162.items.map((/** @type {any} */ [, k]) => k),
    ['whatsNew.count162', 'whatsNew.streak162', 'whatsNew.measure162', 'whatsNew.kg162'],
  );
  for (const k of [...n162.items.map((/** @type {any} */ [, k]) => k), 'library.countOf', 'supp.streak0']) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(
      JSON.stringify(/** @type {any} */ (bg)[k]).replace(/\{\w+\}|"[fm]":/g, ''),
      /[A-Za-z]/,
      `English in bg ${k}`,
    );
  }
});
