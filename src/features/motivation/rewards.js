/**
 * Reward engine: whenever data changes, award quest XP, unlock badges and complete the
 * monthly challenge — each exactly once (idempotent ids). Runs debounced in the background.
 * @module features/motivation/rewards
 */
import { on, emit } from '../../core/bus.js';
import { kv, setKv } from '../../core/store.js';
import { registry } from '../../core/registry.js';
import { award, quests, stats } from './api.js';
import { XP } from './xp.js';

let timer = 0,
  first = true;

/**
 * Milestones celebrated once: all of today's quests done (`quests:all`) and a longer weekly
 * streak (`streak:week`). The first sync after start only records the baseline, so opening
 * the app (or updating it) never replays an old celebration.
 * @param {import('./stats.js').Stats} s @param {ReturnType<typeof quests>} qs
 */
function milestones(s, qs) {
  const seen = kv('milestones', { quests: '', streak: 0 });
  const next = { ...seen };
  if (qs.length && qs.every((q) => q.isDone) && seen.quests !== s.today) {
    next.quests = s.today;
    if (!first) emit('quests:all', qs.length);
  }
  const weeks = s.streak.weeks;
  if (weeks > seen.streak && !first) emit('streak:week', weeks);
  next.streak = weeks;
  if (next.quests !== seen.quests || next.streak !== seen.streak) setKv('milestones', next);
}

/** Check and grant everything that became due. */
export function syncRewards() {
  const s = stats();
  const qs = quests();
  let changed = qs.filter((q) => q.isDone && award(`quest:${s.today}:${q.id}`, q.xp)).length > 0;
  if (s.monthWorkouts >= s.monthTarget && award(`challenge:${s.month}`, XP.challenge))
    (emit('challenge:done', s.month), (changed = true));
  const earned = kv('badges', {});
  const fresh = registry.badges.filter((b) => !earned[b.id] && b.earned(stats()));
  if (fresh.length) {
    setKv('badges', { ...earned, ...Object.fromEntries(fresh.map((b) => [b.id, Date.now()])) });
    fresh.forEach((b) => (award(`badge:${b.id}`, XP.badge), emit('badge:earned', b)));
    changed = true;
  }
  milestones(stats(), quests());
  first = false;
  if (changed) emit('ui:refresh');
}

/** Start listening for data changes. */
export function startRewards() {
  on('store:any', (/** @type {string} */ name) => {
    if (name === 'kv') return; // our own writes
    clearTimeout(timer);
    timer = setTimeout(syncRewards, 60);
  });
  setTimeout(syncRewards, 0);
}
