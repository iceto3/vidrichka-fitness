// 1.4.3 tester round 3: quest XP follows the quest (un-ticked → given back, Undo → granted again).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { all, kv, put, remove, setKv } from '../../src/core/store.js';
import { dayKey } from '../../src/core/dates.js';
import { xpTotal } from '../../src/features/motivation/api.js';
import { syncRewards } from '../../src/features/motivation/rewards.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

const today = dayKey(Date.now());
const row = (/** @type {string} */ id, meal = 'breakfast') =>
  put('food', { id, date: today, meal, ts: Date.now(), time: '08:00', name: 'Овесени ядки', grams: 50, kcal: 190 });
const ledger = () => /** @type {Record<string, {amt: number}>} */ (kv('xp', {}));

test('deleting today’s breakfast gives the „Запиши закуската“ XP back; Undo grants it once again', () => {
  all('food').forEach((r) => remove('food', r.id));
  setKv('xp', { 'quest:2020-01-01:breakfast': { amt: 10, ts: 1 }, 'session:s1': { amt: 50, ts: 2 } });
  row('b1');
  syncRewards();
  assert.equal(ledger()[`quest:${today}:breakfast`]?.amt, 10, 'ticked → +10');
  const before = xpTotal();
  remove('food', 'b1');
  syncRewards();
  assert.equal(ledger()[`quest:${today}:breakfast`], undefined, 'un-ticked → its entry is gone');
  assert.equal(xpTotal(), before - 10, 'and the total drops by exactly its XP');
  assert.ok(ledger()['quest:2020-01-01:breakfast'] && ledger()['session:s1'], 'other days / workouts kept');
  syncRewards();
  assert.equal(xpTotal(), before - 10, 'syncing again changes nothing');
  row('b1'); // Undo puts the same row back
  syncRewards();
  assert.equal(ledger()[`quest:${today}:breakfast`]?.amt, 10, 'Undo → granted again');
  assert.equal(xpTotal(), before, 'back to the same total');
  syncRewards();
  assert.equal(xpTotal(), before, 'never twice');
});

test('a breakfast with another meal left keeps the quest; quests that are still done keep their XP', () => {
  all('food').forEach((r) => remove('food', r.id));
  setKv('xp', {});
  row('b1');
  row('b2');
  row('l1', 'lunch');
  syncRewards();
  const t0 = xpTotal();
  remove('food', 'b1');
  syncRewards();
  assert.equal(xpTotal(), t0, 'another breakfast entry is left: still done');
  remove('food', 'l1');
  syncRewards();
  assert.equal(ledger()[`quest:${today}:breakfast`]?.amt, 10, 'breakfast still done');
});
