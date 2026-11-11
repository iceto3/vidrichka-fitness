// 1.6.1: the whole kettlebell list, „Хранителни добавки“ (creatine moves there) and body
// measurements by gender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, MUSCLE_GROUPS } from '../../src/data/exercises.js';
import { CUES } from '../../src/data/cues.js';
import { TECHNIQUE } from '../../src/data/technique.js';
import { logsKg } from '../../src/features/workouts/logic.js';

const byId = (/** @type {string} */ id) => EXERCISES.find((e) => e.id === id);
const kb = (/** @type {any} */ e) => e.equipment === 'kettlebell' || !!e.alt?.includes('kettlebell');

const NEW_KB = [
  'kb_one_arm_swing',
  'kb_sumo_deadlift',
  'kb_good_morning',
  'kb_goblet_squat',
  'kb_sumo_squat',
  'walking_lunge',
  'lateral_lunge',
  'curtsy_lunge',
  'step_up',
  'calf_raise',
  'kb_gorilla_row',
  'kb_high_pull',
  'kb_one_arm_press',
  'kb_push_press',
  'kb_floor_press',
  'kb_floor_pullover',
  'kb_halo',
  'russian_twist',
  'kb_windmill',
  'kb_plank_pull_through',
  'kb_suitcase_carry',
  'kb_farmer_walk',
  'kb_turkish_get_up',
  'kb_clean',
  'kb_thruster',
  'kb_snatch',
];
const REUSED = [
  'kb_swing',
  'romanian_deadlift',
  'single_leg_rdl',
  'glute_bridge',
  'hip_thrust',
  'reverse_lunge',
  'bulgarian_split_squat',
  'one_arm_db_row',
  'biceps_curl',
  'hammer_curl',
  'lying_db_french_press',
  'lateral_raise',
  'dead_bug',
];

test('1.6.1 kettlebell: 26 new exercises + 13 library ones; the filter lists all 40 (with the 1.6.0 sit-up)', () => {
  const muscles = new Set(Object.values(MUSCLE_GROUPS).flat());
  assert.equal(EXERCISES.length, 62);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, 62, 'unique ids');
  for (const id of NEW_KB) {
    const e = byId(id);
    assert.ok(e, id);
    assert.ok(e.name.en && typeof e.name.bg === 'string' && !/[A-Za-z]/.test(e.name.bg), `${id} names`);
    assert.ok(e.place.includes('home'), `${id} at home`);
    assert.ok([...e.primary, ...e.secondary].every((m) => muscles.has(m)) && e.primary.length, `${id} muscles`);
    assert.ok(e.rest > 0 && e.met > 0, `${id} rest/met`);
    assert.ok(kb(e), `${id} kettlebell`);
    assert.ok(logsKg(e), `${id} logs kg (0 kg = bodyweight where optional)`);
  }
  for (const id of REUSED) assert.ok(byId(id) && kb(byId(id)), `${id} also with a kettlebell`);
  const list = EXERCISES.filter(kb).map((e) => e.id);
  assert.equal(list.length, 40);
  assert.ok(list.includes('kb_knee_tuck_situp'), 'the 1.6.0 sit-up stays');
  // no confusing duplicates of what the library had (one Bulgarian squat, one RDL, one hip thrust…)
  const bgNames = EXERCISES.map((e) => String(e.name.bg).toLowerCase());
  assert.equal(new Set(bgNames).size, bgNames.length, 'unique Bulgarian names');
  for (const re of [/български клек/, /румънска/, /^хип тръст$/, /глутеус мост|седалищен мост/, /^напади назад$/])
    assert.ok(bgNames.filter((n) => re.test(n)).length <= 1, String(re));
  // side-alternating moves count per side, carries in seconds
  for (const id of ['kb_one_arm_swing', 'kb_turkish_get_up', 'kb_windmill', 'kb_snatch', 'kb_clean', 'russian_twist'])
    assert.equal(byId(id)?.unit, 'perSide', id);
  for (const id of ['kb_farmer_walk', 'kb_suitcase_carry']) assert.equal(byId(id)?.unit, 'sec', id);
  // optional weight for the bodyweight moves (no weighted variants)
  for (const id of [
    'walking_lunge',
    'lateral_lunge',
    'curtsy_lunge',
    'step_up',
    'calf_raise',
    'russian_twist',
    'dead_bug',
  ])
    assert.ok(byId(id)?.weighted === false && byId(id)?.optionalWeight, id);
});

test('1.6.1 kettlebell: coach cues (bg + en, gender-neutral), honest sources, no illustrations', async () => {
  const { techniqueSections, figureBlock } = await import('../../src/features/library/figure.js');
  const { setLang } = await import('../../src/core/i18n.js');
  const { youtubeUrl } = await import('../../src/features/library/api.js');
  await setLang('bg');
  for (const id of NEW_KB) {
    assert.ok(!Object.hasOwn(TECHNIQUE, id), `${id}: no illustrated card yet`);
    assert.equal(figureBlock(id), '');
    const c = CUES[id];
    assert.ok(c && c.bg.length >= 3 && c.bg.length === c.en.length, `${id} cues`);
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
  // no ExRx / ACE page where none matches (gorilla row, curtsy lunge, plank pull-through)
  for (const id of ['kb_gorilla_row', 'curtsy_lunge', 'kb_plank_pull_through'])
    assert.equal(CUES[id].sources, undefined);
  assert.match(CUES.kb_halo.sources?.[0].url ?? '', /acefitness\.org\/.+\/394\/halo\//);
});

test('1.6.1 kettlebell: the equipment filter and the exercise page include alt equipment', async () => {
  const { readFileSync } = await import('node:fs');
  assert.match(readFileSync('src/features/library/views/list.js', 'utf8'), /e\.alt\?\.includes\(f\.equip\)/);
  assert.match(readFileSync('src/features/library/views/detail.js', 'utf8'), /\.\.\.\(e\.alt \?\? \[\]\)/);
});
