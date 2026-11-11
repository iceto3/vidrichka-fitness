// 1.6.0: optional added weight on bodyweight exercises, kettlebell / band equipment, 16 new
// exercises and two ready home programs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES } from '../../src/data/exercises.js';
import { bestSet, byKg, detectPRs, logsKg, suggest, summarize } from '../../src/features/workouts/logic.js';

const byId = (/** @type {string} */ id) => EXERCISES.find((e) => e.id === id);

test('A: bodyweight exercises take an optional added weight (0 kg = bodyweight), weighted ones stay', () => {
  for (const id of ['bulgarian_split_squat', 'reverse_lunge', 'push_up', 'glute_bridge', 'bodyweight_squat']) {
    const ex = byId(id);
    assert.equal(ex?.weighted, false, `${id} is still a bodyweight exercise`);
    assert.equal(ex?.optionalWeight, true, `${id} has the optional kg field`);
    assert.equal(logsKg(ex), true);
  }
  for (const id of ['back_squat', 'db_shoulder_press', 'hip_thrust']) assert.equal(logsKg(byId(id)), true);
  for (const id of ['plank']) assert.equal(logsKg(byId(id)), false, `${id}: reps / seconds only`);
  assert.equal(logsKg(undefined), true, 'unknown exercises as before');
  // no separate weighted variants of the same exercise
  const names = EXERCISES.map((e) => e.name.en.toLowerCase());
  assert.equal(names.filter((n) => /bulgarian split squat/.test(n)).length, 1);
  assert.equal(names.filter((n) => /^reverse lunge/.test(n)).length, 1);
});

test('A: Bulgarian split squat – first set 0 kg, later sets 4 kg: volume, best set, PR, nudge', () => {
  const ex = byId('bulgarian_split_squat');
  const exById = () => ex;
  const it = {
    exId: 'bulgarian_split_squat',
    target: { sets: 3, reps: 12 },
    sets: [
      { w: 0, r: 12, done: true },
      { w: 4, r: 12, done: true },
      { w: 4, r: 10, done: true },
    ],
  };
  assert.equal(summarize([/** @type {any} */ (it)], exById).volume, 88, 'the added kilos count, 0 kg adds nothing');
  const hist = [{ id: 'a', endedAt: 1, items: [{ ...it, sets: [{ w: 0, r: 12, done: true }] }] }];
  assert.deepEqual(bestSet(/** @type {any} */ (hist), it.exId, logsKg(ex)), { w: 0, r: 12, at: 1 });
  const prs = detectPRs([/** @type {any} */ (it)], /** @type {any} */ (hist), exById);
  assert.equal(prs.length, 1, '4 kg beats bodyweight');
  assert.equal(prs[0].w, 4);
  // shown by reps while only bodyweight was used, by kilos once some weight was added
  assert.equal(byKg(ex, [{ w: 0 }, { w: 0 }]), false);
  assert.equal(byKg(ex, [{ w: 0 }, { w: 4 }]), true);
  assert.equal(byKg(byId('back_squat'), [{ w: 0 }]), true);
  assert.deepEqual(suggest([{ w: 0, r: 12, done: true }], 12, byKg(ex, [{ w: 0 }]), 2), { kind: 'reps', value: 13 });
  assert.deepEqual(suggest([{ w: 4, r: 12, done: true }], 12, byKg(ex, [{ w: 4 }]), 2), { kind: 'weight', value: 6 });
});

test('A: the kg column is shown for optional-weight exercises (active workout, plan editor)', async () => {
  const { readFileSync } = await import('node:fs');
  const active = readFileSync('src/features/workouts/views/active.js', 'utf8');
  assert.match(active, /weighted = logsKg\(ex\)/);
  const editor = readFileSync('src/features/workouts/views/editor.js', 'utf8');
  assert.match(editor, /k !== 'weight' \|\| logsKg\(exById\(it\.exId\)\)/);
});

const NEW = [
  'kb_swing',
  'band_lateral_walk',
  'knee_push_up',
  'db_bent_over_row',
  'one_arm_db_row',
  'lying_db_french_press',
  'cross_body_crunch',
  'single_leg_hip_thrust',
  'single_leg_rdl',
  'band_glute_kickback',
  'band_abductor_kick',
  'barbell_row',
  'front_raise',
  'overhead_triceps_extension',
  'hammer_curl',
  'kb_knee_tuck_situp',
];

test('B+C: 16 new exercises with stable ids, complete data, kettlebell / band equipment', async () => {
  const { MUSCLE_GROUPS } = await import('../../src/data/exercises.js');
  const muscles = new Set(Object.values(MUSCLE_GROUPS).flat());
  assert.ok(EXERCISES.length >= 36); // 1.6.1: + the kettlebell list (v161.test.js)
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, EXERCISES.length, 'unique ids');
  for (const id of NEW) {
    const e = byId(id);
    assert.ok(e, id);
    assert.ok(e.name.en && typeof e.name.bg === 'string' && !/[A-Za-z]/.test(e.name.bg), `${id} names`);
    assert.ok(e.place.includes('home'), `${id} at home`);
    assert.ok(e.primary.length && [...e.primary, ...e.secondary].every((m) => muscles.has(m)), `${id} muscles`);
    assert.ok(e.rest > 0 && e.met > 0, `${id} rest/met`);
    assert.ok(['reps', 'perLeg', 'perSide', undefined].includes(e.unit), `${id} unit`);
  }
  // distinct from the similar library exercises, no weighted variants
  for (const [a, b] of [
    ['single_leg_hip_thrust', 'hip_thrust'],
    ['hammer_curl', 'biceps_curl'],
    ['band_glute_kickback', 'cable_kickback'],
  ])
    assert.notEqual(byId(a)?.name.bg, byId(b)?.name.bg);
  assert.equal(byId('kb_swing')?.equipment, 'kettlebell');
  assert.equal(byId('kb_knee_tuck_situp')?.equipment, 'kettlebell');
  for (const id of ['band_lateral_walk', 'band_glute_kickback', 'band_abductor_kick'])
    assert.equal(byId(id)?.equipment, 'band');
  for (const id of ['knee_push_up', 'single_leg_hip_thrust', 'single_leg_rdl']) {
    assert.equal(byId(id)?.weighted, false);
    assert.equal(logsKg(byId(id)), true, `${id} optional kg`);
  }
  assert.equal(byId('one_arm_db_row')?.unit, 'perSide');
  assert.equal(byId('cross_body_crunch')?.unit, 'perSide');
  assert.equal(byId('single_leg_rdl')?.unit, 'perLeg');
});

test('B: equipment labels (bg + en), filter list and icons', async () => {
  const bg = (await import('../../src/data/i18n/bg.js')).default;
  const en = (await import('../../src/data/i18n/en.js')).default;
  const { EQUIPMENT } = await import('../../src/features/library/api.js');
  const { PATHS } = await import('../../src/ui/icons.js');
  for (const e of EXERCISES) assert.ok(EQUIPMENT.includes(e.equipment), `${e.id}: ${e.equipment}`);
  for (const q of ['all', ...EQUIPMENT]) assert.ok(bg[`equip.${q}`] && en[`equip.${q}`], q);
  assert.equal(bg['equip.kettlebell'], 'Пудовка');
  assert.equal(bg['equip.band'], 'Ластик');
  assert.equal(en['equip.kettlebell'], 'Kettlebell');
  assert.ok(bg['unit.perSide'] && en['unit.perSide']);
  assert.ok(PATHS.kettlebell && PATHS.band);
});

test('C: new exercises show the coach cues (bg/en) and a safe icon instead of a missing card / drawing', async () => {
  const { CUES } = await import('../../src/data/cues.js');
  const { TECHNIQUE } = await import('../../src/data/technique.js');
  const { techniqueSections, figureBlock, loadFigure } = await import('../../src/features/library/figure.js');
  const { exThumb } = await import('../../src/features/library/thumb.js');
  const { youtubeUrl } = await import('../../src/features/library/api.js');
  const { setLang } = await import('../../src/core/i18n.js');
  for (const id of EXERCISES.map((e) => e.id)) {
    if (Object.hasOwn(TECHNIQUE, id)) continue;
    const c = CUES[id];
    assert.ok(c && c.bg.length >= 2 && c.bg.length === c.en.length, `${id} cues`);
    assert.equal(figureBlock(id), '', `${id}: no drawing block`);
    assert.deepEqual(await loadFigure(id), [], `${id}: no figure import`);
    assert.match(String(exThumb(id)), /^<svg class="exfb"/, `${id}: equipment icon`);
    await setLang('bg');
    assert.ok(String(techniqueSections(id)).includes(c.bg[0].slice(0, 12)), `${id} bg cues`);
    await setLang('en');
    assert.match(String(techniqueSections(id)), /Coach/);
  }
  await setLang('bg');
  // videos: the coach's own, one per exercise; the wrong duplicate link of the abductor kicks is left out
  const vids = Object.entries(CUES).filter(([, c]) => c.video);
  for (const [id, c] of vids) {
    assert.match(c.video ?? '', /^https:\/\/www\.youtube\.com\/watch\?v=[\w-]{11}$/, id);
    assert.equal(youtubeUrl(id), c.video);
  }
  assert.equal(new Set(vids.map(([, c]) => c.video)).size, vids.length, 'no video used twice');
  assert.equal(CUES.band_abductor_kick.video, undefined);
  assert.equal(CUES.kb_swing.video, undefined);
  assert.match(youtubeUrl('hip_thrust'), /results\?search_query=/);
});

test('D: two built-in home plans – Day 1 / Day 2 full body, items in the coach order, all resolve', async () => {
  const { PLANS } = await import('../../src/data/workouts.js');
  assert.deepEqual(
    PLANS.map((p) => p.id),
    ['plan_leg_day', 'plan_upper_body', 'plan_home_full', 'plan_home_day1', 'plan_home_day2'],
  );
  const d1 = PLANS.find((p) => p.id === 'plan_home_day1');
  const d2 = PLANS.find((p) => p.id === 'plan_home_day2');
  for (const p of [d1, d2]) {
    assert.ok(p?.builtin && p.place === 'home', p?.id);
    assert.equal(p?.items.length, 11);
    assert.deepEqual(p?.sub, { en: 'At home', bg: 'В домашни условия' });
    assert.doesNotMatch(JSON.stringify(p), /Ралица/);
    for (const it of p?.items ?? []) {
      assert.ok(byId(it.exId), `${p?.id}: ${it.exId}`);
      assert.ok(it.rest >= 90, `${p?.id}: ${it.exId} rest`);
      if (!logsKg(byId(it.exId))) assert.equal(it.weight, 0, `${p?.id}: ${it.exId} reps only`);
    }
  }
  assert.deepEqual(d1?.name, { en: 'Day 1 Full Body', bg: 'Ден 1 цяло тяло' });
  assert.deepEqual(d2?.name, { en: 'Day 2 Full Body', bg: 'Ден 2 цяло тяло' });
  const row = (/** @type {any} */ i) => `${i.exId} ${i.sets}x${i.reps} ${i.weight}`;
  assert.deepEqual(d1?.items.map(row), [
    'back_squat 4x12 20',
    'reverse_lunge 3x12 6',
    'kb_swing 3x15 10',
    'band_lateral_walk 3x10 0',
    'knee_push_up 3x10 0',
    'db_bent_over_row 3x10 6',
    'one_arm_db_row 3x12 8',
    'lying_db_french_press 3x12 4',
    'lateral_raise 3x12 4',
    'db_shoulder_press 3x12 5',
    'cross_body_crunch 3x10 0',
  ]);
  assert.deepEqual(d2?.items.map(row), [
    'bulgarian_split_squat 3x12 4',
    'single_leg_hip_thrust 3x12 0',
    'single_leg_rdl 3x12 0',
    'band_glute_kickback 3x15 0',
    'band_abductor_kick 3x15 0',
    'barbell_row 3x12 15',
    'lateral_raise 3x12 4',
    'front_raise 3x15 4',
    'overhead_triceps_extension 3x12 4',
    'hammer_curl 3x15 4',
    'kb_knee_tuck_situp 3x12 4',
  ]);
  // scheduled on free weekdays (Tue / Fri: no clash with the example plans, 24 h+ rest between)
  const taken = PLANS.filter((p) => !p.id.startsWith('plan_home_day')).flatMap((p) => p.days);
  for (const p of [d1, d2]) for (const d of p?.days ?? []) assert.ok(!taken.includes(d), `${p?.id} day ${d}`);
  assert.deepEqual([d1?.days, d2?.days], [[1], [4]]);
});

test('D: existing installs get the two new plans once, deleted ones are not re-added', async () => {
  const { readFileSync } = await import('node:fs');
  const api = readFileSync('src/features/workouts/api.js', 'utf8');
  assert.match(api, /PLANS\.filter\(\(p\) => !seeded\.includes\(p\.id\)\)/);
});

test("1.6.0: version, What's new (bg + en), CHANGELOG, no English in Bulgarian", async () => {
  const { readFileSync } = await import('node:fs');
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  const bg = (await import('../../src/data/i18n/bg.js')).default;
  const en = (await import('../../src/data/i18n/en.js')).default;
  assert.equal(JSON.parse(readFileSync('package.json', 'utf8')).version, '1.6.0');
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'));
  assert.equal(lock.version, '1.6.0');
  assert.equal(lock.packages[''].version, '1.6.0');
  const { APP_VERSION } = await import('../../src/core/version.js');
  assert.equal(APP_VERSION, '1.6.0');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.6\.0\] – 2026-11-11/);
  assert.equal(NOTES[0].v, '1.6.0');
  assert.equal(NOTES[0].items.length, 3);
  const keys = [
    ...NOTES[0].items.map(([, k]) => k),
    'equip.kettlebell',
    'equip.band',
    'equip.all',
    'library.equipment',
    'library.coachVideo',
    'technique.cues',
    'unit.perSide',
  ];
  for (const k of keys) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(String(/** @type {any} */ (bg)[k]).replace(/\{\w+\}/g, ''), /[A-Za-z]/, `English in bg ${k}`);
  }
  // Bulgarian cues and names have no English either
  const { CUES } = await import('../../src/data/cues.js');
  for (const [id, c] of Object.entries(CUES)) for (const x of c.bg) assert.doesNotMatch(x, /[A-Za-z]/, `${id}: ${x}`);
});
