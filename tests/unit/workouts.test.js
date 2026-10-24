// Workout maths: totals, MET calories, personal records, progression and active set.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  summarize,
  estimateKcal,
  sessionMet,
  detectPRs,
  bestSet,
  suggest,
  newItems,
  activeSet,
} from '../../src/features/workouts/logic.js';

const ex = (/** @type {string} */ id) =>
  ({ squat: { weighted: true, met: 6 }, plank: { weighted: false, met: 3.8 } })[id];
const item = (exId, sets) => ({ exId, rest: 60, target: { reps: 10, weight: 20 }, sets });

test('summarize counts only done sets; bodyweight adds no volume', () => {
  const s = summarize(
    [
      item('squat', [
        { w: 40, r: 10, done: true },
        { w: 40, r: 8, done: false },
      ]),
      item('plank', [{ w: 0, r: 30, done: true }]),
    ],
    ex,
  );
  assert.deepEqual(s, { setsDone: 2, setsPlanned: 3, reps: 40, volume: 400 });
});

test('MET calories = MET × kg × hours', () => {
  assert.equal(estimateKcal(5, 60, 3600), 300);
  assert.equal(estimateKcal(6, 65, 1800), 195);
  assert.equal(estimateKcal(5, 60, -10), 0);
});

test('session MET averages trained exercises and defaults to 5', () => {
  assert.equal(
    sessionMet([item('squat', [{ w: 1, r: 1, done: true }]), item('plank', [{ w: 0, r: 1, done: false }])], ex),
    6,
  );
  assert.equal(sessionMet([], ex), 5);
});

test('PRs: heavier weight or more reps at same weight; first session is baseline', () => {
  const hist = [{ id: 'a', endedAt: 1, items: [item('squat', [{ w: 40, r: 10, done: true }])] }];
  assert.deepEqual(detectPRs([item('squat', [{ w: 42.5, r: 8, done: true }])], hist, ex), [
    { exId: 'squat', w: 42.5, r: 8, prevW: 40, prevR: 10 },
  ]);
  assert.equal(detectPRs([item('squat', [{ w: 40, r: 11, done: true }])], hist, ex).length, 1);
  assert.equal(detectPRs([item('squat', [{ w: 40, r: 10, done: true }])], hist, ex).length, 0);
  assert.equal(
    detectPRs([item('squat', [{ w: 100, r: 1, done: false }])], hist, ex).length,
    0,
    'unfinished sets never count',
  );
  assert.equal(detectPRs([item('squat', [{ w: 50, r: 5, done: true }])], [], ex).length, 0);
  assert.deepEqual(bestSet(hist, 'squat', true), { w: 40, r: 10, at: 1 });
});

test('progression suggestion and new-session defaults use last time', () => {
  assert.deepEqual(suggest([{ w: 40, r: 10, done: true }], 10, true, 2.5), { kind: 'weight', value: 42.5 });
  assert.deepEqual(suggest([{ w: 40, r: 8, done: true }], 10, true, 2.5), { kind: 'reps', value: 10 });
  assert.equal(suggest([], 10, true, 2.5), null);
  const hist = [{ id: 'a', endedAt: 1, items: [item('squat', [{ w: 45, r: 10, done: true }])] }];
  const [it] = newItems([{ exId: 'squat', sets: 3, reps: 10, weight: 20, rest: 90 }], hist);
  assert.equal(it.sets.length, 3);
  assert.equal(it.sets[0].w, 45);
});

test('active set follows the last completed set and skips finished ones', () => {
  const items = [
    item('squat', [
      { w: 1, r: 1, done: true, doneAt: 1 },
      { w: 1, r: 1, done: false },
      { w: 1, r: 1, done: false },
    ]),
  ];
  assert.deepEqual(activeSet(items), [0, 1]);
  items[0].sets[2].done = true;
  items[0].sets[2].doneAt = 2; // skipped set 2, did set 3
  assert.deepEqual(activeSet(items), [0, 1]);
  items[0].sets[1].done = true;
  assert.equal(activeSet(items), null);
});
