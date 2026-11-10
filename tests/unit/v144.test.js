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

// ---- 1.4.4 C2: Ръчно добавени храни ----
const { matchesFood, parseCreatine, safePhoto, scaleRow, MAX_CREATINE } =
  await import('../../src/features/food/logic.js');
const { creatineMg } = await import('../../src/features/food/creatine.js');
const { all, get } = await import('../../src/core/store.js');
const { trash, restore } = await import('../../src/core/trash.js');

test('custom food: saved right away, newest first; built-in foods can never be edited', () => {
  const a = api.saveCustomFood({ id: 'custom_a', name: 'Протеинов бар', kcal: 380, p: 30, c: 40, f: 10, portion: 60 });
  const b = api.saveCustomFood({
    id: 'custom_b',
    name: 'Боза',
    kcal: 90,
    p: 1,
    c: 20,
    f: 0,
    portion: 250,
    created: a.created + 5,
  });
  assert.equal(a.source, 'custom');
  assert.ok(a.created > 0);
  assert.deepEqual(
    api
      .customFoods()
      .slice(0, 2)
      .map((f) => f.id),
    [b.id, a.id],
  );
  const builtIn = api.FOODS[0];
  assert.equal(api.isCustom(builtIn), false);
  assert.equal(api.updateCustomFood(builtIn.id, { kcal: 1 }), null);
  assert.notEqual(api.foodById(builtIn.id).kcal, 1);
});

test('editing a custom food keeps the past diary rows as they were (also when their grams change)', () => {
  const food = api.saveCustomFood({ id: 'custom_hist', name: 'Баница', kcal: 300, p: 8, c: 30, f: 16, portion: 150 });
  const row = api.logFood(food, 200, 'breakfast', '2026-11-01');
  assert.equal(row.kcal, 600);
  const after = api.updateCustomFood(food.id, { kcal: 350, p: 10, photo: undefined, cr: 0.2 });
  assert.equal(after.kcal, 350);
  assert.equal(get('food', row.id).kcal, 600, 'the logged row is untouched');
  assert.equal(matchesFood(row, after), false);
  const edited = api.editRow(row.id, { grams: 100 });
  assert.equal(edited?.after.kcal, 300, 'scaled from the row itself, not from the new values');
  assert.equal(edited?.after.p, 8);
  // a new log uses the new values and copies the creatine
  const fresh = api.logFood(food, 100, 'lunch', '2026-11-02'); // stale object → the saved (edited) food wins
  assert.equal(fresh.kcal, 350);
  assert.equal(fresh.cr, 0.2);
  assert.equal(creatineMg(fresh), 200);
  // rows still matching the food are scaled from the food (1.4.3 behaviour kept)
  assert.equal(matchesFood(fresh, after), true);
  assert.equal(scaleRow(fresh, 160, after).kcal, 560);
});

test('creatine field and photo checks', () => {
  assert.equal(parseCreatine(''), undefined);
  assert.equal(parseCreatine('0,45'), 0.45);
  assert.ok(Number.isNaN(parseCreatine('-1')));
  assert.ok(Number.isNaN(parseCreatine(String(MAX_CREATINE + 1))));
  assert.ok(Number.isNaN(parseCreatine('abc')));
  assert.equal(creatineMg({ foodId: 'x', grams: 50 }, {}), null, 'no data → unknown');
  assert.equal(creatineMg({ foodId: 'x', grams: 50, cr: 0 }, {}), 0);
  assert.equal(safePhoto('data:image/jpeg;base64,/9j/4AAQ=='), 'data:image/jpeg;base64,/9j/4AAQ==');
  assert.equal(safePhoto('javascript:alert(1)'), '');
  assert.equal(safePhoto('data:image/svg+xml;base64,PHN2Zz4='), '');
  assert.equal(safePhoto('data:image/jpeg;base64,abc" onerror="x'), '');
});

test('delete custom foods (several) → Recently deleted → Undo puts them back; diary rows stay', () => {
  const x = api.saveCustomFood({ id: 'custom_x', name: 'X', kcal: 100, p: 1, c: 1, f: 1, portion: 100 });
  const y = api.saveCustomFood({ id: 'custom_y', name: 'Y', kcal: 200, p: 1, c: 1, f: 1, portion: 100 });
  api.toggleFav(x.id);
  const row = api.logFood(x, 100, 'lunch', '2026-11-03');
  const id = trash(
    'customFood',
    [x, y].map((r) => ({ store: 'foods', row: r })),
    { label: '2' },
  );
  assert.equal(api.foodById(x.id), undefined);
  assert.equal(api.foodById(y.id), undefined);
  assert.ok(!api.customFoods().some((f) => f.id === x.id));
  assert.ok(!api.favoriteFoods().some((f) => f.id === x.id), 'a deleted favorite is not listed');
  assert.equal(get('food', row.id).kcal, 100, 'the diary keeps its rows');
  assert.ok(restore(id));
  assert.equal(api.foodById(x.id).name, 'X');
  assert.ok(
    api.favoriteFoods().some((f) => f.id === x.id),
    'Undo brings the ☆ back too',
  );
  assert.ok(all('foods').some((f) => f.id === y.id));
  for (const k of ['custom.deleteMode', 'custom.deleteN', 'custom.photoPick', 'trash.kind.customFood', 'manual.cr'])
    assert.ok(bg[k] && en[k], k);
  assert.equal(bg['custom.photoPick'], 'Снимай опаковката отпред');
  assert.equal(bg['custom.deleteMode'], 'Изтрий храни');
});
