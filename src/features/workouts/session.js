/**
 * Active-workout mutations and finishing: set edits, rest timer state and saving the
 * finished session with stats, PRs, calories and XP.
 * @module features/workouts/session
 */
import { emit } from '../../core/bus.js';
import { get, kv, put, setKv } from '../../core/store.js';
import { trash } from '../../core/trash.js';
import { fmtDate } from '../../core/i18n.js';
import { exById } from '../library/api.js';
import { bodyWeight } from '../body/api.js';
import { award, isCompleteWorkout, setAward, xpForWorkout } from '../motivation/api.js';
import { activeWorkout, planName, sessions } from './api.js';
import { detectPRs, estimateKcal, recomputeAfterDelete, sessionMet, summarize } from './logic.js';

/** @typedef {import('./logic.js').WItem} WItem */

/**
 * Mutate the active workout and persist it.
 * @param {(w: any) => void} fn
 */
export function edit(fn) {
  const w = structuredClone(activeWorkout());
  if (!w) return null;
  fn(w);
  setKv('active', w);
  return w;
}

/** Round to the nearest 0.25 and clamp at 0. @param {number} v */
const clean = (v) => Math.max(0, Math.round(v * 4) / 4);

/**
 * Change weight of set j of item i; later unfinished sets follow.
 * @param {number} i @param {number} j @param {number} value
 */
export const setWeight = (i, j, value) =>
  edit((w) => {
    const it = w.items[i],
      v = clean(value);
    it.sets.forEach((/** @type {any} */ s, k) => (k === j || (k > j && !s.done)) && (s.w = v));
  });

/** Change reps of set j of item i. @param {number} i @param {number} j @param {number} value */
export const setReps = (i, j, value) => edit((w) => (w.items[i].sets[j].r = Math.max(0, Math.round(value))));

/**
 * Toggle a set's done state. Returns the rest seconds to start (0 if none).
 * @param {number} i @param {number} j
 */
export function toggleDone(i, j) {
  let rest = 0,
    /** @type {{done: number, total: number}|null} */ done = null;
  edit((w) => {
    const s = w.items[i].sets[j];
    s.done = !s.done;
    s.doneAt = s.done ? Date.now() : undefined;
    const remaining = w.items.some((/** @type {WItem} */ it) => it.sets.some((x) => !x.done));
    rest = s.done && remaining ? w.items[i].rest : 0;
    w.rest = rest ? { endAt: Date.now() + rest * 1000, total: rest } : null;
    if (s.done && remaining) {
      const all = w.items.flatMap((/** @type {WItem} */ it) => it.sets);
      done = { done: all.filter((x) => x.done).length, total: all.length };
    }
  });
  if (done) emit('set:done', done); // → small celebration (not for the last set: the workout ends)
  return rest;
}

/** Add a set (copying the last one) to item i. @param {number} i */
export const addSet = (i) =>
  edit((w) => {
    const sets = w.items[i].sets,
      last = sets[sets.length - 1];
    sets.push({ w: last?.w ?? 0, r: last?.r ?? w.items[i].target.reps, done: false });
  });

/** Remove the last unfinished set of item i. @param {number} i */
export const removeSet = (i) =>
  edit((w) => {
    const sets = w.items[i].sets,
      k = sets.map((/** @type {any} */ s) => s.done).lastIndexOf(false);
    if (k >= 0 && sets.length > 1) sets.splice(k, 1);
  });

/** Adjust the running rest timer. @param {number} sec Seconds to add. */
export const addRest = (sec) => edit((w) => w.rest && ((w.rest.endAt += sec * 1000), (w.rest.total += sec)));

/** Stop the rest timer. */
export const skipRest = () => edit((w) => (w.rest = null));

/** Discard the active workout. */
export const discard = () => setKv('active', null);

/**
 * Finish and save the active workout as a session.
 * @returns {any} The saved session.
 */
export function finish() {
  const w = activeWorkout();
  if (!w) return null;
  const endedAt = Date.now(),
    durationSec = Math.round((endedAt - w.startedAt) / 1000);
  const items = w.items.filter((/** @type {WItem} */ it) => it.sets.some((s) => s.done));
  const totals = summarize(w.items, exById);
  const prs = detectPRs(items, sessions(), exById);
  const bodyKg = bodyWeight();
  const kcal = estimateKcal(sessionMet(items, exById), bodyKg, durationSec);
  // Too few sets → saved as a partial workout: per-set XP only, no workout bonus, and it
  // does not count for the streak / weekly goal (see motivation/xp.js).
  const partial = !isCompleteWorkout(totals);
  const xp = xpForWorkout({ setsDone: totals.setsDone, prs: prs.length, partial });
  const session = {
    id: w.id,
    planId: w.planId,
    name: w.name,
    startedAt: w.startedAt,
    endedAt,
    durationSec,
    items: w.items,
    ...totals,
    prs,
    kcal,
    bodyKg,
    xp,
    ...(partial ? { partial: true } : {}),
  };
  put('sessions', session);
  setKv('active', null);
  emit('workout:finished', session); // → medium celebration (queued before any level-up)
  award(`session:${session.id}`, xp);
  return session;
}

/**
 * Delete a finished workout and keep everything derived from it consistent: its XP entry is
 * removed, and every later workout's PRs (and so its XP) are recomputed against the history
 * without it. Streak, weekly goal and Lifts are derived from the sessions, so they follow.
 * Badges already earned are kept. 1.3.1: the workout goes to "Recently deleted" (see
 * {@link restoreSession}).
 * @param {string} id
 * @returns {string|false} The bin entry id, or false if there was no such workout.
 */
export function deleteSession(id) {
  const gone = get('sessions', id);
  if (!gone) return false;
  const ledger = kv('xp', {})[`session:${id}`] ?? null;
  const tid = trash('session', [{ store: 'sessions', row: gone }], {
    label: planName(gone),
    sub: fmtDate(new Date(gone.endedAt), { day: 'numeric', month: 'short', year: 'numeric' }),
    emoji: '🏋️',
    extra: { ledger },
  });
  setAward(`session:${id}`, 0);
  for (const c of recomputeAfterDelete(sessions(), gone.endedAt, exById, xpForWorkout)) {
    put('sessions', { ...get('sessions', c.id), prs: c.prs, xp: c.xp });
    setAward(`session:${c.id}`, c.xp);
  }
  emit('workout:deleted', { id });
  return tid;
}

/**
 * After a deleted workout is put back: recompute its own and every later workout's PRs/XP
 * against the full history again, and restore its XP entry (with its original date).
 * @param {import('../../core/trash.js').TrashEntry} e
 */
export function restoreSession(e) {
  const back = e.rows[0]?.row;
  if (!back) return;
  for (const c of recomputeAfterDelete(sessions(), back.endedAt - 1, exById, xpForWorkout)) {
    put('sessions', { ...get('sessions', c.id), prs: c.prs, xp: c.xp });
    if (c.id !== back.id) setAward(`session:${c.id}`, c.xp);
  }
  const xp = get('sessions', back.id)?.xp ?? 0;
  const ledger = { ...kv('xp', {}) };
  if (xp > 0) ledger[`session:${back.id}`] = { amt: xp, ts: e.extra?.ledger?.ts ?? back.endedAt };
  setKv('xp', ledger);
  emit('workout:restored', { id: back.id });
}
