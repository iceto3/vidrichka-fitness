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
  let level = 1,
    rest = Math.max(0, Math.floor(total || 0));
  while (rest >= xpNeeded(level)) rest -= xpNeeded(level++);
  return { level, into: rest, need: xpNeeded(level), pct: rest / xpNeeded(level) };
}

/**
 * Sets needed for a workout to count as completed (XP bonus, streak, weekly goal): half of
 * the planned sets rounded up, but at least 3 (or every set when fewer than 3 are planned).
 * @param {number} planned
 */
export const minSetsForWorkout = (planned) => Math.min(Math.max(1, planned), Math.max(3, Math.ceil(planned / 2)));

/**
 * Whether a finished workout counts as completed (otherwise it is saved as partial).
 * @param {{setsDone: number, setsPlanned: number}} s
 */
export const isCompleteWorkout = (s) => s.setsDone > 0 && s.setsDone >= minSetsForWorkout(s.setsPlanned);

/**
 * XP earned for a finished workout. A partial workout earns only the per-set XP (no
 * workout bonus, no PR bonus).
 * @param {{setsDone: number, prs: number, partial?: boolean}} s
 */
export const xpForWorkout = (s) =>
  s.setsDone <= 0 ? 0 : s.partial ? XP.perSet * s.setsDone : XP.workout + XP.perSet * s.setsDone + XP.pr * s.prs;
