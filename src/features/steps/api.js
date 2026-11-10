/**
 * Public API of the steps feature (1.3.4): today's steps (typed in by hand or said with
 * "Кажи"), the daily goal from Profile and its streak. Steps live on the day's record in
 * the `days` store, so backups and exports include them like every other daily value.
 * @module features/steps/api
 */
import { all } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { dayKey } from '../../core/dates.js';
import { settings } from '../../core/settings.js';
import { day, patchDay } from '../daily/api.js';
import { clampDelta, clampSteps, stepStreak } from './logic.js';

export {
  MAX_STEPS,
  GOAL_MIN,
  GOAL_MAX,
  GOAL_STEP,
  FINE_STEPS,
  SLIDER_STEP,
  clampDelta,
  clampSteps,
  sliderMax,
  snapSteps,
  stepStreak,
} from './logic.js';

/** XP for reaching the step goal (once a day, as a daily quest). */
export const STEPS_XP = 20;

/** The daily step goal. */
export const stepGoal = () => settings().stepGoal || 8000;

/** Steps on a day. @param {string} [date] */
export const steps = (date = dayKey()) => day(date).steps ?? 0;

/**
 * Set a day's total. Reaching today's goal for the first time that day emits `steps:goal`
 * (one celebration a day; the XP comes from the daily quest).
 * @param {string} date @param {number} n @returns {number} The saved total.
 */
export function setSteps(date, n) {
  const before = steps(date),
    total = clampSteps(n),
    goal = stepGoal(),
    rec = day(date);
  const reached = date === dayKey() && before < goal && total >= goal && !rec.stepsCel;
  patchDay(date, { steps: total, ...(reached ? { stepsCel: true } : {}) });
  emit('steps:changed', { date, before, total });
  if (reached) emit('steps:goal', { steps: total, goal });
  return total;
}

/** Add (1.5.0: or take off) steps; the day never goes below 0. @param {string} date @param {number} n */
export const addSteps = (date, n) => setSteps(date, steps(date) + clampDelta(n));

/** Days in a row the goal was reached. */
export const stepRun = () => stepStreak(all('days'), stepGoal(), dayKey());
