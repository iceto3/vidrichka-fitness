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
