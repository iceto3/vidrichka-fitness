/**
 * Public API of the motivation feature: stats context, XP/levels, quests, badges,
 * monthly challenge and the weekly-goal history. Other features import only this file.
 * @module features/motivation/api
 */
import { all, kv, setKv } from '../../core/store.js';
import { settings } from '../../core/settings.js';
import { on, emit } from '../../core/bus.js';
import { registry } from '../../core/registry.js';
import { weekKey } from '../../core/dates.js';
import { computeStats } from './stats.js';
import { levelInfo } from './xp.js';
import './badges.js';
import './quests.js';

export { levelInfo, xpForWorkout, XP } from './xp.js';

/** @type {import('./stats.js').Stats|null} */
let cache = null;
on('store:any', () => (cache = null));
on('settings:changed', () => (cache = null));

/** Weekly goal in force for a given week key (uses the recorded goal history). @param {string} week */
export function goalAt(week) {
  const hist = /** @type {{week: string, goal: number}[]} */ (kv('goalHistory', []));
  return [...hist].reverse().find((h) => h.week <= week)?.goal ?? settings().weeklyGoal;
}

/** Record a weekly-goal change from this week on. @param {number} goal */
export function recordGoal(goal) {
  const week = weekKey();
  const hist = kv('goalHistory', []).filter((/** @type {{week: string}} */ h) => h.week !== week);
  if (!hist.length) hist.push({ week: '0000-00-00', goal: settings().weeklyGoal });
  setKv('goalHistory', [...hist, { week, goal }]);
}

/** Total XP. */
export const xpTotal = () => Object.values(kv('xp', {})).reduce((a, e) => a + (e.amt || 0), 0);

/** Current level info. */
export const level = () => levelInfo(xpTotal());

/**
 * Award XP once per id (idempotent). Emits `level:up` when a level is gained.
 * @param {string} id   Unique reason id, e.g. `session:<id>`.
 * @param {number} amt
 * @returns {boolean} true if newly awarded.
 */
export function award(id, amt) {
  const ledger = kv('xp', {});
  if (ledger[id] || amt <= 0) return false;
  const before = level().level;
  setKv('xp', { ...ledger, [id]: { amt, ts: Date.now() } });
  const after = level().level;
  if (after > before) emit('level:up', after);
  return true;
}

/** Stats context (cached until data changes). */
export function stats() {
  cache ??= computeStats({
    sessions: all('sessions'), food: all('food'), measurements: all('measurements'), photos: all('photos'),
    goalAt, waterGoal: settings().waterGoal, level: level().level,
  });
  return cache;
}

/** Today's quests with completion state. */
export const quests = () => {
  const s = stats();
  return registry.quests.filter((q) => !q.show || q.show(s)).map((q) => ({ ...q, isDone: q.done(s), vars: q.detail?.(s) ?? {} }));
};

/** All badges with earned date (or null). */
export const badges = () => {
  const earned = kv('badges', {});
  return registry.badges.map((b) => ({ ...b, at: earned[b.id] ?? null }));
};
