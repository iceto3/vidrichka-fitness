/**
 * Default daily quests, registered into the quest registry. A quest is data: id, XP,
 * when to show it, when it is done (both pure predicates on Stats) and where tapping goes.
 * @module features/motivation/quests
 */
import { register } from '../../core/registry.js';

/** @typedef {import('./stats.js').Stats} Stats */
/** @type {{id: string, xp: number, go: string, show?: (s: Stats) => boolean, done: (s: Stats) => boolean, detail?: (s: Stats) => Record<string, number>}[]} */
export const QUESTS = [
  { id: 'breakfast', xp: 10, go: 'food/add/breakfast', done: (s) => s.todayMeals.has('breakfast') },
  { id: 'workout', xp: 50, go: 'workouts', done: (s) => s.workedOutToday },
  {
    id: 'water',
    xp: 10,
    go: 'food',
    done: (s) => s.water >= s.waterGoal,
    detail: (s) => ({ n: s.water, goal: s.waterGoal }),
  },
  {
    id: 'measure',
    xp: 15,
    go: 'progress/body',
    show: (s) => s.measuredToday || s.daysSinceMeasure == null || s.daysSinceMeasure >= 7,
    done: (s) => s.measuredToday,
  },
  {
    id: 'meals3',
    xp: 15,
    go: 'food',
    show: (s) => !(s.measuredToday || s.daysSinceMeasure == null || s.daysSinceMeasure >= 7),
    done: (s) => s.todayMeals.size >= 3,
    detail: (s) => ({ n: Math.min(3, s.todayMeals.size), goal: 3 }),
  },
];

register('quests', ...QUESTS.map((q) => ({ ...q, label: `quest.${q.id}` })));
