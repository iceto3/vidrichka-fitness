/**
 * Backup & restore: export all data (photos inlined as data URLs) to a JSON file and
 * import it back after validating the app id / data version and migrating old backups.
 * @module features/profile/backup
 */
import { replaceAll, snapshot } from '../../core/store.js';
import { migrate, validate } from '../../core/migrations.js';
import { setSettings } from '../../core/settings.js';
import { dayKey } from '../../core/dates.js';
import { shareFile } from '../../ui/share.js';

/** @param {Blob} b @returns {Promise<string>} */
const toDataUrl = (b) => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result));
  r.onerror = rej;
  r.readAsDataURL(b);
});

/** @param {string} url */
const fromDataUrl = async (url) => (await fetch(url)).blob();

/** Build the backup JSON string. */
export async function backupJson() {
  const snap = snapshot();
  snap.stores.photos = await Promise.all(snap.stores.photos.map(async (p) => ({ ...p, blob: p.blob instanceof Blob ? await toDataUrl(p.blob) : p.blob })));
  return JSON.stringify(snap);
}

/** Export a backup (Web Share on phones, otherwise download). */
export async function exportBackup() {
  const blob = new Blob([await backupJson()], { type: 'application/json' });
  const r = await shareFile(blob, `vidrichka-backup-${dayKey()}.json`);
  if (r !== 'cancelled') setSettings({ lastBackup: Date.now() });
  return r;
}

/**
 * Parse and validate a backup file.
 * @param {File|Blob} file
 * @returns {Promise<{ok: true, snap: import('../../core/migrations.js').Snapshot, counts: Record<string, number>}|{ok: false, error: string}>}
 */
export async function readBackup(file) {
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    return { ok: false, error: 'notBackup' };
  }
  const error = validate(data);
  if (error) return { ok: false, error };
  const counts = Object.fromEntries(Object.entries(data.stores).map(([k, v]) => [k, /** @type {any[]} */ (v).length]));
  return { ok: true, snap: data, counts };
}

/**
 * Replace all data with a validated backup.
 * @param {import('../../core/migrations.js').Snapshot} snap
 */
export async function restore(snap) {
  const s = migrate(snap);
  s.stores.photos = await Promise.all((s.stores.photos ?? []).map(async (p) => ({ ...p, blob: typeof p.blob === 'string' ? await fromDataUrl(p.blob) : p.blob })));
  await replaceAll(s);
}
