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

let timer = 0;

/** Check and grant everything that became due. */
export function syncRewards() {
  const s = stats();
  let changed = quests().filter((q) => q.isDone && award(`quest:${s.today}:${q.id}`, q.xp)).length > 0;
  if (s.monthWorkouts >= s.monthTarget && award(`challenge:${s.month}`, XP.challenge)) emit('challenge:done', s.month), (changed = true);
  const earned = kv('badges', {});
  const fresh = registry.badges.filter((b) => !earned[b.id] && b.earned(stats()));
  if (fresh.length) {
    setKv('badges', { ...earned, ...Object.fromEntries(fresh.map((b) => [b.id, Date.now()])) });
    fresh.forEach((b) => (award(`badge:${b.id}`, XP.badge), emit('badge:earned', b)));
    changed = true;
  }
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
