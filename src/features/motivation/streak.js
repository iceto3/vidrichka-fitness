/**
 * Weekly streak with streak freezes (pure).
 * A week (Mon–Sun) counts when its workouts reach that week's goal. The current week never
 * breaks the streak while it is still running. Every 4 successful weeks in a row earns one
 * freeze (max 2); a missed week automatically uses a freeze instead of resetting.
 * @module features/motivation/streak
 */
import { addDays, parseDay, weekKey } from '../../core/dates.js';

export const MAX_FREEZES = 2;
export const WEEKS_PER_FREEZE = 4;

/**
 * @typedef {object} StreakInfo
 * @property {number} weeks      Current streak length (incl. this week once its goal is met).
 * @property {number} best       Longest streak ever.
 * @property {number} freezes    Freezes available now.
 * @property {number} thisWeek   Workouts this week.
 * @property {number} goal       This week's goal.
 * @property {string[]} frozen   Week keys saved by a freeze.
 */

/**
 * Compute the weekly streak.
 * @param {string[]} workoutDays Day keys (YYYY-MM-DD) of finished workouts.
 * @param {(week: string) => number} goalAt Weekly goal in force for a week key.
 * @param {Date} [now]
 * @returns {StreakInfo}
 */
export function weeklyStreak(workoutDays, goalAt, now = new Date()) {
  /** @type {Record<string, number>} */
  const perWeek = {};
  workoutDays.forEach((d) => { const w = weekKey(parseDay(d)); perWeek[w] = (perWeek[w] ?? 0) + 1; });
  const current = weekKey(now);
  const weeks = Object.keys(perWeek).sort();
  let streak = 0, run = 0, best = 0, freezes = 0;
  /** @type {string[]} */
  const frozen = [];
  for (let w = weeks[0]; w && w < current; w = weekKey(addDays(parseDay(w), 7))) {
    if ((perWeek[w] ?? 0) >= goalAt(w)) {
      streak++, run++;
      if (run % WEEKS_PER_FREEZE === 0 && freezes < MAX_FREEZES) freezes++;
    } else if (streak > 0 && freezes > 0) {
      freezes--, frozen.push(w);
    } else {
      streak = 0, run = 0;
    }
    best = Math.max(best, streak);
  }
  const thisWeek = perWeek[current] ?? 0, goal = goalAt(current);
  const total = streak + (thisWeek >= goal ? 1 : 0);
  return { weeks: total, best: Math.max(best, total), freezes, thisWeek, goal, frozen };
}
