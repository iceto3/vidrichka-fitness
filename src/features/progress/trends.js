/**
 * 1.3.4 Progress › Trends maths (pure, unit tested): one row per day with everything the
 * charts need (steps, sleep, mood, energy, water, kcal, protein, fiber, salt), weekly
 * workout counts/volume, step-goal streaks and the insight cards (simple comparisons that
 * appear once there are at least 14 days of data and 5+ days in each group).
 * @module features/progress/trends
 */
import { addDays, parseDay, weekKey } from '../../core/dates.js';
import { dayFromIndex, indexData, lastDays } from '../day/logic.js';

/** Range id → days shown. 3 months are drawn per week. */
export const RANGES = /** @type {const} */ ({ week: 7, month: 30, '3m': 91 });

/** Days of data needed before any insight, and per compared group. */
export const MIN_DAYS = 14;
export const MIN_GROUP = 5;

/**
 * @typedef {{day: string, steps: number|null, sleep: number|null, mood: number|null, energy: number|null,
 *   water: number|null, kcal: number|null, protein: number|null, fib: number|null, salt: number|null,
 *   workout: boolean}} DayRow
 */

/**
 * One row per day, oldest first, for the `n` days ending `today`.
 * @param {{days: any[], food: any[], sessions: any[]}} data @param {number} n @param {string} today
 * @returns {DayRow[]}
 */
export function dailyRows(data, n, today) {
  // 1.4.0: built from the shared day model (features/day/logic), like the day view.
  const ix = indexData(data);
  return lastDays(n, today).map((day) => {
    const d = dayFromIndex(ix, day);
    return {
      day,
      steps: d.steps,
      sleep: d.sleep.hours,
      mood: d.mood,
      energy: d.energy,
      water: d.water,
      kcal: d.totals ? d.totals.kcal : null,
      protein: d.totals ? d.totals.p : null,
      fib: d.totals ? d.totals.fib : null,
      salt: d.totals ? d.totals.salt : null,
      workout: d.workouts.some((w) => !w.partial),
    };
  });
}

/** Mean of the known values (null if none). @param {(number|null)[]} xs */
export const mean = (xs) => {
  const v = /** @type {number[]} */ (xs.filter((x) => typeof x === 'number'));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};

/**
 * Points for a chart: per day, or per week (averages of known days) for long ranges.
 * @param {DayRow[]} rows @param {keyof DayRow} key @param {boolean} weekly
 * @returns {{x: string, y: number|null}[]} `x` is the day (or the week's Monday) key.
 */
export function series(rows, key, weekly) {
  if (!weekly) return rows.map((r) => ({ x: r.day, y: /** @type {number|null} */ (r[key]) }));
  /** @type {Map<string, (number|null)[]>} */
  const wk = new Map();
  for (const r of rows) {
    const k = weekKey(parseDay(r.day));
    wk.set(k, [...(wk.get(k) ?? []), /** @type {number|null} */ (r[key])]);
  }
  return [...wk].map(([x, ys]) => {
    const m = mean(ys);
    return { x, y: m == null ? null : Math.round(m * 10) / 10 };
  });
}

/**
 * Workouts per week (count of completed workouts and volume kg × reps), last `weeks` weeks.
 * @param {any[]} sessions @param {number} weeks @param {string} today
 */
export function weeklyWorkouts(sessions, weeks, today) {
  const first = addDays(parseDay(weekKey(parseDay(today))), -7 * (weeks - 1));
  const keys = Array.from({ length: weeks }, (_, i) => weekKey(addDays(first, i * 7)));
  /** @type {Record<string, {n: number, vol: number}>} */
  const per = Object.fromEntries(keys.map((k) => [k, { n: 0, vol: 0 }]));
  for (const s of sessions) {
    const k = weekKey(new Date(s.endedAt));
    if (!per[k]) continue;
    if (!s.partial) per[k].n++;
    per[k].vol += s.volume || 0;
  }
  return keys.map((x) => ({ x, n: per[x].n, vol: Math.round(per[x].vol) }));
}

/** Days the step goal was reached in the rows, and the longest run. @param {DayRow[]} rows @param {number} goal */
export function goalDays(rows, goal) {
  let run = 0,
    best = 0,
    hit = 0;
  for (const r of rows) {
    if ((r.steps ?? 0) >= goal) ((hit++, run++), (best = Math.max(best, run)));
    else run = 0;
  }
  return { hit, best };
}

/** Days with any tracked value. @param {DayRow[]} rows */
export const dataDays = (rows) =>
  rows.filter(
    (r) =>
      r.steps != null ||
      r.sleep != null ||
      r.mood != null ||
      r.energy != null ||
      r.water != null ||
      r.kcal != null ||
      r.workout,
  ).length;

/**
 * @typedef {{id: string, a: number, b: number, up: boolean, score: number}} Insight
 * `a` = mean in the "yes" group, `b` = in the "no" group; `up` = a > b.
 */

/**
 * Compare a value between two groups of days. Null unless both groups have MIN_GROUP days
 * and the difference reaches `min`.
 * @param {string} id @param {DayRow[]} rows @param {(r: DayRow) => boolean|null} group
 * @param {(r: DayRow) => number|null} val @param {number} min @param {number} scale
 * @returns {Insight|null}
 */
function compare(id, rows, group, val, min, scale) {
  /** @type {number[]} */
  const yes = [],
    no = [];
  for (const r of rows) {
    const g = group(r),
      v = val(r);
    if (g == null || v == null) continue;
    (g ? yes : no).push(v);
  }
  if (yes.length < MIN_GROUP || no.length < MIN_GROUP) return null;
  const a = /** @type {number} */ (mean(yes)),
    b = /** @type {number} */ (mean(no));
  if (Math.abs(a - b) < min) return null;
  return { id, a: Math.round(a * 10) / 10, b: Math.round(b * 10) / 10, up: a > b, score: Math.abs(a - b) / scale };
}

/**
 * Up to two insight cards for the rows (e.g. the last 90 days), strongest first. Nothing
 * before MIN_DAYS days of data.
 * @param {DayRow[]} rows @param {{stepGoal: number}} o @returns {Insight[]}
 */
export function insights(rows, o) {
  if (dataDays(rows) < MIN_DAYS) return [];
  return /** @type {Insight[]} */ (
    [
      compare(
        'sleepEnergy',
        rows,
        (r) => (r.sleep == null ? null : r.sleep >= 7),
        (r) => r.energy,
        0.5,
        4,
      ),
      compare(
        'workoutMood',
        rows,
        (r) => (r.mood == null ? null : r.workout),
        (r) => r.mood,
        0.5,
        4,
      ),
      compare(
        'stepsWater',
        rows,
        (r) => (r.steps == null ? null : r.steps >= o.stepGoal),
        (r) => r.water,
        1,
        8,
      ),
    ].filter(Boolean)
  )
    .sort((x, y) => y.score - x.score)
    .slice(0, 2);
}

/**
 * 1.4.0 weight trend: the day's weight (latest entry of the day) for the `n` days ending
 * `today`, or weekly means for long ranges. Days without a weigh-in are null (the line
 * skips them).
 * @param {any[]} measurements @param {number} n @param {string} today @param {boolean} weekly
 */
export function weightSeries(measurements, n, today, weekly) {
  /** @type {Map<string, {w: number, ts: number}>} */
  const by = new Map();
  for (const m of measurements) {
    if (typeof m.weight !== 'number' || !(m.weight > 0) || typeof m.date !== 'string') continue;
    const ts = Number(m.ts ?? m.createdAt ?? 0),
      cur = by.get(m.date);
    if (!cur || ts >= cur.ts) by.set(m.date, { w: m.weight, ts });
  }
  const rows = lastDays(n, today).map((day) => ({ day, weight: by.get(day)?.w ?? null }));
  return series(/** @type {any} */ (rows), /** @type {any} */ ('weight'), weekly);
}

/**
 * A readable y-range for a weight line: whole kg around the data with grid every 1/2/5 kg.
 * @param {{y: number|null}[]} pts @returns {{min: number, max: number, step: number}|null}
 */
export function weightRange(pts) {
  const ys = /** @type {number[]} */ (pts.map((p) => p.y).filter((y) => y != null));
  if (!ys.length) return null;
  const lo = Math.min(...ys),
    hi = Math.max(...ys),
    span = hi - lo;
  const step = span > 12 ? 5 : span > 5 ? 2 : 1;
  const min = Math.floor((lo - step / 2) / step) * step,
    max = Math.max(min + 2 * step, Math.ceil((hi + step / 2) / step) * step);
  return { min, max, step };
}

/** Does a series have no value at all? @param {{y: number|null}[]} pts */
export const isEmpty = (pts) => pts.every((p) => p.y == null || p.y === 0);
