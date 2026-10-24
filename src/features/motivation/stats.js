/**
 * Builds the "stats context" used by badges, quests, challenges, the mascot and Home.
 * Pure: takes plain data, returns derived numbers — easy to unit test.
 * @module features/motivation/stats
 */
import { addDays, dayKey, daysBetween, monthKey, parseDay } from '../../core/dates.js';
import { weeklyStreak } from './streak.js';

/**
 * @typedef {object} StatsInput
 * @property {any[]} sessions      Finished workout sessions ({endedAt, volume, prs, setsDone}).
 * @property {any[]} food          Food diary rows ({date, meal, type}).
 * @property {any[]} measurements  ({date}).
 * @property {any[]} photos        ({date}).
 * @property {any[]} [days]        Daily-rhythm rows ({id: day, wake, proteinStart, proteinAt, bed…}).
 * @property {(week: string) => number} goalAt
 * @property {number} waterGoal
 * @property {number} [level]
 * @property {Date} [now]
 */

/**
 * Longest and current run of consecutive days present in a set.
 * @param {Set<string>} days
 * @param {Date} now
 */
export function dayRuns(days, now) {
  const sorted = [...days].sort();
  let max = 0,
    run = 0,
    prev = '';
  for (const d of sorted) {
    run = prev && daysBetween(parseDay(prev), parseDay(d)) === 1 ? run + 1 : 1;
    ((max = Math.max(max, run)), (prev = d));
  }
  let cur = 0;
  for (let d = days.has(dayKey(now)) ? now : addDays(now, -1); days.has(dayKey(d)); d = addDays(d, -1)) cur++;
  return { max, current: cur };
}

/**
 * Compute the stats context.
 * @param {StatsInput} i
 */
export function computeStats(i) {
  const now = i.now ?? new Date(),
    today = dayKey(now),
    month = monthKey(now);
  const sessions = [...i.sessions].sort((a, b) => a.endedAt - b.endedAt);
  const workoutDays = sessions.map((s) => dayKey(s.endedAt));
  const last = sessions[sessions.length - 1];
  const meals = i.food.filter((f) => f.type !== 'water');
  const foodDays = new Set(meals.map((f) => f.date));
  const todayMeals = new Set(meals.filter((f) => f.date === today).map((f) => f.meal));
  const water = i.food.find((f) => f.type === 'water' && f.date === today)?.glasses ?? 0;
  const lastMeasure = [...i.measurements].sort((a, b) => (a.date < b.date ? 1 : -1))[0];
  /** @type {Record<string, number>} */
  const perMonth = {};
  workoutDays.forEach((d) => (perMonth[d.slice(0, 7)] = (perMonth[d.slice(0, 7)] ?? 0) + 1));
  const target = (/** @type {string} */ m) => i.goalAt(`${m}-01`) * 4;
  return {
    today,
    month,
    level: i.level ?? 1,
    totalWorkouts: sessions.length,
    totalKg: sessions.reduce((a, s) => a + (s.volume || 0), 0),
    prCount: sessions.reduce((a, s) => a + (s.prs?.length || 0), 0),
    streak: weeklyStreak(workoutDays, i.goalAt, now),
    workedOutToday: workoutDays.includes(today),
    prToday: sessions.some((s) => dayKey(s.endedAt) === today && s.prs?.length),
    daysSinceWorkout: last ? daysBetween(last.endedAt, now) : null,
    lastSession: last ?? null,
    food: dayRuns(foodDays, now),
    todayMeals,
    water,
    waterGoal: i.waterGoal,
    measurements: i.measurements.length,
    measuredToday: lastMeasure?.date === today,
    daysSinceMeasure: lastMeasure ? daysBetween(parseDay(lastMeasure.date), now) : null,
    photos: i.photos.length,
    /** Today's daily-rhythm record (wake, protein, check-ins) or null. */
    dayRec: (i.days ?? []).find((d) => d.id === today) ?? null,
    monthWorkouts: perMonth[month] ?? 0,
    monthTarget: target(month),
    challengesDone: Object.entries(perMonth).filter(([m, n]) => n >= target(m)).length,
  };
}

/** @typedef {ReturnType<typeof computeStats>} Stats */
