// Streaks with freezes, XP/levels and the monthly recap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { weeklyStreak, MAX_FREEZES } from '../../src/features/motivation/streak.js';
import { levelInfo, xpNeeded, xpForWorkout, XP } from '../../src/features/motivation/xp.js';
import { monthRecap } from '../../src/features/motivation/recap.js';
import { addDays, dayKey } from '../../src/core/dates.js';

const now = new Date(2026, 9, 21, 12); // Wednesday 21 Oct 2026
const monday = (weeksAgo) => addDays(new Date(2026, 9, 19, 12), -7 * weeksAgo);
/** n workouts in the week `weeksAgo` weeks before this one */
const wk = (weeksAgo, n) => Array.from({ length: n }, (_, i) => dayKey(addDays(monday(weeksAgo), i)));
const goal3 = () => 3;

test('streak counts consecutive weeks that hit the goal', () => {
  const s = weeklyStreak([...wk(3, 3), ...wk(2, 3), ...wk(1, 4)], goal3, now);
  assert.equal(s.weeks, 3);
  assert.equal(s.best, 3);
});

test('the running week does not break the streak, and counts once its goal is met', () => {
  assert.equal(weeklyStreak([...wk(1, 3), ...wk(0, 1)], goal3, now).weeks, 1);
  assert.equal(weeklyStreak([...wk(1, 3), ...wk(0, 3)], goal3, now).weeks, 2);
});

test('a missed week resets the streak when no freeze is available', () => {
  const s = weeklyStreak([...wk(3, 3), ...wk(2, 1), ...wk(1, 3)], goal3, now);
  assert.equal(s.weeks, 1);
  assert.equal(s.best, 1);
});

test('every 4 good weeks earns a freeze (max 2) that is auto-used on a missed week', () => {
  const days = [...wk(6, 3), ...wk(5, 3), ...wk(4, 3), ...wk(3, 3), ...wk(2, 0), ...wk(1, 3)];
  const s = weeklyStreak(days, goal3, now);
  assert.equal(s.frozen.length, 1);
  assert.equal(s.weeks, 5);
  assert.equal(s.freezes, 0);
  const many = Array.from({ length: 16 }, (_, i) => wk(i + 1, 3)).flat();
  assert.equal(weeklyStreak(many, goal3, now).freezes, MAX_FREEZES);
});

test('levels: level 1→2 needs 250 XP, each level +125; level 7 needs 1000', () => {
  assert.deepEqual(levelInfo(0), { level: 1, into: 0, need: 250, pct: 0 });
  assert.equal(levelInfo(249).level, 1);
  assert.equal(levelInfo(250).level, 2);
  assert.equal(xpNeeded(7), 1000);
  const toL7 = [1, 2, 3, 4, 5, 6].reduce((a, l) => a + xpNeeded(l), 0);
  assert.equal(levelInfo(toL7 + 640).level, 7);
  assert.equal(levelInfo(toL7 + 640).into, 640);
});

test('workout XP: base + per set + per PR, nothing for empty workouts', () => {
  assert.equal(xpForWorkout({ setsDone: 10, prs: 2 }), XP.workout + 10 * XP.perSet + 2 * XP.pr);
  assert.equal(xpForWorkout({ setsDone: 0, prs: 0 }), 0);
});

test('monthly recap aggregates only that month', () => {
  const t = (d) => new Date(d).getTime();
  const r = monthRecap('2026-10', {
    sessions: [
      {
        endedAt: t('2026-10-02T10:00'),
        durationSec: 1800,
        volume: 1000,
        setsDone: 10,
        kcal: 150,
        prs: [{}],
        items: [{ exId: 'squat', sets: [{ done: true }] }],
      },
      {
        endedAt: t('2026-10-05T10:00'),
        durationSec: 1200,
        volume: 500,
        setsDone: 6,
        kcal: 100,
        prs: [],
        items: [{ exId: 'squat', sets: [{ done: true }] }],
      },
      { endedAt: t('2026-09-30T10:00'), durationSec: 999, volume: 9, setsDone: 1, kcal: 1, items: [] },
    ],
    food: [
      { date: '2026-10-02', kcal: 1500 },
      { date: '2026-10-03', kcal: 1700 },
      { date: '2026-10-03', type: 'water', kcal: 0 },
    ],
    measurements: [
      { date: '2026-10-01', weight: 62 },
      { date: '2026-10-20', weight: 61.2 },
    ],
    badges: { first: t('2026-10-02T10:00'), old: t('2026-08-01T10:00') },
  });
  assert.equal(r.workouts, 2);
  assert.equal(r.minutes, 50);
  assert.equal(r.volume, 1500);
  assert.equal(r.prs.length, 1);
  assert.deepEqual(r.topExercise, { exId: 'squat', times: 2 });
  assert.equal(r.avgKcal, 1600);
  assert.equal(r.weightDelta, -0.8);
  assert.deepEqual(r.badges, ['first']);
});
