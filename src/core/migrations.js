/**
 * Pure data migrations for the app's data model (independent of the IndexedDB schema).
 * A "snapshot" is `{ app, version, exportedAt, stores: { [store]: rows[] } }` — the same
 * shape is used for backups, so imports of old backups are migrated the same way.
 * To change the data model: bump nothing by hand — append a function to MIGRATIONS.
 * @module core/migrations
 */

/**
 * @typedef {{app?: string, version: number, exportedAt?: string, stores: Record<string, any[]>}} Snapshot
 */

/** `MIGRATIONS[i]` turns data version i+1 into i+2 (version 1 is the first release). */
/** @type {((s: Snapshot) => Snapshot)[]} */
export const MIGRATIONS = [
  // Example for the future:
  // (s) => ({ ...s, stores: { ...s.stores, plans: s.stores.plans.map((p) => ({ ...p, notes: '' })) } }),
];

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
