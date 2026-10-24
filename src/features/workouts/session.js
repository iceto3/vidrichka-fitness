/**
 * Active-workout mutations and finishing: set edits, rest timer state and saving the
 * finished session with stats, PRs, calories and XP.
 * @module features/workouts/session
 */
import { put, setKv } from '../../core/store.js';
import { exById } from '../library/api.js';
import { bodyWeight } from '../body/api.js';
import { award, xpForWorkout } from '../motivation/api.js';
import { activeWorkout, sessions } from './api.js';
import { detectPRs, estimateKcal, sessionMet, summarize } from './logic.js';

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
  let rest = 0;
  edit((w) => {
    const s = w.items[i].sets[j];
    s.done = !s.done;
    s.doneAt = s.done ? Date.now() : undefined;
    const remaining = w.items.some((/** @type {WItem} */ it) => it.sets.some((x) => !x.done));
    rest = s.done && remaining ? w.items[i].rest : 0;
    w.rest = rest ? { endAt: Date.now() + rest * 1000, total: rest } : null;
  });
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
  const xp = xpForWorkout({ setsDone: totals.setsDone, prs: prs.length });
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
  };
  put('sessions', session);
  setKv('active', null);
  award(`session:${session.id}`, xp);
  return session;
}
