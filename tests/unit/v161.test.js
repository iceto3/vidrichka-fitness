// 1.6.1: the whole kettlebell list, „Хранителни добавки“ (creatine moves there) and body
// measurements by gender.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXERCISES, MUSCLE_GROUPS } from '../../src/data/exercises.js';
import { CUES } from '../../src/data/cues.js';
import { TECHNIQUE } from '../../src/data/technique.js';
import { readFileSync } from 'node:fs';
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
  assert.equal(EXERCISES.length, 66);
  assert.equal(new Set(EXERCISES.map((e) => e.id)).size, 66, 'unique ids');
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

// ——— „Хранителни добавки“ ———
import { get, put, setKv, kv } from '../../src/core/store.js';
import { addDays, dayKey, parseDay } from '../../src/core/dates.js';
import { setLang, t } from '../../src/core/i18n.js';
import { SUPP_KINDS } from '../../src/data/supplements.js';
import {
  clampDose,
  dayProtein,
  fieldOf,
  normalizeList,
  proteinOf,
  reminders,
  suppStreak,
} from '../../src/features/food/supps.js';
import { buildDay, withSuppProtein } from '../../src/features/day/logic.js';
import { planDay } from '../../src/features/daily/logic.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
const sa = await import('../../src/features/food/supps-api.js');
const { readDay } = await import('../../src/features/day/api.js');
const today = dayKey();
const back = (/** @type {number} */ n) => dayKey(addDays(parseDay(today), -n));
const clearSupps = () => {
  setKv('supplements', undefined);
  setKv('creatineDose', undefined);
};

test('1.6.1 supplements: the ready list, units, names in BG and EN', async () => {
  assert.deepEqual(Object.keys(SUPP_KINDS), [
    'creatine',
    'protein',
    'vitd',
    'omega3',
    'magnesium',
    'vitc',
    'iron',
    'zinc',
    'multi',
  ]);
  for (const [k, s] of Object.entries(SUPP_KINDS)) {
    assert.ok(['g', 'mg', 'IU', 'caps'].includes(s.unit), k);
    assert.ok(s.dose > 0 && s.dose <= s.max && s.step > 0, k);
    assert.ok(bg[`supp.${k}`] && en[`supp.${k}`], k);
  }
  await setLang('bg');
  assert.equal(t('supp.title'), 'Хранителни добавки');
  assert.equal(t('supp.protein'), 'Протеин на прах');
  assert.equal(t('supp.unit.caps'), 'капс.');
  for (const u of ['g', 'mg', 'IU', 'caps']) assert.ok(bg[`supp.unit.${u}`] && en[`supp.unit.${u}`]);
});

test('1.6.1 creatine migration: always on the list, its 1.4.2 dose and day field kept', () => {
  // before 1.6.1: no list, the last dose in kv `creatineDose`
  const l = normalizeList(undefined, 4.5);
  assert.equal(l.length, 1);
  assert.deepEqual(l[0], { id: 'creatine', kind: 'creatine', unit: 'g', dose: 4.5 });
  assert.equal(fieldOf(l[0]), 'creatineG', 'history stays in the 1.4.2 field');
  assert.equal(normalizeList(undefined, undefined)[0].dose, 3, 'never dosed → 3 g');
  // a stored list without creatine gets it back first; broken rows dropped
  const l2 = normalizeList(
    [
      { id: 'vitd', kind: 'vitd', unit: 'IU', dose: 1000 },
      { id: 'x', kind: 'nope' },
      null,
      { id: 'c_1', kind: 'custom', name: '  ' },
    ],
    undefined,
  );
  assert.deepEqual(
    l2.map((s) => s.id),
    ['creatine', 'vitd'],
  );
  // the app: an existing creatine history keeps counting – streak and day totals
  clearSupps();
  setKv('creatineDose', 5);
  for (const n of [1, 2, 3]) put('days', { id: back(n), creatineG: 5 });
  const cr = sa.supplements()[0];
  assert.equal(cr.dose, 5);
  assert.equal(sa.streak(cr, today), 3, 'streak from the 1.4.2 entries (today still open)');
  sa.setTaken(cr, today, cr.dose);
  assert.equal(get('days', today).creatineG, 5);
  assert.equal(readDay(today).creatine.suppG, 5, 'day creatine total as in 1.4.2');
  assert.equal(sa.streak(cr, today), 4);
  sa.setTaken(cr, today, null);
  assert.equal(get('days', today).creatineG, null);
  assert.equal(sa.removeSupp('creatine'), null, 'creatine stays on the list');
});

test('1.6.1 supplements: one-tap add, own supplement, dose memory, remove keeps history', () => {
  clearSupps();
  assert.ok(sa.readyToAdd().includes('vitd') && !sa.readyToAdd().includes('creatine'));
  const d = sa.addReady('vitd');
  assert.deepEqual(d, { id: 'vitd', kind: 'vitd', unit: 'IU', dose: 2000 });
  assert.equal(sa.addReady('vitd'), null, 'only once');
  assert.ok(!sa.readyToAdd().includes('vitd'));
  // dose memory: the last dose taken is offered next time
  sa.setTaken(d, today, 1000);
  assert.equal(get('days', today)[fieldOf(d)], 1000);
  assert.equal(sa.supplements().find((s) => s.id === 'vitd')?.dose, 1000);
  assert.equal(sa.taken(d, today), 1000);
  // creatine dose memory stays in its 1.4.2 key too
  sa.setTaken(sa.supplements()[0], today, 6);
  assert.equal(kv('creatineDose'), 6);
  assert.equal(sa.supplements()[0].dose, 6);
  sa.setTaken(sa.supplements()[0], today, null);
  // own supplement with a unit
  assert.equal(sa.addCustom('  ', 'mg', 5), null);
  assert.equal(sa.addCustom('Колаген', 'kg', 5), null);
  const c = /** @type {any} */ (sa.addCustom('Колаген', 'g', 10));
  assert.equal(c.kind, 'custom');
  assert.equal(sa.suppName(c), 'Колаген');
  assert.ok(c.id.startsWith('c_'));
  sa.setTaken(c, today, 12);
  assert.equal(sa.supplements().find((s) => s.id === c.id)?.dose, 12);
  // removing from the list keeps the ticked days (adding back brings the history back)
  const at = sa.supplements().findIndex((s) => s.id === 'vitd');
  const gone = /** @type {any} */ (sa.removeSupp('vitd'));
  assert.ok(!sa.supplements().some((s) => s.id === 'vitd'));
  assert.equal(get('days', today).sp_vitd, 1000);
  sa.restoreSupp(gone, at);
  assert.equal(sa.supplements()[at].id, 'vitd');
  // doses are clamped to the kind's range and precision
  assert.equal(clampDose(d, 1e9), 20000);
  assert.equal(clampDose(sa.supplements()[0], 3.04), 3);
  assert.equal(clampDose(d, -1), 0);
  sa.setTaken(d, today, null);
  sa.setTaken(c, today, null);
});

test('1.6.1 supplements: streak of consecutive days', () => {
  const s = { id: 'zinc', kind: 'zinc', unit: /** @type {const} */ ('mg'), dose: 10 };
  const recs = { [today]: { sp_zinc: 10 }, [back(1)]: { sp_zinc: 10 }, [back(2)]: {}, [back(3)]: { sp_zinc: 10 } };
  assert.equal(suppStreak(s, recs, today), 2);
  assert.equal(suppStreak(s, { [back(1)]: { sp_zinc: 10 }, [back(2)]: { sp_zinc: 5 } }, today), 2, 'today still open');
  assert.equal(suppStreak(s, { [back(2)]: { sp_zinc: 5 } }, today), 0, 'yesterday missed → 0');
});

test('1.6.1 protein powder counts toward the day’s protein (not kcal)', async () => {
  clearSupps();
  const p = /** @type {any} */ (sa.addReady('protein'));
  assert.equal(p.proteinPct, 75);
  assert.equal(proteinOf(p, 30), 22.5);
  assert.equal(proteinOf({ ...p, proteinPct: 80 }, 25), 20);
  assert.equal(proteinOf({ id: 'vitd', kind: 'vitd', unit: 'IU', dose: 1 }, 2000), 0);
  assert.equal(dayProtein([p], { sp_protein: 40 }), 30);
  // the day record gets `suppP`; day totals, stats and the diary add it
  const day = back(5);
  put('days', { id: day });
  sa.setTaken(p, day, 40);
  assert.equal(get('days', day).suppP, 30);
  const d = readDay(day);
  assert.equal(d.suppP, 30);
  assert.equal(d.totals?.p, 30, 'a day with only a shake has protein');
  assert.equal(d.totals?.kcal, 0);
  sa.updateSupp('protein', { proteinPct: 80 });
  sa.setTaken(/** @type {any} */ (sa.supplements().find((s) => s.id === 'protein')), day, 30);
  assert.equal(get('days', day).suppP, 24, 'recomputed with the edited %');
  sa.setTaken(p, day, null);
  assert.equal(get('days', day).suppP, null);
  assert.deepEqual(
    withSuppProtein({ kcal: 500, p: 20.25, c: 0, f: 0, fib: null, salt: null, sat: null, sug: null }, 22.5)?.p,
    42.8,
  );
  assert.equal(withSuppProtein(null, 0), null);
  const built = buildDay(
    { days: [{ id: today, suppP: 22.5 }], food: [{ id: 'f', date: today, kcal: 300, p: 20 }], sessions: [] },
    today,
  );
  assert.equal(built.totals?.p, 42.5);
  assert.equal(built.totals?.kcal, 300);
  const { computeStats } = await import('../../src/features/motivation/stats.js');
  const st = computeStats({
    sessions: [],
    food: [{ id: 'f', date: today, kcal: 300, p: 20 }],
    days: [{ id: today, suppP: 22.5 }],
    measurements: [],
    photos: [],
    goalAt: () => 3,
    waterGoal: 8,
  });
  assert.equal(st.todayProtein, 43);
});

test('1.6.1 supplement reminders: planned on the phone (no Worker change), skipped once taken', async () => {
  const list = normalizeList(
    [
      { id: 'creatine', kind: 'creatine', unit: 'g', dose: 3, remind: '08:30' },
      { id: 'vitd', kind: 'vitd', unit: 'IU', dose: 2000, remind: '25:00' },
      { id: 'omega3', kind: 'omega3', unit: 'caps', dose: 1, remind: '20:00' },
    ],
    undefined,
  );
  const r = reminders(list, (s) => s.id);
  assert.deepEqual(r, [
    { id: 'creatine', time: '08:30', field: 'creatineG', name: 'creatine' },
    { id: 'omega3', time: '20:00', field: 'sp_omega3', name: 'omega3' },
  ]);
  const cfg = /** @type {any} */ ({
    morning: false,
    protein: false,
    water: [],
    checkinAm: { on: false },
    checkinPm: { on: false },
    bedtime: { on: false },
    supps: r,
  });
  const slots = planDay(today, cfg, {});
  assert.deepEqual(
    slots.map((s) => [s.kind, s.group, s.route, s.skipIf?.[0], s.label]),
    [
      ['supp_creatine', 'supp_creatine', 'food?supps', 'creatineG', 'creatine'],
      ['supp_omega3', 'supp_omega3', 'food?supps', 'sp_omega3', 'omega3'],
    ],
  );
  const { plannedLocally, LOCAL_ONLY } = await import('../../src/features/daily/notify.js');
  assert.deepEqual(LOCAL_ONLY, ['photos']);
  assert.ok(plannedLocally('supp_omega3', true), 'with push on too – the Worker is not changed');
  assert.ok(!plannedLocally('water', true));
  assert.ok(plannedLocally('water', false));
  // the push Worker's kinds are untouched
  const pf = readFileSync('src/features/daily/push-format.js', 'utf8');
  assert.doesNotMatch(pf, /supp/);
  // texts: BG gendered, EN neutral
  assert.ok(bg['notif.supp.title'].includes('{supp}'));
  assert.ok(/** @type {any} */ (bg['notif.supp.body']).f && /** @type {any} */ (bg['notif.supp.body']).m);
});

test('1.6.1 Food: „Хранителни добавки“ card replaces the creatine card', () => {
  const diary = readFileSync('src/features/food/views/diary.js', 'utf8');
  assert.match(diary, /suppsCard\(view\.date\)/);
  assert.doesNotMatch(diary, /creatineCard/);
  const cards = readFileSync('src/features/day/views/cards.js', 'utf8');
  assert.doesNotMatch(cards, /export function creatineCard/);
});

// ——— Measurements by gender ———
import { MEASURE_FIELDS, MEASURE_SETS } from '../../src/data/measurements.js';
import {
  ALL_TILES,
  defaultTiles,
  fieldsOf,
  resetTiles,
  setTile,
  shownTiles,
  tileGroups,
} from '../../src/features/body/fields.js';

test('1.6.1 measurements: the sets by gender, every one with a BG name and a where-to-measure cue', async () => {
  assert.deepEqual(MEASURE_SETS.common, ['weight', 'waist', 'hips', 'chest', 'thigh', 'calves', 'arm']);
  assert.deepEqual(MEASURE_SETS.m, ['biceps', 'shoulders', 'neck', 'forearm']);
  assert.deepEqual(MEASURE_SETS.f, ['underbust', 'glutes', 'upperThigh']);
  const ids = new Set(ALL_TILES.map((x) => x.id));
  for (const id of [...MEASURE_SETS.common, ...MEASURE_SETS.m, ...MEASURE_SETS.f]) {
    assert.ok(ids.has(id), id);
    assert.ok(bg[`measure.${id}`] && en[`measure.${id}`], id);
  }
  for (const f of MEASURE_FIELDS) {
    assert.ok(f.hint.bg.length > 10 && f.hint.en.length > 10, f.id);
    assert.ok(bg[`measure.${f.id}`], f.id);
  }
  await setLang('bg');
  assert.equal(t('measure.biceps'), 'Бицепс в сгъвка');
  assert.equal(t('measure.underbust'), 'Подгръдна обиколка');
  assert.equal(t('measure.upperThigh'), 'Горна част на бедрото');
  assert.equal(t('measure.arm'), 'Мишници Л / Д');
  // the old fields keep their ids (saved values stay where they were)
  for (const id of [
    'weight',
    'waist',
    'belly',
    'hips',
    'thighL',
    'thighR',
    'chest',
    'underbust',
    'armL',
    'armR',
    'calves',
    'bodyfat',
  ])
    assert.ok(
      MEASURE_FIELDS.some((f) => f.id === id),
      id,
    );
});

test('1.6.1 measurements: defaults by gender (missing gender = women’s set)', () => {
  assert.deepEqual(shownTiles(undefined, 'm', []), [
    'weight',
    'waist',
    'hips',
    'thigh',
    'chest',
    'arm',
    'calves',
    'biceps',
    'shoulders',
    'neck',
    'forearm',
  ]);
  assert.deepEqual(shownTiles(undefined, 'f', []), [
    'weight',
    'waist',
    'hips',
    'thigh',
    'chest',
    'underbust',
    'arm',
    'calves',
    'glutes',
    'upperThigh',
  ]);
  assert.deepEqual(shownTiles(undefined, undefined, []), shownTiles(undefined, 'f', []));
  assert.ok(!shownTiles(undefined, 'f', []).includes('belly'), 'belly / body fat are extras');
  // the form gets both fields of a pair
  assert.deepEqual(
    fieldsOf(['weight', 'thigh']).map((f) => f.id),
    ['weight', 'thighL', 'thighR'],
  );
  const g = tileGroups('m');
  assert.deepEqual(g.mine, defaultTiles('m'));
  assert.ok(g.more.includes('underbust') && g.more.includes('belly') && !g.more.includes('biceps'));
});

test('1.6.1 measurements: migration – fields with saved values stay visible', () => {
  const rows = [{ id: 'm1', date: '2026-10-01', weight: 61, belly: 74, bodyfat: 24, underbust: 70 }];
  const shown = shownTiles(undefined, 'm', rows);
  for (const id of ['belly', 'bodyfat', 'underbust']) assert.ok(shown.includes(id), id);
});

test('1.6.1 measurements: hide / show / add from the other set, kept after a gender change', () => {
  const rows = [{ id: 'm1', date: '2026-10-01', weight: 61, belly: 74 }];
  let p = setTile(undefined, 'f', rows, 'neck', true); // add a men's one
  assert.equal(p.custom, true);
  assert.ok(shownTiles(p, 'f', rows).includes('neck'));
  p = setTile(p, 'f', rows, 'glutes', false); // hide a default
  p = setTile(p, 'f', rows, 'belly', false); // hide one with data (values stay saved)
  const mine = shownTiles(p, 'f', rows);
  assert.ok(!mine.includes('glutes') && !mine.includes('belly') && mine.includes('neck'));
  // the gender changes in the profile → the user's own set stays exactly the same
  assert.deepEqual(shownTiles(p, 'm', rows), mine);
  assert.ok(!shownTiles(p, 'm', rows).includes('biceps'));
  // weight can't be hidden; unknown ids are ignored
  assert.ok(shownTiles(setTile(p, 'f', rows, 'weight', false), 'f', rows).includes('weight'));
  assert.deepEqual(shownTiles(setTile(p, 'f', rows, 'nope', true), 'f', rows), mine);
  assert.deepEqual(shownTiles({ custom: true, shown: ['waist', 'bogus'] }, 'm', []), ['weight', 'waist']);
  // back to the defaults → follows gender again
  assert.deepEqual(shownTiles(resetTiles(), 'm', []), shownTiles(undefined, 'm', []));
});

test('1.6.1 measurements: stored per user in kv, the Body view and form use the shown set', async () => {
  const fa = await import('../../src/features/body/fields-api.js');
  setKv('measureTiles', undefined);
  assert.equal(fa.customTiles(), false);
  fa.showTile('forearm', true);
  assert.equal(fa.customTiles(), true);
  assert.ok(fa.visibleTiles().includes('forearm'));
  assert.ok(fa.visibleFields().some((f) => f.id === 'forearm'));
  fa.resetToGender();
  assert.equal(fa.customTiles(), false);
  const body = readFileSync('src/features/body/views/body.js', 'utf8');
  assert.match(body, /visibleFields\(\)/);
  assert.match(body, /data-act="mset"/);
});

test("1.6.1: What's new (bg + en), CHANGELOG, no English in Bulgarian", async () => {
  // 1.6.2: the version moved on (asserted in v162.test.js); the 1.6.1 entry stays
  const { NOTES } = await import('../../src/features/whatsnew/notes.js');
  assert.match(readFileSync('CHANGELOG.md', 'utf8'), /## \[1\.6\.1\] – 2026-11-11/);
  const n161 = /** @type {any} */ (NOTES.find((n) => n.v === '1.6.1'));
  assert.deepEqual(
    n161.items.map((/** @type {any} */ [, k]) => k),
    ['whatsNew.kb161', 'whatsNew.supps161', 'whatsNew.measure161'],
  );
  const keys = [
    ...n161.items.map((/** @type {any} */ [, k]) => k),
    'supp.title',
    'supp.add',
    'supp.take',
    'supp.remind',
    'supp.custom',
    'body.setup',
    'body.setupTitle',
    'body.setupHint',
    'body.setMore',
    'body.setReset',
  ];
  for (const k of keys) {
    assert.ok(/** @type {any} */ (bg)[k] && /** @type {any} */ (en)[k], k);
    assert.doesNotMatch(
      JSON.stringify(/** @type {any} */ (bg)[k]).replace(/\{\w+\}|"[fm]":/g, ''),
      /[A-Za-z]/,
      `English in bg ${k}`,
    );
  }
});
