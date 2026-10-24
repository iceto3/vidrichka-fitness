/**
 * XP and level maths (pure). Level L needs 250 + 125·(L−1) XP to reach L+1
 * (so level 7 → 8 needs 1,000 XP, as in the design).
 * @module features/motivation/xp
 */

/** XP rewards in one place. */
export const XP = { workout: 50, perSet: 2, pr: 20, badge: 25, challenge: 100 };

/** XP needed to go from `level` to `level + 1`. @param {number} level */
export const xpNeeded = (level) => 250 + 125 * (level - 1);

/**
 * Level info for a total XP amount.
 * @param {number} total
 * @returns {{level: number, into: number, need: number, pct: number}}
 */
export function levelInfo(total) {
  let level = 1, rest = Math.max(0, Math.floor(total || 0));
  while (rest >= xpNeeded(level)) rest -= xpNeeded(level++);
  return { level, into: rest, need: xpNeeded(level), pct: rest / xpNeeded(level) };
}

/**
 * XP earned for a finished workout.
 * @param {{setsDone: number, prs: number}} s
 */
export const xpForWorkout = (s) => (s.setsDone > 0 ? XP.workout + XP.perSet * s.setsDone + XP.pr * s.prs : 0);
