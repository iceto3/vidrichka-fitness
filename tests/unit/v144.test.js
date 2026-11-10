// 1.4.4 C1: most used by points (with decay), favorites, the add screen's food order.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kv, setKv } from '../../src/core/store.js';
import { setLang, t } from '../../src/core/i18n.js';
import {
  HALF_LIFE_DAYS,
  IDLE_DAYS,
  bump,
  byPoints,
  categoriesByPoints,
  groupFoods,
  points,
} from '../../src/features/food/usage.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

globalThis.addEventListener ??= () => {};
globalThis.removeEventListener ??= () => {};
await setLang('bg');
const api = await import('../../src/features/food/api.js');

const DAY = 86_400_000;
const T0 = new Date(2026, 10, 1, 12).getTime();

test('points: every add is 1 point from day one; old entries start with their count', () => {
  let e = bump(undefined, T0, 'eggs');
  assert.deepEqual(e, { n: 1, pts: 1, ts: T0, cat: 'eggs' });
  e = bump(e, T0 + DAY, 'eggs');
  e = bump(e, T0 + 40 * DAY, 'eggs'); // long gaps don't reset the count before 14 idle days…
  assert.equal(e.n, 3);
  assert.equal(points({ n: 7, ts: T0 }, T0 + DAY), 7, 'a 1.4.3 entry {n, ts} keeps its count');
});

test('decay: after 14 days without adding, the points halve, then every 2 weeks again', () => {
  const e = { pts: 8, ts: T0 };
  assert.equal(IDLE_DAYS, 14);
  assert.equal(HALF_LIFE_DAYS, 14);
  assert.equal(points(e, T0 + 13 * DAY), 8);
  assert.equal(points(e, T0 + 14 * DAY), 4);
  assert.equal(points(e, T0 + 27 * DAY), 4);
  assert.equal(points(e, T0 + 28 * DAY), 2);
  assert.equal(points(e, T0 + 42 * DAY), 1);
  // adding again keeps what is left and counts on from there
  const again = bump(e, T0 + 28 * DAY);
  assert.equal(again.pts, 3);
  assert.equal(points(again, T0 + 30 * DAY), 3, 'no decay right after an add');
});

test('most used: by points, ties → the most recently added first', () => {
  const use = {
    a: { pts: 3, ts: T0 },
    b: { pts: 5, ts: T0 },
    c: { pts: 3, ts: T0 + 1000 },
    d: { pts: 0, ts: T0 },
    old: { pts: 16, ts: T0 - 60 * DAY }, // 16 → 1 after 60 idle days (4 halvings)
  };
  assert.deepEqual(byPoints(use, T0), ['b', 'c', 'a', 'old']);
  assert.deepEqual(
    byPoints(use, T0, (id) => id !== 'b'),
    ['c', 'a', 'old'],
  );
});

test('a food list: favorites, faint divider, the 5 most used, faint divider, the rest', () => {
  const list = ['f1', 'f2', 'f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f9'].map((id) => ({ id }));
  const favs = { f9: 1, f2: 2 };
  const use = Object.fromEntries(
    ['f3', 'f4', 'f5', 'f6', 'f7', 'f8', 'f2'].map((id, i) => [id, { pts: 10 - i, ts: T0 }]),
  );
  const g = groupFoods(list, favs, use, T0);
  assert.deepEqual(
    g.fav.map((f) => f.id),
    ['f2', 'f9'],
    'favorites in the list order (manual only, never from points)',
  );
  assert.deepEqual(
    g.most.map((f) => f.id),
    ['f3', 'f4', 'f5', 'f6', 'f7'],
    'top 5 by points, favorites excluded',
  );
  assert.deepEqual(
    g.rest.map((f) => f.id),
    ['f1', 'f8'],
  );
  const none = groupFoods(list, {}, {}, T0);
  assert.equal(none.fav.length + none.most.length, 0);
  assert.equal(none.rest.length, 9);
});

test('categories by points (decayed); ties keep the default order', () => {
  const cats = [{ id: 'meat' }, { id: 'veg' }, { id: 'eggs' }];
  const use = { x: { pts: 4, ts: T0, cat: 'eggs' }, y: { pts: 6, ts: T0 - 30 * DAY, cat: 'veg' } };
  assert.deepEqual(
    categoriesByPoints(cats, use, T0).map((c) => c.id),
    ['eggs', 'veg', 'meat'],
  );
});

test('logFood counts a point; favorites toggle; Любими lists starred foods', () => {
  setKv('foodUse', {});
  setKv('foodFav', {});
  const egg = api.foodById('egg') ?? api.FOODS.find((f) => f.cat === 'eggs');
  api.logFood(egg, 100, 'breakfast', '2026-11-10');
  api.logFood(egg, 50, 'breakfast', '2026-11-10');
  assert.equal(kv('foodUse', {})[egg.id].pts, 2);
  assert.equal(api.quickPicks()[0].id, egg.id);
  assert.equal(api.isFav(egg.id), false);
  assert.equal(api.toggleFav(egg.id), true);
  assert.deepEqual(
    api.favoriteFoods().map((f) => f.id),
    [egg.id],
  );
  const g = api.orderedFoods(api.FOODS.filter((f) => f.cat === egg.cat));
  assert.equal(g.fav[0].id, egg.id);
  assert.equal(api.toggleFav(egg.id), false);
  assert.equal(api.favoriteFoods().length, 0);
  for (const k of ['food.favorites', 'food.favFoods', 'food.favEmpty', 'food.fav', 'food.unfav'])
    assert.ok(bg[k] && en[k], k);
  assert.equal(t('food.favorites'), 'Любими');
});
