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
