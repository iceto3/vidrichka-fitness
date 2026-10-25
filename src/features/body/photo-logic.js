/**
 * Progress photos as dated sessions with four pose slots — pure logic (no DOM, no storage),
 * shared with unit tests.
 *
 * A photo row: `{id, blob, session, pose, date, time, ts, shot, edited}`
 *  - `session` groups the photos of one upload session; `pose` is its slot.
 *  - `date`/`time` is the session's date (the same on all its photos): the earliest capture
 *    date of its photos (`shot`, from EXIF / file date / upload), unless she edited it
 *    (`edited: true`) — an edited date is fully valid, also for the monthly set and streak.
 *  - `ts` is when the photo was added (upload time; shown as "added …").
 * Everything chronological sorts by date, then time, then upload time.
 * @module features/body/photo-logic
 */

import { POSES } from '../../data/photos.js';

export { POSES, PHOTO_DAY } from '../../data/photos.js';
/** @typedef {typeof POSES[number]} Pose */

/**
 * @typedef {object} Photo
 * @property {string} id @property {string} session @property {Pose} pose
 * @property {string} date `YYYY-MM-DD` (session date) @property {string} [time] `HH:MM`
 * @property {number} ts Added at (ms) @property {boolean} [edited] Date set by hand
 * @property {{date: string, time: string, source: string}} [shot] This photo's own capture date
 * @property {Blob} [blob]
 */

/**
 * @typedef {object} Session
 * @property {string} id @property {string} date @property {string} time
 * @property {boolean} edited @property {number} ts First upload time
 * @property {Partial<Record<Pose, Photo>>} slots @property {Photo[]} photos
 */

/** Sort key: date, time, upload time. @param {Photo} a @param {Photo} b */
export const byWhen = (a, b) =>
  a.date !== b.date
    ? a.date < b.date
      ? -1
      : 1
    : (a.time ?? '') !== (b.time ?? '')
      ? (a.time ?? '') < (b.time ?? '')
        ? -1
        : 1
      : a.ts - b.ts;

/** Photos oldest first. @param {Photo[]} photos */
export const sortPhotos = (photos) => [...photos].sort(byWhen);

/**
 * Sessions, oldest first (by session date, time, first upload).
 * @param {Photo[]} photos
 * @returns {Session[]}
 */
export function sessionsOf(photos) {
  /** @type {Map<string, Session>} */
  const m = new Map();
  for (const p of sortPhotos(photos)) {
    let s = m.get(p.session);
    if (!s) {
      s = { id: p.session, date: p.date, time: p.time ?? '', edited: !!p.edited, ts: p.ts, slots: {}, photos: [] };
      m.set(p.session, s);
    }
    s.photos.push(p);
    s.ts = Math.min(s.ts, p.ts);
    if (!s.slots[p.pose]) s.slots[p.pose] = p;
  }
  return [...m.values()].sort(
    (a, b) => byWhen(/** @type {any} */ (a), /** @type {any} */ (b)) || (a.id < b.id ? -1 : 1),
  );
}

/**
 * The session date its photos should carry: the edited one, or the earliest capture date.
 * @param {Photo[]} photos Photos of one session.
 * @param {{date: string, time: string} | null} [edit] A date she set by hand.
 * @returns {{date: string, time: string, edited: boolean} | null}
 */
export function sessionDate(photos, edit = null) {
  if (edit) return { date: edit.date, time: edit.time ?? '', edited: true };
  const keep = photos.find((p) => p.edited);
  if (keep) return { date: keep.date, time: keep.time ?? '', edited: true };
  const shots = photos
    .map((p) => p.shot ?? { date: p.date, time: p.time ?? '' })
    .sort((a, b) => (a.date !== b.date ? (a.date < b.date ? -1 : 1) : a.time < b.time ? -1 : 1));
  return shots[0] ? { date: shots[0].date, time: shots[0].time ?? '', edited: false } : null;
}

/**
 * Rows to write so every photo of the session carries the session date.
 * @param {Photo[]} photos Photos of one session. @param {{date: string, time: string} | null} [edit]
 * @returns {Photo[]} only the changed rows
 */
export function applySessionDate(photos, edit = null) {
  const d = sessionDate(photos, edit);
  if (!d) return [];
  return photos
    .filter((p) => p.date !== d.date || (p.time ?? '') !== d.time || !!p.edited !== d.edited)
    .map((p) => ({ ...p, date: d.date, time: d.time, edited: d.edited }));
}

/**
 * Before/after for one pose: the oldest photo vs the newest. Never the same photo twice — with
 * only one photo it is the latest ("after") and "before" is empty.
 * @param {Photo[]} photos @param {Pose} pose
 */
export function beforeAfter(photos, pose) {
  const list = sortPhotos(photos.filter((p) => p.pose === pose));
  const after = list[list.length - 1] ?? null;
  return { before: list.length > 1 ? list[0] : null, after, list };
}

/** `YYYY-MM` of a day key. @param {string} day */
export const monthOf = (day) => day.slice(0, 7);

/** Poses photographed in a month (by session date). @param {Photo[]} photos @param {string} month */
export const monthPoses = (photos, month) =>
  new Set(photos.filter((p) => monthOf(p.date) === month).map((p) => p.pose));

/** All four poses done in that month. @param {Photo[]} photos @param {string} month */
export const monthComplete = (photos, month) => monthPoses(photos, month).size === POSES.length;

/** Month key `n` months before `month`. @param {string} month @param {number} n */
export function prevMonth(month, n = 1) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(y, m - 1 - n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Monthly streak: consecutive complete months up to now. The current month counts once it
 * is complete; until then the streak runs up to last month (so it is not "broken" on the 2nd).
 * @param {Photo[]} photos @param {string} month Current month `YYYY-MM`.
 * @returns {{current: number, best: number, thisMonth: boolean}}
 */
export function photoStreak(photos, month) {
  const done = new Set([...new Set(photos.map((p) => monthOf(p.date)))].filter((m) => monthComplete(photos, m)));
  const thisMonth = done.has(month);
  let current = 0;
  for (let m = thisMonth ? month : prevMonth(month); done.has(m); m = prevMonth(m)) current++;
  let best = 0;
  for (const m of done) {
    if (done.has(prevMonth(m))) continue; // not the start of a run
    let n = 0;
    for (let k = m; done.has(k); k = prevMonth(k, -1)) n++;
    best = Math.max(best, n);
  }
  return { current, best, thisMonth };
}

/**
 * Slots for several new photos: the empty slots of the session, in pose order.
 * @param {number} n Files picked. @param {Iterable<string>} taken Poses already filled.
 * @returns {Pose[]} One pose per file that fits (extra files get no slot).
 */
export function assignSlots(n, taken) {
  const used = new Set(taken);
  return POSES.filter((p) => !used.has(p)).slice(0, n);
}

/**
 * Move a photo to another slot of its session (swapping with the photo already there).
 * @param {Photo[]} photos Photos of one session. @param {string} id @param {Pose} to
 * @returns {Photo[]} rows to write
 */
export function movePhoto(photos, id, to) {
  const p = photos.find((x) => x.id === id);
  if (!p || p.pose === to) return [];
  const other = photos.find((x) => x.pose === to && x.id !== id);
  return [{ ...p, pose: to }, ...(other ? [{ ...other, pose: p.pose }] : [])];
}
