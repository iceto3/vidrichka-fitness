/**
 * Monthly "Wrapped" numbers, computed purely from stored rows (unit-testable).
 * @module features/motivation/recap
 */
import { dayKey, monthKey, totalMin } from '../../core/dates.js';

/**
 * @param {string} month `YYYY-MM`
 * @param {{sessions: any[], food: any[], measurements: any[], badges: Record<string, number>, days?: any[]}} d
 *   `days` (1.4.0, optional): the daily rows, for steps, sleep and mood.
 */
export function monthRecap(month, d) {
  const ss = d.sessions.filter((s) => monthKey(new Date(s.endedAt)) === month);
  const days = new Set(ss.map((s) => dayKey(s.endedAt)));
  /** @type {Record<string, number>} */
  const exCount = {};
  ss.forEach((s) =>
    s.items?.forEach(
      (/** @type {any} */ it) =>
        it.sets?.some((/** @type {any} */ x) => x.done) && (exCount[it.exId] = (exCount[it.exId] ?? 0) + 1),
    ),
  );
  const top = Object.entries(exCount).sort((a, b) => b[1] - a[1])[0];
  const foodRows = d.food.filter((f) => f.date?.startsWith(month) && f.type !== 'water');
  const foodDays = new Set(foodRows.map((f) => f.date));
  const kcal = foodRows.reduce((a, f) => a + (f.kcal || 0), 0);
  const w = d.measurements
    .filter((m) => m.date?.startsWith(month) && m.weight != null)
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  return {
    month,
    workouts: ss.length,
    days: days.size,
    minutes: totalMin(ss),
    volume: Math.round(ss.reduce((a, s) => a + (s.volume || 0), 0)),
    sets: ss.reduce((a, s) => a + (s.setsDone || 0), 0),
    kcalBurned: Math.round(ss.reduce((a, s) => a + (s.kcal || 0), 0)),
    prs: ss.flatMap((s) => s.prs ?? []),
    topExercise: top ? { exId: top[0], times: top[1] } : null,
    foodDays: foodDays.size,
    avgKcal: foodDays.size ? Math.round(kcal / foodDays.size) : 0,
    weightDelta: w.length >= 2 ? Math.round((w[w.length - 1].weight - w[0].weight) * 10) / 10 : null,
    ...lifeRecap(month, d.days ?? [], d.food),
    badges: Object.entries(d.badges)
      .filter(([, ts]) => monthKey(new Date(ts)) === month)
      .map(([id]) => id),
  };
}

/** Average of numbers (1 decimal), null if none. @param {number[]} xs */
const avg = (xs) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : null);

/**
 * 1.4.0 recap of daily life: steps, sleep, mood and water in the month.
 * @param {string} month @param {any[]} days daily rows (`id` = day key) @param {any[]} food
 */
export function lifeRecap(month, days, food) {
  const rows = days.filter((r) => typeof r.id === 'string' && r.id.startsWith(month));
  const steps = rows.map((r) => r.steps).filter((n) => typeof n === 'number' && n > 0);
  const sleep = rows.map((r) => r.sleepH).filter((n) => typeof n === 'number' && n > 0);
  const mood = rows.map((r) => r.mood).filter((n) => typeof n === 'number');
  const water = food
    .filter((f) => f.type === 'water' && f.date?.startsWith(month) && f.glasses > 0)
    .map((f) => f.glasses);
  return {
    stepDays: steps.length,
    stepsTotal: steps.reduce((a, b) => a + b, 0),
    avgSteps: steps.length ? Math.round(steps.reduce((a, b) => a + b, 0) / steps.length) : 0,
    bestSteps: steps.length ? Math.max(...steps) : 0,
    sleepNights: sleep.length,
    avgSleep: avg(sleep),
    avgMood: avg(mood),
    waterDays: water.length,
    avgWater: avg(water),
  };
}
