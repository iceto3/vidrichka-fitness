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
  assert.equal(ledger()[`quest:${today}:meal_breakfast`]?.amt, 5, 'ticked → +5 (1.4.3 part B: one quest per meal)');
  const before = xpTotal();
  remove('food', 'b1');
  syncRewards();
  assert.equal(ledger()[`quest:${today}:meal_breakfast`], undefined, 'un-ticked → its entry is gone');
  assert.equal(xpTotal(), before - 5, 'and the total drops by exactly its XP');
  assert.ok(ledger()['quest:2020-01-01:breakfast'] && ledger()['session:s1'], 'other days / workouts kept');
  syncRewards();
  assert.equal(xpTotal(), before - 5, 'syncing again changes nothing');
  row('b1'); // Undo puts the same row back
  syncRewards();
  assert.equal(ledger()[`quest:${today}:meal_breakfast`]?.amt, 5, 'Undo → granted again');
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
  assert.equal(ledger()[`quest:${today}:meal_breakfast`]?.amt, 5, 'breakfast still done');
});

test('a late meal shows how late it is: „+41 мин“, „+1 ч 05 мин“ (pill, sheet, Home banner)', async () => {
  const { lateParts, proteinBar, MIN } = await import('../../src/features/daily/logic.js');
  const { setLang, t } = await import('../../src/core/i18n.js');
  const { lateText, withLate } = await import('../../src/features/daily/views/mealsheet.js');
  await setLang('bg');
  assert.deepEqual(lateParts(41 * MIN + 59_000), { h: 0, m: 41 });
  assert.deepEqual(lateParts(0), { h: 0, m: 1 }, 'never „+0“');
  assert.equal(lateText(lateParts(41 * MIN)), '+41 мин');
  assert.equal(lateText(lateParts(59 * MIN + 59_000)), '+59 мин');
  assert.equal(lateText(lateParts(60 * MIN)), '+1 ч 00 мин');
  assert.equal(lateText(lateParts(65 * MIN)), '+1 ч 05 мин');
  assert.equal(lateText(lateParts(135 * MIN)), '+2 ч 15 мин');
  const start = Date.UTC(2026, 10, 5, 5, 0);
  const b = withLate(proteinBar({ proteinStart: start }, start + 71 * MIN));
  assert.equal(b?.time, '+41 мин', 'the banner / pill text');
  assert.notEqual(b?.time, '00:00');
  assert.equal(t('mealPill.over', { time: b?.time }), 'Времето изтече · +41 мин', 'the sheet header');
  assert.equal(t('home.proteinOver', { time: b?.time }), 'Времето изтече · +41 мин · изяж 30 г протеин');
  assert.equal(withLate(proteinBar({ proteinStart: start }, start + 10 * MIN))?.time, '20:00', 'running unchanged');
  await setLang('en');
  assert.equal(lateText(lateParts(65 * MIN)), '+1 h 05 min');
  await setLang('bg');
});
