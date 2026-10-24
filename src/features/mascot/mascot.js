/**
 * Mascot logic: mood from recent activity, which gear the current level unlocks, outfit
 * presets, and the contextual speech-bubble message. Pure functions (unit-testable).
 * @module features/mascot/mascot
 */

/** Gear unlocked at a level (look grows with level). */
export const GEAR_LEVELS = { headband: 1, dumbbell: 3, tank: 5, medal: 8, crown: 12 };

/** Outfit presets the user can choose from once unlocked. */
export const OUTFITS = [
  { id: 'auto', gear: null, level: 1 },
  { id: 'classic', gear: [], level: 1 },
  { id: 'ocean', gear: ['headband'], level: 1 },
  { id: 'sporty', gear: ['headband', 'tank'], level: 5 },
  { id: 'champion', gear: ['headband', 'tank', 'medal'], level: 8 },
  { id: 'royal', gear: ['crown', 'tank', 'medal'], level: 12 },
];

/**
 * Gear to draw for a level and chosen outfit.
 * @param {number} level
 * @param {string} outfit
 * @returns {string[]}
 */
export function gearFor(level, outfit = 'auto') {
  const pick = OUTFITS.find((o) => o.id === outfit && o.level <= level);
  if (pick?.gear) return pick.gear;
  const gear = Object.entries(GEAR_LEVELS)
    .filter(([g, l]) => l <= level && g !== 'dumbbell')
    .map(([g]) => g);
  return gear.includes('crown') ? gear.filter((g) => g !== 'headband') : gear;
}

/**
 * Mood from activity.
 * @param {{daysSinceWorkout: number|null, workedOutToday: boolean, prToday?: boolean}} a
 * @returns {'happy'|'excited'|'sleepy'}
 */
export function moodFor(a) {
  if (a.workedOutToday || a.prToday) return 'excited';
  if (a.daysSinceWorkout != null && a.daysSinceWorkout >= 5) return 'sleepy';
  return 'happy';
}

/**
 * Pick the speech-bubble message key + vars.
 * @param {{streak: number, weekCount: number, goal: number, daysSinceWorkout: number|null, workedOutToday: boolean, todayPlan?: string, hour: number, totalWorkouts: number}} c
 * @returns {{key: string, vars: Record<string, string|number>}}
 */
export function messageFor(c) {
  if (c.totalWorkouts === 0) return { key: 'mascot.first', vars: {} };
  if (c.workedOutToday)
    return {
      key: c.weekCount >= c.goal ? 'mascot.goalDone' : 'mascot.doneToday',
      vars: { n: c.weekCount, goal: c.goal },
    };
  if (c.daysSinceWorkout != null && c.daysSinceWorkout >= 5)
    return { key: 'mascot.miss', vars: { n: c.daysSinceWorkout } };
  if (c.streak >= 2 && c.todayPlan) return { key: 'mascot.streakPlan', vars: { n: c.streak, plan: c.todayPlan } };
  if (c.streak >= 2) return { key: 'mascot.streak', vars: { n: c.streak } };
  if (c.goal - c.weekCount === 1) return { key: 'mascot.oneToGo', vars: {} };
  if (c.todayPlan) return { key: 'mascot.plan', vars: { plan: c.todayPlan } };
  return { key: c.hour < 12 ? 'mascot.morning' : 'mascot.encourage', vars: {} };
}
