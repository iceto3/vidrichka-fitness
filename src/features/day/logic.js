/**
 * 1.4.0 Day data (pure, unit tested): everything recorded on one calendar day, built from
 * the stored rows (`days`, `food`, `sessions`). This is the ONE place that knows how a day
 * is assembled; the day view, Home's today cards and Progress › Charts (`dailyRows`) all
 * read through it, so a past-day edit shows up everywhere and nothing keeps its own counter.
 * @module features/day/logic
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';
import { nightOf } from '../daily/logic.js';
import { dayCreatine } from '../food/creatine.js';

/** Oldest day that can be edited (older keys are refused as typos). */
export const MIN_DAY = '2020-01-01';

/** Highest values the day editor accepts (water glasses; steps/sleep have their own caps). */
export const MAX_GLASSES = 30;

/**
 * Why a day key can't be edited, or null if it can: `invalid` (not a real YYYY-MM-DD
 * date), `future` (after `today`) or `tooOld` (before MIN_DAY).
 * @param {any} date @param {string} today @returns {null|'invalid'|'future'|'tooOld'}
 */
export function dayError(date, today) {
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return 'invalid';
  if (dayKey(parseDay(date)) !== date) return 'invalid'; // e.g. 2026-02-30
  if (date > today) return 'future';
  if (date < MIN_DAY) return 'tooOld';
  return null;
}

/**
 * @typedef {{id: string, name: any, planId?: string, endedAt: number, durationSec: number, volume: number,
 *   setsDone: number, exercises: number, partial: boolean, prs: number}} DayWorkout
 * @typedef {{kcal: number, p: number, c: number, f: number, fib: number|null, salt: number|null}} DayTotals
 * @typedef {object} DayData
 * @property {string} date
 * @property {number|null} steps            null = nothing entered
 * @property {{hours: number|null, q: number|null, manual: boolean, bed: number|null, wake: number|null}} sleep
 *   the night before `date`; bed/wake = times saved in the 1.4.2 sleep editor (else null)
 * @property {number|null} mood @property {number|null} energy
 * @property {number|null} water           glasses; null = never touched that day
 * @property {any[]} food                  diary rows (water excluded), by time
 * @property {DayTotals|null} totals       null when no food was logged
 * @property {{foodG: number, suppG: number, totalG: number, rows: number}} creatine  1.4.2, grams
 * @property {DayWorkout[]} workouts       oldest first (partial ones included, flagged)
 */

/**
 * Index the stored rows once (by day) so many days can be built cheaply.
 * @param {{days: any[], food: any[], sessions: any[]}} data
 */
export function indexData(data) {
  const by = new Map(data.days.map((r) => [r.id, r]));
  /** @type {Map<string, any[]>} */
  const food = new Map();
  /** @type {Map<string, number>} */
  const water = new Map();
  for (const r of data.food) {
    if (r.removed) continue;
    if (r.type === 'water') water.set(r.date, r.glasses ?? 0);
    else food.set(r.date, [...(food.get(r.date) ?? []), r]);
  }
  /** @type {Map<string, any[]>} */
  const sessions = new Map();
  for (const s of [...data.sessions].sort((a, b) => a.endedAt - b.endedAt)) {
    const k = dayKey(s.endedAt);
    sessions.set(k, [...(sessions.get(k) ?? []), s]);
  }
  return { by, food, water, sessions };
}

/** Sum a numeric field over rows (1 decimal); null if no row has it. @param {any[]} rows @param {string} k */
const sum = (rows, k) => {
  const v = rows.filter((r) => typeof r[k] === 'number');
  return v.length ? Math.round(v.reduce((a, r) => a + r[k], 0) * 10) / 10 : null;
};

/** @param {any[]} rows @returns {DayTotals|null} */
export function foodTotals(rows) {
  if (!rows.length) return null;
  return {
    kcal: Math.round(sum(rows, 'kcal') ?? 0),
    p: sum(rows, 'p') ?? 0,
    c: sum(rows, 'c') ?? 0,
    f: sum(rows, 'f') ?? 0,
    fib: sum(rows, 'fib'),
    salt: sum(rows, 'salt'),
  };
}

/** @param {any} s @returns {DayWorkout} */
const workoutOf = (s) => ({
  id: s.id,
  name: s.name,
  planId: s.planId,
  endedAt: s.endedAt,
  durationSec: s.durationSec ?? 0,
  volume: Math.round(s.volume ?? 0),
  setsDone: s.setsDone ?? 0,
  exercises: (s.items ?? []).filter((/** @type {any} */ it) => it.sets?.some((/** @type {any} */ x) => x.done)).length,
  partial: !!s.partial,
  prs: s.prs?.length ?? 0,
});

/**
 * One day from an index. @param {ReturnType<typeof indexData>} ix @param {string} date
 * @returns {DayData}
 */
export function dayFromIndex(ix, date) {
  const r = ix.by.get(date) ?? {},
    night = nightOf(ix.by, date),
    food = [...(ix.food.get(date) ?? [])].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  return {
    date,
    steps: typeof r.steps === 'number' && r.steps > 0 ? r.steps : null,
    sleep: {
      hours: night.hours ?? null,
      q: night.sleepQ ?? null,
      manual: typeof r.sleepH === 'number',
      bed: night.sleepBed,
      wake: night.sleepWake,
    },
    mood: r.mood ?? null,
    energy: r.energy ?? null,
    water: ix.water.has(date) ? /** @type {number} */ (ix.water.get(date)) : null,
    food,
    totals: foodTotals(food),
    creatine: dayCreatine(food, r.creatineG),
    workouts: (ix.sessions.get(date) ?? []).map(workoutOf),
  };
}

/** One day straight from the stored rows. @param {{days: any[], food: any[], sessions: any[]}} data @param {string} date */
export const buildDay = (data, date) => dayFromIndex(indexData(data), date);

/** The `n` day keys ending `today`, oldest first. @param {number} n @param {string} today */
export const lastDays = (n, today) => Array.from({ length: n }, (_, i) => dayKey(addDays(parseDay(today), i - n + 1)));

/** Is there anything recorded on the day? @param {DayData} d */
export const hasData = (d) =>
  d.steps != null ||
  d.sleep.hours != null ||
  d.sleep.q != null ||
  d.mood != null ||
  d.energy != null ||
  (d.water ?? 0) > 0 ||
  d.food.length > 0 ||
  d.creatine.suppG > 0 ||
  d.workouts.length > 0;

/**
 * @typedef {{date: string, value: number, q: number|null, on: boolean}} ShotRow
 * A value read from a screenshot, waiting for the user's OK (date and value editable).
 */

/**
 * Turn what the server read from a screenshot into rows to confirm (1.4.0). The first
 * reading without a date goes to `fallback` (the day the button was pressed for), unless
 * that day is already taken; other undated readings are dropped. Future / invalid dates
 * are never offered. Newest first.
 * @param {{date: string|null, steps?: number, hours?: number, quality?: number|null}[]} days
 * @param {'steps'|'sleep'} kind @param {string} fallback @param {string} today
 * @returns {ShotRow[]}
 */
export function shotRows(days, kind, fallback, today) {
  /** @type {Map<string, ShotRow>} */
  const out = new Map();
  const undated = [];
  for (const d of days ?? []) {
    const value = Number(kind === 'steps' ? d.steps : d.hours);
    if (!Number.isFinite(value) || value <= 0) continue;
    const row = { value, q: kind === 'sleep' ? (d.quality ?? null) : null, on: true };
    if (d.date && dayError(d.date, today) == null) {
      if (!out.has(d.date)) out.set(d.date, { date: d.date, ...row });
    } else if (!d.date) undated.push(row);
  }
  if (undated.length && !out.has(fallback) && dayError(fallback, today) == null)
    out.set(fallback, { date: fallback, ...undated[0] });
  return [...out.values()].sort((a, b) => (a.date < b.date ? 1 : -1));
}
