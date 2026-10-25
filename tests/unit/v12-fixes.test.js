// Regression tests for the 12 tester findings on 1.1.0 (fixed in 1.2.0).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { durationMin, totalMin } from '../../src/core/dates.js';
import { L, fmtHM, setLang, uses12h } from '../../src/core/i18n.js';
import { isCompleteWorkout, minSetsForWorkout, xpForWorkout, XP } from '../../src/features/motivation/xp.js';
import { computeStats } from '../../src/features/motivation/stats.js';
import { recomputeAfterDelete } from '../../src/features/workouts/logic.js';
import { createQueue } from '../../src/features/celebrations/queue.js';
import { dailyOnCount, morningPromptOk } from '../../src/features/daily/logic.js';
import { DAILY } from '../../src/core/settings.js';
import { validateFood } from '../../src/features/food/logic.js';
import { MEASURE_FIELDS, checkMeasure } from '../../src/data/measurements.js';
import { mergeSameX } from '../../src/ui/chart.js';
import { GEAR_LEVELS, OUTFITS, gearFor } from '../../src/features/mascot/mascot.js';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';

test('#1 the plan name is a localized string, never [object Object]', () => {
  const name = { en: 'Upper Body', bg: 'Горна част' };
  assert.equal(L(name), 'Upper Body');
  assert.doesNotMatch(String(L(name)), /object/);
});

test('#2 one duration rounding everywhere: summary, share card, calendar and history agree', () => {
  assert.equal(durationMin(29), 1); // 1.1: summary said 1 min, share card / calendar said 0 min
  assert.equal(durationMin(0), 0);
  assert.equal(durationMin(89), 1);
  assert.equal(durationMin(91), 2);
  assert.equal(totalMin([{ durationSec: 29 }, { durationSec: 29 }]), 2, 'the month total adds up the rows');
});

const ex = () => ({ weighted: true });
const sess = (id, endedAt, w, partial = false) => ({
  id,
  endedAt,
  setsDone: 3,
  partial,
  items: [{ exId: 'squat', rest: 60, target: { reps: 8, weight: w }, sets: [{ w, r: 8, done: true }] }],
  prs: [],
  xp: 0,
});

test('#3 deleting a workout recomputes the later workouts’ PRs and XP', () => {
  const a = sess('a', 1, 40),
    b = { ...sess('b', 2, 50), prs: [{ exId: 'squat', w: 50, r: 8, prevW: 40, prevR: 8 }] },
    c = sess('c', 3, 45);
  b.xp = xpForWorkout({ setsDone: 3, prs: 1 });
  c.xp = xpForWorkout({ setsDone: 3, prs: 0 });
  // delete b: c (45 kg) is now a PR over a (40 kg)
  const changed = recomputeAfterDelete([a, c], b.endedAt, ex, xpForWorkout);
  assert.deepEqual(
    changed.map((x) => [x.id, x.prs.length, x.xp]),
    [['c', 1, XP.workout + 3 * XP.perSet + XP.pr]],
  );
  // delete a: b has no earlier history any more → its PR goes (first session = baseline)
  const changed2 = recomputeAfterDelete([b, c], a.endedAt, ex, xpForWorkout);
  assert.equal(changed2.find((x) => x.id === 'b')?.prs.length, 0);
});

test('#4 the morning prompt only shows in the morning and never after a workout today', () => {
  assert.equal(morningPromptOk(8, false), true);
  assert.equal(morningPromptOk(8, true), false);
  assert.equal(morningPromptOk(13, false), false);
  assert.equal(morningPromptOk(3, false), false);
});

test('#5 one clock style per locale; the Reminders summary counts the daily reminders', async () => {
  await setLang('bg');
  assert.equal(uses12h('en-US'), false, 'BG is always 24 h');
  assert.equal(fmtHM('14:00'), '14:00');
  await setLang('en');
  assert.equal(uses12h('en-US'), true);
  assert.equal(uses12h('en-GB'), false);
  assert.equal(fmtHM('14:00', true), '2:00 PM');
  assert.equal(fmtHM('00:30', true), '12:30 AM');
  assert.equal(fmtHM('7:05', false), '07:05');
  assert.ok(dailyOnCount(DAILY) > 0, 'defaults: daily reminders are on, so the row must not say "Off"');
  assert.equal(dailyOnCount({ morning: false, protein: false, water: [{ on: false }], checkinAm: { on: false } }), 0);
});

test('#6 manual food: impossible macros and negatives are errors, odd kcal is a warning', () => {
  const r = validateFood({ kcal: '150', p: '90', c: '90', f: '0', portion: '100' });
  assert.equal(r.errors.p, 'manual.errSum');
  assert.equal(validateFood({ kcal: '-5', p: '1', c: '1', f: '1', portion: '100' }).errors.kcal, 'manual.errNegative');
  assert.equal(validateFood({ kcal: '100', p: 'abc', c: '', f: '', portion: '' }).errors.p, 'manual.errNumber');
  const w = validateFood({ kcal: '50', p: '20', c: '30', f: '10', portion: '100' }); // ≈ 290 kcal
  assert.deepEqual(w.errors, {});
  assert.equal(w.warn, 'manual.warnKcal');
  const ok = validateFood({ kcal: '165', p: '31', c: '0', f: '3,6', portion: '' }); // chicken breast
  assert.deepEqual(ok.errors, {});
  assert.equal(ok.warn, null);
  assert.equal(ok.values.f, 3.6);
  assert.equal(ok.values.portion, 100);
});

test('#6 body weight: negative or absurd values are rejected with the range', () => {
  const weight = MEASURE_FIELDS.find((f) => f.id === 'weight');
  assert.ok(weight);
  assert.equal(checkMeasure(weight, '-60').error, 'body.errRange');
  assert.deepEqual(checkMeasure(weight, '-60').range, [20, 300]);
  assert.equal(checkMeasure(weight, '1000').error, 'body.errRange');
  assert.equal(checkMeasure(weight, 'x').error, 'body.errNumber');
  assert.equal(checkMeasure(weight, '61,5').value, 61.5);
  assert.deepEqual(checkMeasure(weight, ''), {});
});

test('#7 a live set toast is not queued again while it is on screen', async () => {
  const played = [];
  let release = () => {};
  const q = createQueue((c) => (played.push(c), new Promise((r) => (release = r))));
  q.push({ key: 'set', live: () => null, n: 1 });
  await new Promise((r) => setTimeout(r, 0));
  for (let n = 2; n <= 5; n++) assert.equal(q.push({ key: 'set', live: () => null, n }), false);
  assert.equal(q.pending, 0, 'no stale "2 of 18", "3 of 18"… waiting behind it');
  release();
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(played.length, 1);
});

test('#8 too few sets → partial: per-set XP only, and it does not count as a workout', () => {
  assert.equal(minSetsForWorkout(17), 9);
  assert.equal(minSetsForWorkout(4), 3);
  assert.equal(minSetsForWorkout(2), 2);
  assert.equal(isCompleteWorkout({ setsDone: 1, setsPlanned: 17 }), false);
  assert.equal(isCompleteWorkout({ setsDone: 9, setsPlanned: 17 }), true);
  assert.equal(xpForWorkout({ setsDone: 1, prs: 1, partial: true }), XP.perSet, '1.1 gave +72 XP for 1 of 17 sets');
  const now = new Date(2026, 9, 21, 12);
  const s = computeStats({
    sessions: [{ endedAt: now.getTime() - 1000, volume: 100, prs: [], setsDone: 1, partial: true }],
    food: [],
    measurements: [],
    photos: [],
    goalAt: () => 3,
    waterGoal: 8,
    now,
  });
  assert.equal(s.totalWorkouts, 0);
  assert.equal(s.workedOutToday, false);
  assert.equal(s.streak.thisWeek, 0);
});

test('#9 two chart points on one day → one point and one label', () => {
  assert.deepEqual(
    mergeSameX([
      { x: '24/10', y: 60 },
      { x: '25/10', y: 61 },
      { x: '25/10', y: 60.5 },
    ]),
    [
      { x: '24/10', y: 60 },
      { x: '25/10', y: 60.5 },
    ],
  );
  assert.deepEqual(
    mergeSameX(
      [
        { x: '25/10', y: 40 },
        { x: '25/10', y: 45 },
      ],
      'max',
    ),
    [{ x: '25/10', y: 45 }],
  );
});

test('#10 the unlock list names only gear the outfits really use', () => {
  const used = new Set(OUTFITS.flatMap((o) => o.gear ?? []));
  for (const g of Object.keys(GEAR_LEVELS)) assert.ok(used.has(g), `${g} is listed but no outfit has it`);
  assert.ok(!('dumbbell' in GEAR_LEVELS));
  for (const o of OUTFITS.filter((x) => x.gear?.length))
    assert.ok(Math.max(...o.gear.map((g) => GEAR_LEVELS[g])) <= o.level, `${o.id} unlock level matches its gear`);
  assert.deepEqual(gearFor(12), ['tank', 'medal', 'crown']);
});

test('new 1.2 strings exist in both languages', () => {
  for (const k of ['history.delete', 'summary.partial', 'manual.errSum', 'body.errRange', 'profile.dailyOn'])
    assert.ok(en[k] && bg[k], k);
});
