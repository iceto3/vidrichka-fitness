/**
 * Daily steps maths (pure): clamping entered counts and the streak of days the step goal
 * was reached.
 * @module features/steps/logic
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';

/** Highest step count accepted for one day. */
export const MAX_STEPS = 100_000;
/** Step goal limits (Profile). */
export const GOAL_MIN = 1000;
export const GOAL_MAX = 30_000;
export const GOAL_STEP = 500;

/** A step count as a whole number in 0…MAX_STEPS (bad input → 0). @param {any} n */
export const clampSteps = (n) => {
  const v = Math.round(Number(n));
  return Number.isFinite(v) ? Math.min(MAX_STEPS, Math.max(0, v)) : 0;
};

/**
 * Days in a row the goal was reached, ending today (if reached) or yesterday.
 * @param {{id: string, steps?: number}[]} rows `days` records @param {number} goal @param {string} today
 */
export function stepStreak(rows, goal, today) {
  const by = new Map(rows.map((r) => [r.id, r.steps ?? 0]));
  const hit = (/** @type {string} */ k) => (by.get(k) ?? 0) >= goal;
  let k = hit(today) ? today : dayKey(addDays(parseDay(today), -1)),
    n = 0;
  while (hit(k)) (n++, (k = dayKey(addDays(parseDay(k), -1))));
  return n;
}
