/**
 * Ready-made workout plans: three examples plus (1.6.0) the coach's two full-body home days.
 * New built-in plans are added to existing installs once (features/workouts/api.js
 * `seedPlans`); a deleted one never comes back. Users copy & tweak them
 * or build their own in the plan editor. Item fields: exId, sets, reps, weight (kg, 0 for
 * bodyweight), rest (s). `days`: weekdays with Monday = 0.
 */

/** @typedef {{exId: string, sets: number, reps: number, weight: number, rest: number}} PlanItem */
/** @typedef {{id: string, name: {en: string, bg: string}|string, sub?: {en: string, bg: string}|string, place: 'gym'|'home', days: number[], builtin?: boolean, items: PlanItem[]}} Plan */

/** @type {Plan[]} */
export const PLANS = [
  {
    id: 'plan_leg_day',
    builtin: true,
    place: 'gym',
    days: [0, 3],
    name: { en: 'Leg Day', bg: 'Ден за крака' },
    sub: { en: 'Glutes & Legs', bg: 'Седалище и крака' },
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
    id: 'plan_upper_body',
    builtin: true,
    place: 'gym',
    days: [2],
    name: { en: 'Upper Body', bg: 'Горна част' },
    sub: { en: 'Back, Chest & Arms', bg: 'Гръб, гърди и ръце' },
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
    id: 'plan_home_full',
    builtin: true,
    place: 'home',
    days: [5],
    name: { en: 'Home Full Body', bg: 'Цяло тяло у дома' },
    sub: { en: 'Bodyweight only', bg: 'Само със собствено тегло' },
    items: [
      { exId: 'bodyweight_squat', sets: 3, reps: 15, weight: 0, rest: 45 },
      { exId: 'push_up', sets: 3, reps: 10, weight: 0, rest: 60 },
      { exId: 'glute_bridge', sets: 3, reps: 15, weight: 0, rest: 45 },
      { exId: 'reverse_lunge', sets: 3, reps: 10, weight: 0, rest: 45 },
      { exId: 'plank', sets: 3, reps: 30, weight: 0, rest: 45 },
      { exId: 'dead_bug', sets: 3, reps: 10, weight: 0, rest: 45 },
    ],
  },
  // 1.6.0: the coach's home program, day 1 (rest 90 s – the program says 1–2 min)
  {
    id: 'plan_home_day1',
    builtin: true,
    place: 'home',
    days: [1],
    name: { en: 'Day 1 Full Body', bg: 'Ден 1 цяло тяло' },
    sub: { en: 'At home', bg: 'В домашни условия' },
    items: [
      { exId: 'back_squat', sets: 4, reps: 12, weight: 20, rest: 120 },
      { exId: 'reverse_lunge', sets: 3, reps: 12, weight: 6, rest: 90 },
      { exId: 'kb_swing', sets: 3, reps: 15, weight: 10, rest: 90 },
      { exId: 'band_lateral_walk', sets: 3, reps: 10, weight: 0, rest: 90 },
      { exId: 'knee_push_up', sets: 3, reps: 10, weight: 0, rest: 90 },
      { exId: 'db_bent_over_row', sets: 3, reps: 10, weight: 6, rest: 90 },
      { exId: 'one_arm_db_row', sets: 3, reps: 12, weight: 8, rest: 90 },
      { exId: 'lying_db_french_press', sets: 3, reps: 12, weight: 4, rest: 90 },
      { exId: 'lateral_raise', sets: 3, reps: 12, weight: 4, rest: 90 },
      { exId: 'db_shoulder_press', sets: 3, reps: 12, weight: 5, rest: 90 },
      { exId: 'cross_body_crunch', sets: 3, reps: 10, weight: 0, rest: 90 },
    ],
  },
  // 1.6.0: the coach's home program, day 2 (rest 90 s – the program says 1–2 min)
  {
    id: 'plan_home_day2',
    builtin: true,
    place: 'home',
    days: [4],
    name: { en: 'Day 2 Full Body', bg: 'Ден 2 цяло тяло' },
    sub: { en: 'At home', bg: 'В домашни условия' },
    items: [
      { exId: 'bulgarian_split_squat', sets: 3, reps: 12, weight: 4, rest: 90 },
      { exId: 'single_leg_hip_thrust', sets: 3, reps: 12, weight: 0, rest: 90 },
      { exId: 'single_leg_rdl', sets: 3, reps: 12, weight: 0, rest: 90 },
      { exId: 'band_glute_kickback', sets: 3, reps: 15, weight: 0, rest: 90 },
      { exId: 'band_abductor_kick', sets: 3, reps: 15, weight: 0, rest: 90 },
      { exId: 'barbell_row', sets: 3, reps: 12, weight: 15, rest: 90 },
      { exId: 'lateral_raise', sets: 3, reps: 12, weight: 4, rest: 90 },
      { exId: 'front_raise', sets: 3, reps: 15, weight: 4, rest: 90 },
      { exId: 'overhead_triceps_extension', sets: 3, reps: 12, weight: 4, rest: 90 },
      { exId: 'hammer_curl', sets: 3, reps: 15, weight: 4, rest: 90 },
      { exId: 'kb_knee_tuck_situp', sets: 3, reps: 12, weight: 4, rest: 90 },
    ],
  },
];
