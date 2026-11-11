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
