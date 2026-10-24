/**
 * Ready-made example workout plans (exactly three, for testing). Users copy & tweak them
 * or build their own in the plan editor. Item fields: exId, sets, reps, weight (kg, 0 for
 * bodyweight), rest (s). `days`: weekdays with Monday = 0.
 */

/** @typedef {{exId: string, sets: number, reps: number, weight: number, rest: number}} PlanItem */
/** @typedef {{id: string, name: {en: string, bg: string}|string, sub?: {en: string, bg: string}|string, place: 'gym'|'home', days: number[], builtin?: boolean, items: PlanItem[]}} Plan */

/** @type {Plan[]} */
export const PLANS = [
  {
    id: 'plan_leg_day', builtin: true, place: 'gym', days: [0, 3],
    name: { en: 'Leg Day', bg: 'Ден за крака' }, sub: { en: 'Glutes & Legs', bg: 'Седалище и крака' },
    items: [
      { exId: 'hip_thrust', sets: 3, reps: 10, weight: 60, rest: 90 },
      { exId: 'bulgarian_split_squat', sets: 3, reps: 12, weight: 0, rest: 75 },
      { exId: 'romanian_deadlift', sets: 3, reps: 10, weight: 40, rest: 90 },
      { exId: 'leg_press', sets: 3, reps: 12, weight: 80, rest: 90 },
      { exId: 'lying_leg_curl', sets: 3, reps: 12, weight: 25, rest: 60 },
      { exId: 'cable_kickback', sets: 3, reps: 15, weight: 10, rest: 60 },
    ],
  },
  {
    id: 'plan_upper_body', builtin: true, place: 'gym', days: [2],
    name: { en: 'Upper Body', bg: 'Горна част' }, sub: { en: 'Back, Chest & Arms', bg: 'Гръб, гърди и ръце' },
    items: [
      { exId: 'lat_pulldown', sets: 3, reps: 10, weight: 35, rest: 90 },
      { exId: 'db_bench_press', sets: 3, reps: 10, weight: 10, rest: 90 },
      { exId: 'seated_cable_row', sets: 3, reps: 12, weight: 30, rest: 90 },
      { exId: 'db_shoulder_press', sets: 3, reps: 10, weight: 7.5, rest: 90 },
      { exId: 'lateral_raise', sets: 3, reps: 15, weight: 4, rest: 60 },
      { exId: 'biceps_curl', sets: 3, reps: 12, weight: 6, rest: 60 },
    ],
  },
  {
    id: 'plan_home_full', builtin: true, place: 'home', days: [5],
    name: { en: 'Home Full Body', bg: 'Цяло тяло у дома' }, sub: { en: 'Bodyweight only', bg: 'Само със собствено тегло' },
    items: [
      { exId: 'bodyweight_squat', sets: 3, reps: 15, weight: 0, rest: 45 },
      { exId: 'push_up', sets: 3, reps: 10, weight: 0, rest: 60 },
      { exId: 'glute_bridge', sets: 3, reps: 15, weight: 0, rest: 45 },
      { exId: 'reverse_lunge', sets: 3, reps: 10, weight: 0, rest: 45 },
      { exId: 'plank', sets: 3, reps: 30, weight: 0, rest: 45 },
      { exId: 'dead_bug', sets: 3, reps: 10, weight: 0, rest: 45 },
    ],
  },
];
