/**
 * 1.3.1: fiber & salt, item edits, "Recently deleted" with restore, the trash migration.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fromOff, portion, scaleRow, totals, validateFood } from '../../src/features/food/logic.js';
import { all, get, put } from '../../src/core/store.js';
import { KEEP_DAYS, daysLeft, forget, onRestore, purge, restore, trash, trashList } from '../../src/core/trash.js';
import { DATA_VERSION, migrate } from '../../src/core/migrations.js';
import { STORES } from '../../src/core/db.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

test('portion carries fiber and salt only when the food knows them', () => {
  assert.deepEqual(portion({ kcal: 350, p: 12, c: 60, f: 6, fib: 10, salt: 1.2 }, 50), {
    kcal: 175,
    p: 6,
    c: 30,
    f: 3,
    fib: 5,
    salt: 0.6,
  });
  const old = portion({ kcal: 100, p: 1, c: 2, f: 3 }, 100);
  assert.ok(!('fib' in old) && !('salt' in old)); // old foods: unknown, not 0
  assert.equal(portion({ kcal: 0, p: 0, c: 0, f: 0, fib: 0, salt: 0 }, 100).salt, 0); // a known 0 stays 0
});

test('daily totals sum the known fiber/salt and count how many rows knew them', () => {
  const t = totals([
    { kcal: 100, p: 1, c: 2, f: 3, fib: 2.5, salt: 0.4 },
    { kcal: 50, p: 1, c: 1, f: 1 },
    { kcal: 10, p: 0, c: 0, f: 0, salt: 1.1 },
  ]);
  assert.equal(t.kcal, 160);
  assert.equal(t.fib, 2.5);
  assert.equal(Math.round(t.salt * 10) / 10, 1.5);
  assert.equal(t.fibN, 1);
  assert.equal(t.saltN, 2);
});

test('Open Food Facts fiber_100g / salt_100g (salt from sodium as a fallback)', () => {
  const p = (/** @type {any} */ n) => fromOff({ nutriments: { 'energy-kcal_100g': 200, ...n } });
  assert.equal(p({ fiber_100g: 6.04, salt_100g: 1.234 })?.fib, 6);
  assert.equal(p({ fiber_100g: 6.04, salt_100g: 1.234 })?.salt, 1.23);
  assert.equal(p({ sodium_100g: 0.4 })?.salt, 1);
  const none = p({});
  assert.ok(none && !('fib' in none) && !('salt' in none));
});

test('manual entry: fiber and salt are optional (empty = unknown) and checked like macros', () => {
  const base = { kcal: '165', p: '31', c: '0', f: '3,6', portion: '' };
  const empty = validateFood({ ...base, fib: '', salt: '' });
  assert.deepEqual(empty.errors, {});
  assert.ok(!('fib' in empty.values) && !('salt' in empty.values));
  const typed = validateFood({ ...base, fib: '2,5', salt: '0' });
  assert.equal(typed.values.fib, 2.5);
  assert.equal(typed.values.salt, 0);
  assert.equal(validateFood({ ...base, fib: '-1' }).errors.fib, 'manual.errNegative');
  assert.equal(validateFood({ ...base, salt: '101' }).errors.salt, 'manual.errOver100');
  assert.equal(validateFood({ ...base, salt: 'abc' }).errors.salt, 'manual.errNumber');
});

test('editing grams scales every nutrient of the row; unknown fiber/salt stay unknown', () => {
  const row = { id: 'f1', meal: 'breakfast', grams: 150, kcal: 300, p: 20, c: 10, f: 18, fib: 1.5, salt: 2.25 };
  const half = scaleRow(row, 75);
  assert.deepEqual(
    [half.grams, half.kcal, half.p, half.c, half.f, half.fib, half.salt],
    [75, 150, 10, 5, 9, 0.8, 1.13],
  );
  assert.equal(half.id, 'f1');
  assert.equal(half.meal, 'breakfast');
  const back = scaleRow(scaleRow(row, 75), 150);
  assert.equal(back.kcal, 300);
  const old = scaleRow({ grams: 100, kcal: 100, p: 1, c: 1, f: 1 }, 200);
  assert.ok(!('fib' in old) && !('salt' in old));
  assert.equal(old.kcal, 200);
});

test('"Recently deleted": delete moves rows to the bin, restore puts them back unchanged and runs the hook', () => {
  const row = {
    id: 'f_trash1',
    date: '2026-10-25',
    meal: 'lunch',
    name: 'супа',
    grams: 300,
    kcal: 120,
    p: 5,
    c: 15,
    f: 4,
  };
  put('food', row);
  let hooked = /** @type {any} */ (null);
  onRestore('food', (e) => (hooked = e));
  const id = trash('food', [{ store: 'food', row }], { label: 'супа', emoji: '🍲' });
  assert.equal(get('food', row.id), undefined);
  assert.equal(trashList()[0].id, id);
  assert.equal(trashList()[0].label, 'супа');
  assert.ok(restore(id));
  assert.deepEqual(get('food', row.id), row);
  assert.equal(hooked?.kind, 'food');
  assert.equal(get('trash', id), undefined);
  assert.equal(restore(id), false); // only once
});

test('bin entries are kept 7 days, then purged; delete-forever works', () => {
  const now = Date.now();
  const a = trash(
    'meal',
    [{ store: 'meals', row: { id: 'm_old', name: 'стара', items: [] } }],
    { label: 'стара' },
    now - 8 * 864e5,
  );
  const b = trash(
    'meal',
    [{ store: 'meals', row: { id: 'm_new', name: 'нова', items: [] } }],
    { label: 'нова' },
    now - 6.5 * 864e5,
  );
  assert.ok(!trashList(now).some((e) => e.id === a)); // expired ones are hidden at once
  assert.equal(daysLeft(/** @type {any} */ (get('trash', b)), now), 1);
  assert.equal(KEEP_DAYS, 7);
  assert.ok(purge(now) >= 1);
  assert.equal(get('trash', a), undefined);
  assert.ok(get('trash', b));
  forget(b);
  assert.equal(get('trash', b), undefined);
  assert.ok(!all('meals').some((m) => m.id === 'm_new')); // forgotten = gone
});

test('data 3 → 4 adds an empty bin and keeps every row (old food rows simply have no fiber/salt)', () => {
  const v3 = {
    app: 'vidrichka-fitness',
    version: 3,
    stores: { food: [{ id: 'f', kcal: 100, p: 1, c: 1, f: 1 }], foods: [{ id: 'custom_1', kcal: 50 }], photos: [] },
  };
  const m = migrate(v3);
  assert.equal(m.version, DATA_VERSION);
  assert.deepEqual(m.stores.trash, []);
  assert.deepEqual(m.stores.food, v3.stores.food);
  assert.deepEqual(m.stores.foods, v3.stores.foods);
  assert.ok(STORES.includes('trash'));
  const kept = migrate({ ...v3, stores: { ...v3.stores, trash: [{ id: 'tr_1' }] } });
  assert.deepEqual(kept.stores.trash, [{ id: 'tr_1' }]);
});

test('every 1.3.1 string exists in both languages', () => {
  const keys = Object.keys(bg).filter((k) =>
    /^(undo\.|trash\.|food\.(fiber|salt|editItem|moveTo|movedTo|gramsChanged|itemChanged|waterRemoved|saveCombo|comboSaved|comboAdded|tapAgain)|manual\.(fib|salt|optional)|photo\.deleted|voice\.saved|voice\.waterAdded|whatsNew\.(voiceMeal|fiberSalt|mealEdit|undo|combos))/.test(
      k,
    ),
  );
  assert.ok(keys.length >= 45, String(keys.length));
  for (const k of keys) assert.ok(k in en, k);
  assert.equal(bg['undo.undo'], 'Отмени');
  assert.equal(bg['trash.title'], 'Наскоро изтрити');
  assert.equal(bg['manual.fib'], 'Фибри / 100 г');
  assert.equal(bg['manual.salt'], 'Сол / 100 г');
  assert.equal(bg['food.saveCombo'], 'Запази като комбинация');
});
