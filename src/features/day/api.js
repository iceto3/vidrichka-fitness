/**
 * 1.4.0 Day data layer: the single entry point for reading and editing any day (today or a
 * past one) by its date key. Reads build the day from the stored rows (see ./logic.js);
 * writes are validated (real date, not in the future, sane ranges) and then go to the
 * owning feature's date-keyed API, so XP/celebration rules stay in one place (e.g. the
 * step-goal celebration only fires for today) and streaks, charts and insights — all
 * derived from the same rows — follow automatically.
 *
 * Views (Home's today cards, the day view `#day/<date>`, voice, screenshots) use this
 * module instead of reaching into steps/daily/food directly.
 * @module features/day/api
 */
import { all } from '../../core/store.js';
import { dayKey } from '../../core/dates.js';
import { addSteps, clampSteps, setSteps, stepGoal, stepRun } from '../steps/api.js';
import { MAX_SLEEP_H, clearSleep, rateDay, setSleep, sleepRun } from '../daily/api.js';
import { setWater } from '../food/api.js';
import { MAX_GLASSES, dayError, dayFromIndex, indexData } from './logic.js';

export { MAX_GLASSES, MIN_DAY, dayError, hasData } from './logic.js';
export { MAX_SLEEP_H, stepGoal, stepRun, sleepRun };

/** Thrown for a date or value the day layer refuses. */
export class DayEditError extends Error {
  /** @param {string} code */
  constructor(code) {
    super(`day edit refused: ${code}`);
    this.code = code;
  }
}

/** Throws unless `date` is a real, non-future day. @param {string} date */
export function assertEditable(date) {
  const err = dayError(date, dayKey());
  if (err) throw new DayEditError(err);
  return date;
}

/** May this day be shown/edited? @param {string} date */
export const canEdit = (date) => dayError(date, dayKey()) == null;

/**
 * Everything recorded on a day. @param {string} [date]
 * @returns {import('./logic.js').DayData}
 */
export const readDay = (date = dayKey()) => readDays([date])[0];

/**
 * Several days at once (the stored rows are indexed once). @param {string[]} dates
 * @returns {import('./logic.js').DayData[]}
 */
export function readDays(dates) {
  const ix = indexData({ days: all('days'), food: all('food'), sessions: all('sessions') });
  return dates.map((d) => dayFromIndex(ix, d));
}

/** Set the day's step total. @param {string} date @param {number} n */
export const setDaySteps = (date, n) => setSteps(assertEditable(date), clampSteps(n));

/** Add steps to the day. @param {string} date @param {number} n */
export const addDaySteps = (date, n) => addSteps(assertEditable(date), clampSteps(n));

/** Glasses of water on the day (0…MAX_GLASSES). @param {string} date @param {number} n */
export function setDayWater(date, n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) throw new DayEditError('range');
  setWater(assertEditable(date), Math.min(MAX_GLASSES, Math.max(0, v)));
}

/**
 * Sleep of the night before `date` (hours 0…MAX_SLEEP_H in ½ h, quality 1–5).
 * @param {string} date @param {{hours?: number|null, q?: number|null}} v
 */
export function setDaySleep(date, v) {
  if (v.hours != null && !(Number(v.hours) >= 0 && Number(v.hours) <= MAX_SLEEP_H)) throw new DayEditError('range');
  return setSleep(assertEditable(date), v);
}

/** Delete the day's manual sleep entry. @param {string} date */
export const clearDaySleep = (date) => clearSleep(assertEditable(date));

/** Mood or energy 1–5 (null clears). @param {string} date @param {'mood'|'energy'} field @param {number|null} v */
export function rateDayField(date, field, v) {
  if (field !== 'mood' && field !== 'energy') throw new DayEditError('field');
  if (v != null && !(Number(v) >= 1 && Number(v) <= 5)) throw new DayEditError('range');
  return rateDay(assertEditable(date), field, v);
}
