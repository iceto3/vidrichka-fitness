/**
 * Progress photos, storage side: downscale to JPEG (max 1280 px), store as IndexedDB blobs,
 * cache object URLs, and keep each session's date consistent (see photo-logic.js).
 * The capture date is read from the original file (EXIF) before resizing.
 * @module features/body/photos
 */
import { all, put, uid } from '../../core/store.js';
import { trash } from '../../core/trash.js';
import { emit } from '../../core/bus.js';
import { POSES, applySessionDate, movePhoto as movePlan } from './photo-logic.js';
import { photoDateOf } from './exif.js';

const MAX = 1280;
/** @type {Map<string, string>} */
const urls = new Map();

/** @typedef {import('./photo-logic.js').Photo} Photo @typedef {import('./photo-logic.js').Pose} Pose */

/** Object URL for a photo row. @param {{id: string, blob: Blob}} p */
export function photoUrl(p) {
  if (!urls.has(p.id)) urls.set(p.id, URL.createObjectURL(p.blob));
  return /** @type {string} */ (urls.get(p.id));
}

/**
 * Downscale an image file to a JPEG blob.
 * @param {File} file
 * @returns {Promise<Blob>}
 */
export async function shrink(file) {
  const img = await createImageBitmap(file).catch(() => null);
  if (!img) return file;
  const k = Math.min(1, MAX / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  ((c.width = Math.round(img.width * k)), (c.height = Math.round(img.height * k)));
  /** @type {CanvasRenderingContext2D} */ (c.getContext('2d')).drawImage(img, 0, 0, c.width, c.height);
  return new Promise((res) => c.toBlob((b) => res(b ?? file), 'image/jpeg', 0.85));
}

/** Photos of one session. @param {string} session @returns {Photo[]} */
const ofSession = (session) => all('photos').filter((p) => p.session === session);

/** Write rows whose session date changed. @param {Photo[]} rows */
const writeAll = (rows) => rows.forEach((r) => put('photos', /** @type {any} */ (r)));

/** A new session id. */
export const newSession = () => uid('ps');

/**
 * Save a picked photo into a session slot. Its default date is the EXIF capture date (else
 * an older file date, else now); the session takes the earliest of its photos' dates unless
 * she edited it.
 * @param {string} session @param {Pose} pose @param {File} file
 * @returns {Promise<Photo>}
 */
export async function addPhoto(session, pose, file) {
  const shot = await photoDateOf(file);
  const blob = await shrink(file);
  /** @type {Photo} */
  const row = { id: uid('ph'), session, pose, date: shot.date, time: shot.time, ts: Date.now(), shot, blob };
  const rest = ofSession(session);
  const dated = applySessionDate([...rest, row]);
  const mine = dated.find((r) => r.id === row.id) ?? row;
  put('photos', /** @type {any} */ (mine));
  writeAll(dated.filter((r) => r.id !== row.id));
  return mine;
}

/**
 * Delete a photo into "Recently deleted" (the session's date is re-derived from what is left).
 * @param {string} id
 * @param {{label: string, sub?: string}} meta Text for the bin.
 * @returns {string|null} The bin entry id.
 */
export function deletePhoto(id, meta) {
  const p = all('photos').find((x) => x.id === id);
  if (!p) return null;
  const tid = trash('photo', [{ store: 'photos', row: p }], { ...meta, emoji: '📷' });
  const u = urls.get(id);
  if (u) (URL.revokeObjectURL(u), urls.delete(id));
  writeAll(applySessionDate(ofSession(p.session)));
  return tid;
}

/**
 * After a photo is put back: if its slot was filled meanwhile, it moves to a free slot of
 * the same session (or to its own new session) so nothing is hidden; then the session's
 * date is re-derived with it included.
 * @param {import('../../core/trash.js').TrashEntry} e
 */
export function restoredPhoto(e) {
  const back = e.rows[0]?.row;
  if (!back) return;
  let p = back;
  const others = ofSession(back.session).filter((x) => x.id !== back.id);
  if (others.some((x) => x.pose === back.pose)) {
    const free = POSES.find((pose) => !others.some((x) => x.pose === pose));
    p = free ? { ...back, pose: free } : { ...back, session: newSession() };
    put('photos', p);
  }
  writeAll(applySessionDate(ofSession(p.session)));
}

/** Move a photo to another pose slot (swaps with the photo there). @param {string} id @param {Pose} pose */
export function movePhoto(id, pose) {
  const p = all('photos').find((x) => x.id === id);
  if (p) writeAll(movePlan(ofSession(p.session), id, pose));
}

/**
 * Set a session's date by hand (e.g. taken yesterday, uploaded today). Fully valid, also
 * for the monthly set and streak. @param {string} session @param {{date: string, time?: string}} d
 */
export function setSessionDate(session, d) {
  writeAll(applySessionDate(ofSession(session), { date: d.date, time: d.time ?? '' }));
  emit('photos:dated', session);
}
