/**
 * "vs 4 weeks ago" for body measurements (pure). The comparison value must be an entry
 * that is really about 4 weeks older than the latest one – never an earlier entry from the
 * same day or week (1.3.2 fix: the first entry used to be the fallback).
 * @module features/body/trend
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';

/** How far back the comparison entry must be (days). */
export const TREND_DAYS = 28;

/**
 * Latest value of a field and the value from the newest entry at least {@link TREND_DAYS}
 * days before it (undefined when there is none yet).
 * @param {{date: string, [k: string]: any}[]} rows Measurements, oldest first.
 * @param {string} f Field id.
 * @returns {{v: number|undefined, base: number|undefined, date: string}}
 */
export function latestAndBase(rows, f) {
  const has = rows.filter((r) => r[f] != null);
  const last = has[has.length - 1];
  if (!last) return { v: undefined, base: undefined, date: '' };
  const cut = dayKey(addDays(parseDay(last.date), -TREND_DAYS));
  const base = [...has].reverse().find((r) => r.date <= cut);
  return { v: Number(last[f]), base: base ? Number(base[f]) : undefined, date: last.date };
}
