/**
 * Reward engine: whenever data changes, award quest XP, unlock badges and complete the
 * monthly challenge — each exactly once (idempotent ids). Runs debounced in the background.
 * @module features/motivation/rewards
 */
import { on, emit } from '../../core/bus.js';
import { kv, setKv } from '../../core/store.js';
import { registry } from '../../core/registry.js';
import { award, questKey, quests, setAward, stats } from './api.js';
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
  // 1.4.3 (part B): each quest is keyed by its section's period (day / month). An older id of
  // the same quest already paid in this period (`was`: today's „breakfast“, a „measure“ or
  // „photos4“ of this month under a day key) counts as paid – no double XP after the update.
  const ledger0 = kv('xp', {}),
    keys0 = Object.keys(ledger0);
  const paidBefore = (/** @type {any} */ q) =>
    (q.was ?? []).some((/** @type {string} */ w) =>
      q.section === 'monthly'
        ? keys0.some((k) => k.startsWith(`quest:${s.month}-`) && k.endsWith(`:${w}`))
        : !!ledger0[`quest:${s.today}:${w}`],
    );
  let changed = qs.filter((q) => q.isDone && !paidBefore(q) && award(questKey(q, s), q.gain)).length > 0;
  // 1.4.3 (tester round 3): a quest of today that is no longer done (its breakfast, water,
  // workout… was deleted) gives its XP back; Undo makes it done again and the line above
  // grants it once more. Hidden quests and earlier days are never touched.
  // 1.4.3 (part A): a graded quest whose XP changed (on time ↔ late) is corrected.
  const ledger = kv('xp', {});
  for (const q of qs) {
    const id = questKey(q, s);
    if (!q.isDone && ledger[id]) (setAward(id, 0), (changed = true));
    else if (q.isDone && ledger[id] && ledger[id].amt !== q.gain) (setAward(id, q.gain), (changed = true));
  }
  if (s.monthWorkouts >= s.monthTarget && award(`challenge:${s.month}`, XP.challenge))
    (emit('challenge:done', s.month), (changed = true));
  const earned = kv('badges', {});
  const fresh = registry.badges.filter((b) => !earned[b.id] && b.earned(stats()));
  if (fresh.length) {
    setKv('badges', { ...earned, ...Object.fromEntries(fresh.map((b) => [b.id, Date.now()])) });
    fresh.forEach((b) => (award(`badge:${b.id}`, XP.badge), emit('badge:earned', b)));
    changed = true;
  }
  milestones(stats(), quests('daily'));
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
