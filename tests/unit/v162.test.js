// 1.6.2 tester fixes on 1.6.1-beta: the library count follows the filters, supplement
// streaks shown from day 1, every measurement opens a working form, 4 kg of added weight.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { setLang } from '../../src/core/i18n.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};

test('1.6.2 fix 1: the Exercises header count follows the active filters', async () => {
  await setLang('bg');
  const L = await import('../../src/features/library/views/list.js');
  L.resetFilters();
  assert.equal(L.countLabel(), '62 упражнения');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'kettlebell' } }));
  assert.equal(L.filtered().length, 40);
  assert.equal(L.countLabel(), '40 от 62 упражнения');
  L.filterActions.place(/** @type {any} */ ({ dataset: { v: 'gym' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 62 упражнения`);
  L.filterActions.group(/** @type {any} */ ({ dataset: { v: 'glutes' } }));
  assert.equal(L.countLabel(), `${L.filtered().length} от 62 упражнения`);
  L.resetFilters();
  assert.equal(L.countLabel(), '62 упражнения');
  await setLang('en');
  L.filterActions.equip(/** @type {any} */ ({ dataset: { v: 'band' } }));
  assert.match(L.countLabel(), /^\d+ of 62 exercises$/);
  L.resetFilters();
  const src = readFileSync('src/features/library/views/list.js', 'utf8');
  assert.match(src, /countLabel\(\)/);
});

test('1.6.2 fix 2: the supplement streak is shown on every row, from day 1 (creatine too)', async () => {
  await setLang('bg');
  const { setKv, put } = await import('../../src/core/store.js');
  const { dayKey, addDays, parseDay } = await import('../../src/core/dates.js');
  const sa = await import('../../src/features/food/supps-api.js');
  const { suppsCard } = await import('../../src/features/food/views/supps.js');
  const today = dayKey();
  const back = (/** @type {number} */ n) => dayKey(addDays(parseDay(today), -n));
  setKv('supplements', undefined);
  setKv('creatineDose', undefined);
  put('days', { id: today });
  put('days', { id: back(1) });
  sa.addReady('vitd');
  const html0 = String(suppsCard(today));
  assert.match(html0, /suppstreak" data-n="0">🔥 0 дни подред/);
  // day 1: „Взех“ on creatine → „🔥 1 ден подред“ on the creatine row
  const cr = sa.supplements()[0];
  sa.setTaken(cr, today, cr.dose);
  const html1 = String(suppsCard(today));
  const crRow = html1.slice(html1.indexOf('data-supp="creatine"'), html1.indexOf('data-supp="vitd"'));
  assert.match(crRow, /suppstreak on" data-n="1">🔥 1 ден подред/);
  // yesterday too → 2 days; vitamin D still 0 (its own streak)
  sa.setTaken(cr, back(1), 3);
  const html2 = String(suppsCard(today));
  assert.match(html2.slice(html2.indexOf('data-supp="creatine"')), /🔥 2 дни подред/);
  assert.match(html2.slice(html2.indexOf('data-supp="vitd"')), /data-n="0"/);
  // the day view of yesterday counts up to that day
  assert.match(String(suppsCard(back(1))).slice(0, 4000), /data-n="1"/);
  sa.setTaken(cr, today, null);
  sa.setTaken(cr, back(1), null);
});
