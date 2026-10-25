/**
 * "Recently deleted": instead of deleting rows for good, features move them into the `trash`
 * store together with what is needed to put them back. Entries are kept for {@link KEEP_DAYS}
 * days and then purged. Restoring puts the rows back unchanged (same ids), then runs the
 * feature's restore hook (if any) so derived data – e.g. workout PRs and XP – follows.
 * @module core/trash
 */
import { emit } from './bus.js';
import { all, get, put, remove, uid } from './store.js';

export const KEEP_DAYS = 7;
const DAY = 86400000;

/**
 * @typedef {object} TrashEntry
 * @property {string} id
 * @property {string} kind    e.g. 'food', 'photo', 'session', 'measurement', 'meal', 'plan'.
 * @property {number} ts      When it was deleted (ms).
 * @property {string} label   Already-translated text shown in the bin.
 * @property {string} [sub]   Optional second line (date, grams …).
 * @property {string} [emoji] Optional emoji shown in the bin.
 * @property {{store: string, row: any}[]} rows  Rows to put back.
 * @property {any} [extra]    Anything else the feature's restore hook needs.
 */

/** @type {Map<string, (e: TrashEntry) => void>} */
const hooks = new Map();

/**
 * Register what to do after an entry of `kind` is restored (rows are already back).
 * @param {string} kind
 * @param {(e: TrashEntry) => void} fn
 */
export const onRestore = (kind, fn) => void hooks.set(kind, fn);

/**
 * Move rows to the bin (and out of their stores).
 * @param {string} kind
 * @param {{store: string, row: any}[]} rows
 * @param {{label: string, sub?: string, emoji?: string, extra?: any}} meta
 * @param {number} [now]
 * @returns {string} The bin entry id (pass it to {@link restore}).
 */
export function trash(kind, rows, meta, now = Date.now()) {
  const keep = rows.filter((r) => r.row && r.row.id != null);
  /** @type {TrashEntry} */
  const e = { id: uid('tr'), kind, ts: now, label: meta.label, rows: keep };
  if (meta.sub) e.sub = meta.sub;
  if (meta.emoji) e.emoji = meta.emoji;
  if (meta.extra !== undefined) e.extra = meta.extra;
  put('trash', e);
  for (const r of keep) remove(r.store, r.row.id);
  return e.id;
}

/**
 * Put an entry's rows back and drop it from the bin.
 * @param {string} id
 * @returns {boolean} false if it is no longer in the bin.
 */
export function restore(id) {
  /** @type {TrashEntry|undefined} */
  const e = get('trash', id);
  if (!e) return false;
  for (const r of e.rows) put(r.store, r.row);
  remove('trash', id);
  hooks.get(e.kind)?.(e);
  emit('trash:restored', { kind: e.kind, id });
  return true;
}

/** Delete an entry for good. @param {string} id */
export const forget = (id) => void (get('trash', id) && remove('trash', id));

/**
 * Bin entries, newest first, without the expired ones.
 * @param {number} [now]
 * @returns {TrashEntry[]}
 */
export const trashList = (now = Date.now()) =>
  /** @type {TrashEntry[]} */ (all('trash')).filter((e) => !expired(e, now)).sort((a, b) => b.ts - a.ts);

/** @param {TrashEntry} e @param {number} now */
export const expired = (e, now) => !(now - e.ts < KEEP_DAYS * DAY);

/** Whole days left before an entry is purged (at least 1 while it is shown). @param {TrashEntry} e @param {number} [now] */
export const daysLeft = (e, now = Date.now()) => Math.max(1, Math.ceil((e.ts + KEEP_DAYS * DAY - now) / DAY));

/**
 * Delete expired entries for good.
 * @param {number} [now]
 * @returns {number} How many were purged.
 */
export function purge(now = Date.now()) {
  const old = all('trash').filter((e) => expired(e, now));
  for (const e of old) remove('trash', e.id);
  return old.length;
}
