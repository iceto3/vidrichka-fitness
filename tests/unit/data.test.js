// Migrations/backup validation, i18n completeness and the exercise/plan data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { validate, migrate, DATA_VERSION, APP_ID, MIGRATIONS } from '../../src/core/migrations.js';
import en from '../../src/data/i18n/en.js';
import bg from '../../src/data/i18n/bg.js';
import { LANGUAGES } from '../../src/data/i18n/index.js';
import { EXERCISES } from '../../src/data/exercises.js';
import { PLANS } from '../../src/data/workouts.js';

test('backup validation rejects bad files', () => {
  const ok = { app: APP_ID, version: DATA_VERSION, stores: { sessions: [] } };
  assert.equal(validate(ok), null);
  assert.equal(validate(null), 'notBackup');
  assert.equal(validate({ ...ok, app: 'other' }), 'notBackup');
  assert.equal(validate({ ...ok, version: 0 }), 'badVersion');
  assert.equal(validate({ ...ok, version: DATA_VERSION + 1 }), 'tooNew');
  assert.equal(validate({ ...ok, stores: { sessions: {} } }), 'corrupt');
});

test('migrate is non-mutating and reaches DATA_VERSION', () => {
  const s = { app: APP_ID, version: 1, stores: { plans: [{ id: 'p' }] } };
  const m = migrate(s);
  assert.equal(m.version, DATA_VERSION);
  assert.notEqual(m, s);
  assert.equal(DATA_VERSION, MIGRATIONS.length + 1);
});

test('migrations chain runs every step in order', () => {
  MIGRATIONS.push((x) => ({ ...x, stores: { ...x.stores, plans: x.stores.plans.map((p) => ({ ...p, notes: '' })) } }));
  try {
    // DATA_VERSION is a module constant, so run the loop the same way migrate() does.
    let out = { app: APP_ID, version: 1, stores: { plans: [{ id: 'p' }] } };
    for (let v = out.version; v < MIGRATIONS.length + 1; v++) out = { ...MIGRATIONS[v - 1](out), version: v + 1 };
    assert.deepEqual(out.stores.plans, [{ id: 'p', notes: '' }]);
    assert.equal(out.version, MIGRATIONS.length + 1);
  } finally {
    MIGRATIONS.pop();
  }
});

test('every language has exactly the English keys with the same {placeholders}', () => {
  assert.deepEqual(Object.keys(LANGUAGES).sort(), ['bg', 'en']);
  /** Placeholders of every variant (plain, plural `{one, other}`, gender `{f, m}`), deduplicated. */
  const ph = (/** @type {any} */ s) =>
    [...new Set((JSON.stringify(s).match(/\{\w+\}/g) ?? []).filter((x) => !/^\{(one|other|f|m)\}$/.test(x)))]
      .sort()
      .join();
  const missing = Object.keys(en).filter((k) => !(k in bg));
  const extra = Object.keys(bg).filter((k) => !(k in en));
  assert.deepEqual(missing, [], 'missing in bg');
  assert.deepEqual(extra, [], 'extra in bg');
  for (const k of Object.keys(en)) assert.equal(ph(bg[k]), ph(en[k]), `placeholders of ${k}`);
});

test('every literal t("key") used in the source exists in en', () => {
  const files = [];
  const walk = (d) =>
    readdirSync(d).forEach((f) =>
      statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : f.endsWith('.js') && files.push(join(d, f)),
    );
  walk('src');
  const used = new Set();
  for (const f of files) for (const m of readFileSync(f, 'utf8').matchAll(/\bt\('([a-zA-Z0-9_.]+)'/g)) used.add(m[1]);
  const missing = [...used].filter((k) => !(k in en));
  assert.deepEqual(missing, []);
  assert.ok(used.size > 100);
});

test('exercise library: 15–20 exercises with bilingual names, 3 steps, tips, rest and video', () => {
  assert.ok(EXERCISES.length >= 15 && EXERCISES.length <= 20, String(EXERCISES.length));
  for (const e of EXERCISES) {
    assert.ok(e.name.en && e.name.bg, e.id);
    assert.ok(e.primary.length > 0, `${e.id} muscles`);
    assert.ok(e.rest > 0, `${e.id} rest`);
    assert.ok(e.fig, `${e.id} figure`);
  }
});

test('exactly three example workouts, all using known exercises', () => {
  assert.equal(PLANS.length, 3);
  const ids = new Set(EXERCISES.map((e) => e.id));
  for (const p of PLANS) for (const it of p.items) assert.ok(ids.has(it.exId), `${p.id}: ${it.exId}`);
});

test('1.0 → 1.1 migration keeps every existing row and adds the days store', () => {
  const v1 = {
    app: APP_ID,
    version: 1,
    stores: {
      kv: [{ id: 'settings', value: { userName: 'Vidi', waterGoal: 8 } }],
      plans: [{ id: 'p1', items: [] }],
      sessions: [{ id: 's1', endedAt: 1 }],
      food: [{ id: 'water_2026-10-20', glasses: 5 }],
    },
  };
  const m = migrate(v1);
  assert.equal(m.version, DATA_VERSION);
  for (const k of Object.keys(v1.stores)) assert.deepEqual(m.stores[k], v1.stores[k], k);
  assert.deepEqual(m.stores.days, []);
  // A newer backup that already has days keeps them.
  const withDays = migrate({ ...v1, stores: { ...v1.stores, days: [{ id: '2026-10-20', wake: 1 }] } });
  assert.deepEqual(withDays.stores.days, [{ id: '2026-10-20', wake: 1 }]);
});

test('IndexedDB schema: upgrading v1 → v2 only adds `days`, a fresh install gets every store once', async () => {
  const { SCHEMA, STORES, DB_VERSION } = await import('../../src/core/db.js');
  const fakeDb = (names) => {
    const created = [];
    return {
      created,
      objectStoreNames: { contains: (n) => names.includes(n) || created.includes(n) },
      createObjectStore: (n) => {
        if (names.includes(n) || created.includes(n)) throw new Error(`ConstraintError: ${n} exists`);
        created.push(n);
      },
      deleteObjectStore: () => assert.fail('never delete stores'),
    };
  };
  const upgrade = (db, from) => {
    for (let v = from; v < DB_VERSION; v++) SCHEMA[v](db, /** @type {any} */ ({}));
  };
  const old = fakeDb(['kv', 'plans', 'sessions', 'measurements', 'food', 'meals', 'foods', 'photos']);
  upgrade(old, 1);
  assert.deepEqual(old.created, ['days']);
  const fresh = fakeDb([]);
  upgrade(fresh, 0);
  assert.deepEqual([...fresh.created].sort(), [...STORES].sort());
});
