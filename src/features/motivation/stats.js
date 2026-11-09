/**
 * Builds the "stats context" used by badges, quests, challenges, the mascot and Home.
 * Pure: takes plain data, returns derived numbers — easy to unit test.
 * @module features/motivation/stats
 */
import { addDays, dayKey, daysBetween, monthKey, parseDay, startOfWeek } from '../../core/dates.js';
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
 * @property {number} [proteinGoal] 1.4.3 (part B): grams a day (Profile › Nutrition).
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
  const all = [...i.sessions].sort((a, b) => a.endedAt - b.endedAt);
  // Partial workouts (too few sets, see xp.js) are kept in the history but don't count as workouts.
  const sessions = all.filter((s) => !s.partial);
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
  // 1.4.3 (part B): today's best partial workout (most of its plan done) – the workout quest's share.
  const partialToday =
    all
      .filter((s) => s.partial && dayKey(s.endedAt) === today)
      .map((s) => ({ setsDone: s.setsDone ?? 0, setsPlanned: s.setsPlanned ?? s.setsDone ?? 0 }))
      .sort((a, b) => b.setsDone / Math.max(1, b.setsPlanned) - a.setsDone / Math.max(1, a.setsPlanned))[0] ?? null;
  return {
    today,
    month,
    /** 1.4.3 (part B): Monday of this week – the period key of a future weekly section. */
    week: dayKey(startOfWeek(now)),
    level: i.level ?? 1,
    totalWorkouts: sessions.length,
    totalKg: all.reduce((a, s) => a + (s.volume || 0), 0),
    prCount: all.reduce((a, s) => a + (s.prs?.length || 0), 0),
    streak: weeklyStreak(workoutDays, i.goalAt, now),
    workedOutToday: workoutDays.includes(today),
    partialToday,
    prToday: all.some((s) => dayKey(s.endedAt) === today && s.prs?.length),
    daysSinceWorkout: last ? daysBetween(last.endedAt, now) : null,
    lastSession: last ?? null,
    food: dayRuns(foodDays, now),
    todayMeals,
    water,
    waterGoal: i.waterGoal,
    measurements: i.measurements.length,
    measuredToday: lastMeasure?.date === today,
    /** 1.4.3 (part B): the monthly measurements goal. */
    measuredThisMonth: i.measurements.some((m) => String(m.date).slice(0, 7) === month),
    /** 1.4.3 (part B): today's protein from the food diary (g, rounded) and the day's goal. */
    todayProtein: Math.round(meals.filter((f) => f.date === today).reduce((a, f) => a + (Number(f.p) || 0), 0)),
    proteinGoal: i.proteinGoal ?? 0,
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
