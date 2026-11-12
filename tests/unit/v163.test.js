// 1.6.3: free workout („Започни празна тренировка“) and four gym machines.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { EXERCISES, MUSCLE_GROUPS } from '../../src/data/exercises.js';
import { CUES } from '../../src/data/cues.js';
import { TECHNIQUE } from '../../src/data/technique.js';
import { setLang, t } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';
import { logsKg } from '../../src/features/workouts/logic.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

const byId = (/** @type {string} */ id) => EXERCISES.find((e) => e.id === id);

const NEW_MACHINES = ['leg_extension', 'seated_ab_crunch', 'hip_abductor', 'hip_adductor'];

test('1.6.3 machines: four new gym machines, kg, muscles, unique names; Уред lists them with lying leg curl', async () => {
  const muscles = new Set(Object.values(MUSCLE_GROUPS).flat());
  assert.equal(EXERCISES.length, 66);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, 66, 'unique ids');
  const expect = {
    leg_extension: { bg: 'Разгъване за предно бедро', en: 'Leg Extension', primary: ['quads'] },
    seated_ab_crunch: { bg: 'Коремни преси на уред', en: 'Seated Ab Crunch Machine', primary: ['core'] },
    hip_abductor: { bg: 'Абдуктор на уред', en: 'Hip Abductor Machine', primary: ['glutes'] },
    hip_adductor: { bg: 'Аддуктор на уред', en: 'Hip Adductor Machine', primary: ['adductors'] },
  };
  for (const id of NEW_MACHINES) {
    const e = byId(id);
    assert.ok(e, id);
    assert.equal(e.name.bg, expect[id].bg);
    assert.equal(e.name.en, expect[id].en);
    assert.doesNotMatch(e.name.bg, /[A-Za-z]/, `${id} names`);
    assert.equal(e.equipment, 'machine');
    assert.deepEqual(e.place, ['gym']);
    assert.equal(e.weighted, true);
    assert.ok(logsKg(e), `${id} logs kg`);
    assert.deepEqual(e.primary, expect[id].primary);
    assert.ok(e.primary.length && [...e.primary, ...e.secondary].every((m) => muscles.has(m)), `${id} muscles`);
    assert.ok(e.rest > 0 && e.met > 0, `${id} rest/met`);
  }
  assert.ok(byId('single_leg_hip_thrust'), 'single-leg hip thrust already in the library');
  assert.ok(byId('lying_leg_curl'));
  const machine = EXERCISES.filter((e) => e.equipment === 'machine').map((e) => e.id);
  for (const id of [...NEW_MACHINES, 'lying_leg_curl']) assert.ok(machine.includes(id), `${id} in Уред`);
  const { kgStep } = await import('../../src/features/workouts/logic.js');
  for (const id of NEW_MACHINES) assert.equal(kgStep(byId(id), 2.5), 2.5, `${id}: Profile kg step`);
  const bgNames = EXERCISES.map((e) => String(e.name.bg).toLowerCase());
  assert.equal(new Set(bgNames).size, bgNames.length, 'unique Bulgarian names');
  assert.ok(MUSCLE_GROUPS.legs.includes('adductors'));
  assert.equal(bg['muscle.adductors'], 'Вътрешно бедро');
  assert.equal(en['muscle.adductors'], 'Adductors');
});

test('1.6.3 machines: coach cues (bg + en, gender-neutral), no illustrations, YouTube search', async () => {
  const { techniqueSections, figureBlock } = await import('../../src/features/library/figure.js');
  const { youtubeUrl } = await import('../../src/features/library/api.js');
  await setLang('bg');
  for (const id of NEW_MACHINES) {
    assert.ok(!Object.hasOwn(TECHNIQUE, id), `${id}: no illustrated card`);
    assert.equal(figureBlock(id), '');
    const c = CUES[id];
    assert.ok(c && c.bg.length >= 3 && c.bg.length === c.en.length, `${id} cues`);
    assert.equal(c.video, undefined);
    for (const x of c.bg) {
      assert.doesNotMatch(x, /[A-Za-z]/, `${id}: English in bg`);
      assert.doesNotMatch(x, /изправена|застанала|легнала|седнала|адаптир/i, `${id}: gendered / „adapted“`);
    }
    for (const s of c.sources ?? []) {
      assert.match(s.url, /^https:\/\/(exrx\.net\/WeightExercises|www\.acefitness\.org\/resources\/everyone)\//, id);
      assert.match(s.text, /^(ExRx\.net|ACE)/, id);
    }
    assert.match(youtubeUrl(id), /results\?search_query=/, `${id}: YouTube technique search`);
    const html = String(techniqueSections(id));
    assert.ok(html.includes('Съвети от треньора'));
    if (c.sources?.length) assert.ok(html.includes(c.sources[0].url), `${id} sources shown`);
  }
});

test('1.6.3 library search matches the Bulgarian or English name and counts as a filter', async () => {
  await setLang('bg');
  const L = await import('../../src/features/library/views/list.js');
  L.resetFilters();
  L.filterActions.exq(/** @type {any} */ ({ value: 'разгъване' }));
  const ids = L.filtered().map((e) => e.id);
  assert.ok(ids.includes('leg_extension'));
  assert.ok(!ids.includes('lying_leg_curl'));
  assert.ok(L.filtering());
  assert.match(L.countLabel(), /от 66 упражнения/);
  L.filterActions.exq(/** @type {any} */ ({ value: 'Leg Curl' }));
  assert.deepEqual(
    L.filtered().map((e) => e.id),
    ['lying_leg_curl'],
  );
  L.resetFilters();
  assert.equal(L.filtering(), false);
  assert.equal(L.countLabel(), '66 упражнения');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'machine' } }));
  const machine = L.filtered().map((e) => e.id);
  for (const id of [...NEW_MACHINES, 'lying_leg_curl']) assert.ok(machine.includes(id), id);
  L.resetFilters();
});

test('1.6.3 free workout: start empty, add/remove, persists like a plan workout, empty is not saved', async () => {
  const { setKv, kv, all } = await import('../../src/core/store.js');
  const { startFreeWorkout, isFree, FREE_PLAN, activeWorkout, sessions, savePlanFrom, plans } =
    await import('../../src/features/workouts/api.js');
  const { planFromItems, itemFor } = await import('../../src/features/workouts/logic.js');
  const S = await import('../../src/features/workouts/session.js');
  S.discard();
  const n0 = sessions().length;
  const empty = startFreeWorkout();
  assert.equal(empty.planId, FREE_PLAN);
  assert.equal(isFree(empty), true);
  assert.deepEqual(empty.items, []);
  assert.equal(activeWorkout()?.id, empty.id);
  assert.equal(kv('active', null)?.id, empty.id, 'kept in kv active (survives a reload)');
  assert.equal(startFreeWorkout()?.id, empty.id, 'a second start resumes the running one');
  S.addExercise('nope');
  assert.equal(activeWorkout().items.length, 0);
  S.addExercise('leg_extension');
  S.addExercise('leg_extension');
  assert.equal(activeWorkout().items.length, 1, 'the same exercise is added once');
  assert.equal(activeWorkout().items[0].exId, 'leg_extension');
  assert.equal(activeWorkout().items[0].sets.length, 3);
  assert.equal(activeWorkout().items[0].sets[0].w, 10, 'default kg for a weighted exercise');
  S.addExercise('hip_abductor');
  assert.equal(activeWorkout().items.length, 2);
  assert.equal(kv('active', null).items.length, 2, 'add is persisted');
  S.removeExercise(1);
  assert.equal(
    activeWorkout()
      .items.map((/** @type {any} */ it) => it.exId)
      .join(),
    'leg_extension',
  );
  // finish with no done set → not saved
  assert.equal(S.finish(), null);
  assert.equal(activeWorkout(), null);
  assert.equal(sessions().length, n0, 'empty workout is not saved');
  // itemFor / planFromItems
  const it = itemFor('seated_ab_crunch', byId('seated_ab_crunch'), []);
  assert.equal(it.exId, 'seated_ab_crunch');
  assert.equal(it.sets.length, 3);
  assert.deepEqual(
    planFromItems([
      {
        exId: 'leg_extension',
        rest: 60,
        sets: [
          { w: 20, r: 12, done: true },
          { w: 25, r: 8, done: true },
          { w: 25, r: 10, done: false },
        ],
      },
      { exId: 'hip_abductor', rest: 60, sets: [{ w: 10, r: 10, done: false }] },
    ]),
    [{ exId: 'leg_extension', sets: 2, reps: 12, weight: 25, rest: 60 }],
  );
  void setKv;
  void all;
  void plans;
  void savePlanFrom;
});

test('1.6.3 free workout: a logged set is saved to history; optional save as a plan (once)', async () => {
  const { startFreeWorkout, isFree, sessions, savePlanFrom, plans, activeWorkout } =
    await import('../../src/features/workouts/api.js');
  const S = await import('../../src/features/workouts/session.js');
  S.discard();
  startFreeWorkout();
  S.addExercise('leg_extension');
  S.setWeight(0, 0, 30);
  S.setReps(0, 0, 12);
  S.toggleDone(0, 0);
  const beforePlans = plans().length;
  const s = S.finish();
  assert.ok(s && isFree(s));
  assert.equal(activeWorkout(), null);
  assert.equal(s.items.length, 1);
  assert.equal(s.items[0].sets.length, 1, 'unfinished sets dropped');
  assert.equal(s.items[0].sets[0].w, 30);
  assert.equal(s.items[0].sets[0].r, 12);
  assert.equal(s.setsDone, 1);
  assert.equal(s.partial, true, 'one set is a partial workout (minimum 3)');
  assert.ok(
    sessions().some((x) => x.id === s.id),
    'in history',
  );
  assert.equal(savePlanFrom(s, '  '), null, 'empty name');
  const p = savePlanFrom(s, '  Крака в залата  ');
  assert.ok(p);
  assert.equal(p.name, 'Крака в залата');
  assert.equal(p.builtin, false);
  assert.deepEqual(p.days, []);
  assert.equal(p.place, 'gym');
  assert.deepEqual(p.items, [{ exId: 'leg_extension', sets: 1, reps: 12, weight: 30, rest: 60 }]);
  assert.equal(plans().length, beforePlans + 1);
  assert.ok(plans().some((x) => x.id === p.id));
  const again = savePlanFrom(
    sessions().find((x) => x.id === s.id),
    'Друго име',
  );
  assert.equal(again?.id, p.id, 'saved once per session');
  assert.equal(plans().length, beforePlans + 1);
  assert.equal(savePlanFrom({ items: [] }, 'X'), null);
});

test("1.6.3: version, What's new (bg + en), CHANGELOG, no English in Bulgarian", async () => {
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.6.3');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.6.3');
  assert.equal(lock.packages[''].version, '1.6.3');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.6.3');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.6\.3\] – 2026-11-12 \(beta\)/);
  assert.equal(NOTES[0].v, '1.6.3');
  assert.deepEqual(
    NOTES[0].items.map(([, k]) => k),
    ['whatsNew.free163', 'whatsNew.machines163'],
  );
  await setLang('bg');
  assert.equal(t('workouts.free'), 'Започни празна тренировка');
  assert.equal(t('summary.savePlan'), 'Запази като план');
  for (const k of [...NOTES[0].items.map(([, k]) => k), 'workouts.free', 'summary.savePlan', 'library.search']) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(
      JSON.stringify(/** @type {any} */ (bg)[k]).replace(/\{\w+\}|"[fm]":/g, ''),
      /[A-Za-z]/,
      `English in bg ${k}`,
    );
  }
});
