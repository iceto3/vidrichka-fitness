/**
 * Default badges, registered into the badge registry. Add a badge by adding one entry
 * (id, i18n label key `badge.<id>`, icon or short text, colour, predicate on Stats).
 * @module features/motivation/badges
 */
import { register } from '../../core/registry.js';

const G = {
  teal: 'linear-gradient(135deg,#2BB8BE,#0B7F86)', orange: 'linear-gradient(135deg,#FF9F5A,#FF6A1F)',
  gold: 'linear-gradient(135deg,#F7C548,#F59E0B)', violet: 'linear-gradient(135deg,#A88BFF,#7C5CFF)',
  green: 'linear-gradient(135deg,#4CD68F,#1FB46B)', blue: 'linear-gradient(135deg,#6AAEFF,#2F80ED)',
  red: 'linear-gradient(135deg,#FF8A8E,#E5484D)',
};

/** @typedef {import('./stats.js').Stats} Stats */
/** @type {{id: string, icon: string, color: string, earned: (s: Stats) => boolean}[]} */
export const BADGES = [
  { id: 'first_workout', icon: '1', color: G.teal, earned: (s) => s.totalWorkouts >= 1 },
  { id: 'workouts_10', icon: '10', color: G.teal, earned: (s) => s.totalWorkouts >= 10 },
  { id: 'workouts_25', icon: '25', color: G.blue, earned: (s) => s.totalWorkouts >= 25 },
  { id: 'workouts_50', icon: '50', color: G.violet, earned: (s) => s.totalWorkouts >= 50 },
  { id: 'kg_1000', icon: '1K', color: G.gold, earned: (s) => s.totalKg >= 1000 },
  { id: 'kg_10000', icon: '10K', color: G.orange, earned: (s) => s.totalKg >= 10000 },
  { id: 'first_pr', icon: '@trophy', color: G.orange, earned: (s) => s.prCount >= 1 },
  { id: 'streak_4', icon: '@flame', color: G.violet, earned: (s) => s.streak.best >= 4 },
  { id: 'food_7', icon: '@food', color: G.green, earned: (s) => s.food.max >= 7 },
  { id: 'first_measure', icon: '@ruler', color: G.blue, earned: (s) => s.measurements >= 1 },
  { id: 'first_photo', icon: '@camera', color: G.red, earned: (s) => s.photos >= 1 },
  { id: 'challenge', icon: '@target', color: G.gold, earned: (s) => s.challengesDone >= 1 },
  { id: 'level_5', icon: '@star', color: G.gold, earned: (s) => s.level >= 5 },
];

register('badges', ...BADGES.map((b) => ({ ...b, label: `badge.${b.id}` })));
