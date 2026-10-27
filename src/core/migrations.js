/**
 * Pure data migrations for the app's data model (independent of the IndexedDB schema).
 * A "snapshot" is `{ app, version, exportedAt, stores: { [store]: rows[] } }` — the same
 * shape is used for backups, so imports of old backups are migrated the same way.
 * To change the data model: bump nothing by hand — append a function to MIGRATIONS.
 * @module core/migrations
 */
import { FOODS } from '../data/foods.js';

/**
 * @typedef {{app?: string, version: number, exportedAt?: string, stores: Record<string, any[]>}} Snapshot
 */

/** `MIGRATIONS[i]` turns data version i+1 into i+2 (version 1 is the first release). */
/** @type {((s: Snapshot) => Snapshot)[]} */
export const MIGRATIONS = [
  // 1 -> 2 (1.1.0): add the `days` store (wake/bed, protein, check-ins). Every existing row
  // is kept as is; a backup that already has `days` keeps them.
  (s) => ({ ...s, stores: { ...s.stores, days: s.stores.days ?? [] } }),
  // 2 -> 3 (1.2.1): progress photos become dated sessions with pose slots. Every existing
  // photo is kept (blob untouched) as its own session with the photo in the Front slot and
  // its original date; rows that already have a session are left as they are.
  (s) => ({
    ...s,
    stores: {
      ...s.stores,
      ...(s.stores.photos
        ? {
            photos: s.stores.photos.map((p) =>
              p && !p.session
                ? {
                    ...p,
                    session: `ps_${p.id}`,
                    pose: 'front',
                    time: p.time ?? '',
                    ts: Number.isFinite(p.ts) ? p.ts : new Date(`${p.date}T12:00`).getTime() || 0,
                    shot: { date: p.date, time: p.time ?? '', source: 'upload' },
                  }
                : p,
            ),
          }
        : {}),
    },
  }),
  // 3 -> 4 (1.3.1): add the `trash` store ("Recently deleted"). Food rows and foods may now
  // carry optional fiber (`fib`) and salt (`salt`) in grams; old rows simply don't have them,
  // which means "unknown" – nothing is rewritten, every existing row is kept as is.
  (s) => ({ ...s, stores: { ...s.stores, trash: s.stores.trash ?? [] } }),
  // 4 -> 5 (1.4.0): every built-in food now knows fiber and salt. Diary rows and saved-meal
  // items of a built-in food (`foodId` in FOODS, grams > 0) that have NO fib/salt yet get
  // them for their grams. Add-only: kcal/macros and any value already present are never
  // touched (a past day's totals stay as logged), custom/scanned/voice rows are left alone.
  (s) => {
    const out = { ...s, stores: { ...s.stores } };
    if (s.stores.food) out.stores.food = s.stores.food.map(withFibSalt);
    if (s.stores.meals)
      out.stores.meals = s.stores.meals.map((m) =>
        m && Array.isArray(m.items) ? { ...m, items: m.items.map(withFibSalt) } : m,
      );
    return out;
  },
];

/** Built-in foods by id (for the 4 -> 5 backfill). */
const BUILTIN = new Map(FOODS.map((f) => [f.id, f]));

/**
 * Add the missing fiber/salt of a built-in food's row for its grams (add-only).
 * @param {any} r @returns {any}
 */
export function withFibSalt(r) {
  const f = r && typeof r.foodId === 'string' ? BUILTIN.get(r.foodId) : undefined;
  if (!f || !(Number(r.grams) > 0) || r.type === 'water') return r;
  const k = Number(r.grams) / 100,
    add = {};
  if (r.fib == null && typeof f.fib === 'number') add.fib = Math.round(f.fib * k * 10) / 10;
  if (r.salt == null && typeof f.salt === 'number') add.salt = Math.round(f.salt * k * 100) / 100;
  return Object.keys(add).length ? { ...r, ...add } : r;
}

export const DATA_VERSION = MIGRATIONS.length + 1;
export const APP_ID = 'vidrichka-fitness';

/**
 * Validate the shape of a snapshot (e.g. an imported backup).
 * @param {any} s
 * @returns {string|null} Error code, or null when valid.
 */
export function validate(s) {
  if (!s || typeof s !== 'object' || s.app !== APP_ID) return 'notBackup';
  if (!Number.isInteger(s.version) || s.version < 1) return 'badVersion';
  if (s.version > DATA_VERSION) return 'tooNew';
  if (!s.stores || typeof s.stores !== 'object') return 'notBackup';
  if (Object.values(s.stores).some((rows) => !Array.isArray(rows))) return 'corrupt';
  return null;
}

/**
 * Migrate a snapshot up to DATA_VERSION. Never mutates the input.
 * @param {Snapshot} s
 * @returns {Snapshot}
 */
export function migrate(s) {
  let out = structuredClone(s);
  for (let v = out.version; v < DATA_VERSION; v++) out = { ...MIGRATIONS[v - 1](out), version: v + 1 };
  return out;
}
