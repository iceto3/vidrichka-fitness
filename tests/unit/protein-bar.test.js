// Home protein bar (1.2): running → overdue (stays red until answered) → done/skipped.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  BREAKFAST_LOGGER,
  MIN,
  PROTEIN_ANSWERED_SHOW,
  mmss,
  planDay,
  proteinBar,
  proteinState,
} from '../../src/features/daily/logic.js';
import { DAILY } from '../../src/core/settings.js';

const start = new Date(2026, 9, 25, 7, 30).getTime();

test('mm:ss rounds seconds up and never goes negative', () => {
  assert.equal(mmss(30 * MIN), '30:00');
  assert.equal(mmss(23 * MIN + 40_100), '23:41');
  assert.equal(mmss(1), '00:01');
  assert.equal(mmss(0), '00:00');
  assert.equal(mmss(-5000), '00:00');
});

test('idle: nothing before the wake-up starts the window', () => {
  assert.equal(proteinBar({}, start), null);
  assert.equal(proteinBar(undefined, start), null);
});

test('running: counts down from 30:00', () => {
  const rec = { proteinStart: start };
  assert.deepEqual(proteinBar(rec, start), { mode: 'running', time: '30:00' });
  assert.deepEqual(proteinBar(rec, start + 6 * MIN + 19_000), { mode: 'running', time: '23:41' });
  assert.deepEqual(proteinBar(rec, start + 30 * MIN - 1), { mode: 'running', time: '00:01' });
  assert.equal(proteinBar(rec, start - 5 * MIN)?.time, '30:00', 'clock moved back: clamped');
});

test('overdue from 30 min on, counting up how late (1.4.3 round 3: no more 00:00), computed so it survives reloads', () => {
  const rec = { proteinStart: start };
  for (const [t, h, m] of [
    [30 * MIN, 0, 1],
    [31 * MIN, 0, 1],
    [71 * MIN, 0, 41],
    [95 * MIN, 1, 5],
    [5 * 60 * MIN, 4, 30],
    [14 * 60 * MIN, 13, 30],
  ])
    assert.deepEqual(proteinBar(rec, start + t), { mode: 'overdue', time: '', late: { h, m } });
  assert.equal(proteinState(rec, start + 40 * MIN).state, 'overdue');
});

test('done: "Ate it" shows a short done state, then hides', () => {
  const rec = { proteinStart: start, proteinAt: start + 12 * MIN };
  assert.equal(proteinState(rec, start + 13 * MIN).state, 'done');
  assert.deepEqual(proteinBar(rec, start + 13 * MIN), { mode: 'done', time: '' });
  assert.equal(proteinBar(rec, rec.proteinAt + PROTEIN_ANSWERED_SHOW), null);
  // answering while overdue also ends the red state
  const late = { proteinStart: start, proteinAt: start + 50 * MIN };
  assert.equal(proteinBar(late, start + 51 * MIN)?.mode, 'done');
});

test('skipped: short skipped state, then hides; "Ate it" still wins if both are set', () => {
  const rec = { proteinStart: start, proteinSkip: start + 45 * MIN };
  assert.equal(proteinState(rec, start + 46 * MIN).state, 'skipped');
  assert.deepEqual(proteinBar(rec, start + 46 * MIN), { mode: 'skipped', time: '' });
  assert.equal(proteinBar(rec, rec.proteinSkip + PROTEIN_ANSWERED_SHOW + 1), null);
  assert.equal(proteinState({ ...rec, proteinAt: start + 50 * MIN }, start + 51 * MIN).state, 'done');
});

test('skipping stops the local protein reminders like "Ate it"', () => {
  const day = '2026-10-25';
  const kinds = (rec) => planDay(day, { ...DAILY, protein: true }, rec).filter((s) => s.group === 'protein');
  const p = kinds({ proteinStart: start });
  assert.ok(p.length > 0);
  assert.ok(p.every((s) => s.skipIf?.includes('proteinSkip') && s.skipIf.includes('proteinAt')));
});

test('"Ate it" leads to the Food logger on breakfast — also from the notification action', () => {
  const [path, query] = BREAKFAST_LOGGER.split('?');
  const [a, b, meal] = path.split('/');
  assert.deepEqual([a, b, meal, query], ['food', 'add', 'breakfast', 'protein']);
  const sw = readFileSync('sw.js', 'utf8');
  const click = sw.slice(sw.indexOf("addEventListener('notificationclick'"));
  assert.ok(click.includes(`route = '${BREAKFAST_LOGGER}'`), 'sw.js opens the same route after protein-yes');
  const quests = readFileSync('src/features/motivation/quests.js', 'utf8');
  // 1.4.3 part B: one quest per meal that is on (meal_breakfast …)
  assert.match(
    quests,
    /id: `meal_\$\{m\}`[\s\S]*done: \(s\) => s\.todayMeals\.has\(m\)/,
    'logging breakfast completes the quest',
  );
});
