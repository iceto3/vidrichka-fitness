// 1.4.3 tester round 2: local food search by words (built-in generic foods first).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FOODS } from '../../src/data/foods.js';
import { matchScore, norm, searchFoods, stem } from '../../src/features/food/search.js';

const nm = (/** @type {any} */ f) => (typeof f.name === 'string' ? f.name : `${f.name.en} ${f.name.bg}`);
const own = [
  { id: 'own1', name: 'Пилешки гърди Dulano' },
  { id: 'own2', name: 'Протеинов бар' },
];
const ids = (/** @type {string} */ q) => searchFoods(FOODS, own, q, nm).map((f) => f.id);

test('„пилешки гърди“ finds the built-in chicken breast first, then the own product', () => {
  const r = ids('пилешки гърди');
  assert.equal(r[0], 'chicken_breast');
  assert.ok(r.includes('chicken_breast_raw') && r.includes('chicken_breast_boiled'));
  assert.equal(r.at(-1), 'own1', 'own products after the built-in ones');
  assert.ok(!r.some((id) => /turkey|pork|thigh/.test(id)));
});

test('word forms, case and punctuation; typing a word prefix still finds it', () => {
  assert.equal(ids('ПИЛЕШКО ФИЛЕ')[0], 'chicken_breast');
  assert.equal(ids('пилешко филе (на скара)')[0], 'chicken_breast');
  assert.equal(ids('пил')[0], 'chicken_breast');
  assert.ok(ids('пилешки бутчета').every((id) => id.startsWith('chicken_thigh')));
  assert.ok(ids('пуешки гърди').every((id) => id.startsWith('turkey_breast')));
  assert.ok(ids('гърди').every((id) => /^(chicken|turkey)_breast/.test(id) || id === 'own1'));
  assert.equal(ids('chicken breast')[0], 'chicken_breast');
  assert.deepEqual(ids('zzqx homemade bar'), []);
  assert.deepEqual(ids('   '), []);
  assert.equal(stem('пилешки'), stem('пилешко'));
  assert.equal(norm('Кисело  мляко, 2%'), 'кисело мляко 2');
  assert.equal(matchScore('Банан', 'ябълка'), null);
});

test('only the search changed: the built-in table (nutrition) is as it was', () => {
  const cb = FOODS.find((f) => f.id === 'chicken_breast');
  assert.deepEqual(
    [cb?.name.bg, cb?.kcal, cb?.p, cb?.c, cb?.f, cb?.fib, cb?.salt],
    ['Пилешко филе (на скара)', 165, 31, 0, 3.6, 0, 0.2],
  );
});
