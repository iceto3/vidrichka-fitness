/**
 * Default quests, registered into the quest registry. A quest is data: id, XP, when to show
 * it, when it is done (both pure predicates on Stats) and where tapping goes.
 *
 * 1.4.3 (part B): quests belong to a section – `daily` (reset every day, the default) or
 * `monthly` (stay until done in the calendar month). See `QUEST_SECTIONS` in api.js: a
 * `weekly` section only needs an entry there and quests with `section: 'weekly'`.
 * @module features/motivation/quests
 */
import { register } from '../../core/registry.js';
import { MEAL_IDS, enabledMeals } from '../../core/settings.js';
import { XP, partialShare } from './xp.js';

/** @typedef {import('./stats.js').Stats} Stats */
/**
 * @typedef {{id: string, xp: number, go: string, order: number, section?: 'daily'|'weekly'|'monthly',
 *   was?: string[], bar?: boolean, unit?: string,
 *   show?: (s: Stats) => boolean, done: (s: Stats) => boolean, detail?: (s: Stats) => Record<string, number>,
 *   state?: (s: Stats) => import('../../core/registry.js').QuestState}} QuestDef
 */

/**
 * 1.4.3 (part B) XP values (see the CHANGELOG): a meal 5 (up to 25 for five meals – the old
 * „закуска“ 10 + „3 хранения“ 15), the day's protein goal 15, workout 50 (partial: its share),
 * water 10, steps 20 (steps/index.js), protein within 30 min 15 / late 8 (daily/index.js);
 * monthly: measurements 30, the four photos 25 (body/index.js, + the 100 XP photo-set bonus).
 */
export const QUEST_XP = { meal: 5, proteinGoal: 15, measure: 30 };

/**
 * Day order of the meal quests (order 2…7, the protein quest sits at 2.5 after breakfast); then
 * „Протеин за деня“ 8, workout 8.5, water 9, steps 10 (steps/index.js).
 */
const MEAL_ORDER = { breakfast: 2, snack_am: 4, lunch: 5, snack: 6, dinner: 7 };

/** @type {QuestDef[]} */
export const QUESTS = [
  {
    id: 'workout',
    xp: XP.workout,
    go: 'workouts',
    // 1.4.3 (fixes): the day's goals in the order of the day – the meals (with the protein
    // breakfast after breakfast), the day's protein, then the workout, water and steps.
    order: 8.5,
    done: (s) => s.workedOutToday,
    // 1.4.3 (part B): a partial workout ticks it with „непълна“ and the done share of the XP;
    // finished the same day it becomes full and gets the rest (the ledger entry is corrected).
    state: (s) =>
      s.workedOutToday
        ? { done: true, xp: XP.workout }
        : s.partialToday
          ? {
              done: true,
              xp: partialShare(s.partialToday.setsDone, s.partialToday.setsPlanned),
              note: 'quest.partialNote',
            }
          : { done: false, xp: XP.workout },
  },
  // One quest per meal that is on (Profile › Meals); replaces „Запиши закуската“ and „3 хранения“.
  ...MEAL_IDS.map(
    (m) =>
      /** @type {QuestDef} */ ({
        id: `meal_${m}`,
        xp: QUEST_XP.meal,
        go: `food/add/${m}`,
        order: MEAL_ORDER[/** @type {keyof typeof MEAL_ORDER} */ (m)],
        was: m === 'breakfast' ? ['breakfast'] : [],
        show: () => enabledMeals().includes(m),
        done: (s) => s.todayMeals.has(m),
      }),
  ),
  // The day's protein from the food diary against Profile › Nutrition (e.g. 82/120 g).
  {
    id: 'proteinGoal',
    xp: QUEST_XP.proteinGoal,
    go: 'food',
    order: 8,
    bar: true,
    unit: 'unit.g',
    show: (s) => s.proteinGoal > 0,
    done: (s) => s.todayProtein >= s.proteinGoal,
    detail: (s) => ({ n: s.todayProtein, goal: s.proteinGoal }),
  },
  {
    id: 'water',
    xp: 10,
    go: 'food',
    order: 9,
    done: (s) => s.water >= s.waterGoal,
    detail: (s) => ({ n: s.water, goal: s.waterGoal }),
  },
  // Monthly: measurements once a calendar month (they can still be entered any day).
  {
    id: 'measure',
    xp: QUEST_XP.measure,
    go: 'progress/body',
    order: 20,
    section: 'monthly',
    was: ['measure'],
    done: (s) => s.measuredThisMonth,
  },
];

register('quests', ...QUESTS.map((q) => ({ ...q, label: `quest.${q.id}` })));
