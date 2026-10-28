// 1.4.0: the whole migration chain (1 → current) keeps every user row and is safe to re-run.
import test from 'node:test';
import assert from 'node:assert/strict';
import { APP_ID, DATA_VERSION, MIGRATIONS, migrate, validate } from '../../src/core/migrations.js';

const v1 = () => ({
  app: APP_ID,
  version: 1,
  stores: {
    sessions: [{ id: 's1', planId: 'a', startedAt: 1, endedAt: 2, sets: [{ kg: 20, reps: 10, done: true }] }],
    food: [
      { id: 'f1', foodId: 'oats', grams: 60, kcal: 230, p: 8, c: 40, f: 4, date: '2026-01-02', meal: 'breakfast' },
      { id: 'f2', foodId: 'custom_x', name: 'Баница', grams: 100, kcal: 300, p: 8, c: 30, f: 16, date: '2026-01-02' },
    ],
    measurements: [{ id: 'm1', date: '2026-01-02', weight: 62.5 }],
    photos: [{ id: 'p1', date: '2026-01-02', blob: 'data:image/jpeg;base64,AA==' }],
    custom: [{ id: 'custom_x', name: 'Баница', kcal: 300, p: 8, c: 30, f: 16 }],
    meals: [],
    kv: [{ id: 'meta', value: { createdAt: 1 } }],
  },
});

test('every data version has exactly one migration step', () => {
  assert.equal(DATA_VERSION, MIGRATIONS.length + 1);
  assert.ok(MIGRATIONS.every((m) => typeof m === 'function'));
});

test('1 → current: no row of any store is lost and old fields survive', () => {
  const old = v1();
  const m = migrate(old);
  assert.equal(m.version, DATA_VERSION);
  for (const [store, rows] of Object.entries(old.stores)) {
    assert.ok(Array.isArray(m.stores[store]), `${store} kept`);
    assert.equal(m.stores[store].length, rows.length, `${store}: same number of rows`);
    rows.forEach((r, i) => {
      for (const [k, v] of Object.entries(r))
        if (k !== 'blob') assert.deepEqual(m.stores[store][i][k], v, `${store}.${k} unchanged`);
    });
  }
  assert.deepEqual(m.stores.days, [], 'later stores are added empty');
  assert.deepEqual(m.stores.trash, []);
  assert.deepEqual(old, v1(), 'the input is not mutated');
});

test('every intermediate version migrates to the same result and re-running is a no-op', () => {
  const full = migrate(v1());
  for (let v = 1; v <= DATA_VERSION; v++) {
    let s = v1();
    for (let i = 1; i < v; i++) s = { ...MIGRATIONS[i - 1](s), version: i + 1 };
    assert.deepEqual(migrate(s), full, `from version ${v}`);
  }
  assert.deepEqual(migrate(full), full);
});

test('backups: unknown, newer or broken files are refused before anything is replaced', () => {
  assert.equal(validate(null), 'notBackup');
  assert.equal(validate({ app: 'other', version: 1, stores: {} }), 'notBackup');
  assert.equal(validate({ app: APP_ID, version: 0, stores: {} }), 'badVersion');
  assert.equal(validate({ app: APP_ID, version: DATA_VERSION + 1, stores: {} }), 'tooNew');
  assert.equal(validate({ app: APP_ID, version: 1, stores: { food: {} } }), 'corrupt');
  assert.equal(validate(v1()), null);
});
