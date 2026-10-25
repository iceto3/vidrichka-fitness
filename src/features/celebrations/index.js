/**
 * Celebrations feature: maps app events to the three celebration sizes.
 *  MICRO  – each + glass of water and each food item (micro.js, no overlay, no queue)
 *  SMALL  – water goal reached, set finished, protein on time, check-ins
 *  MEDIUM – workout finished (incl. new PRs), all daily quests done
 *  BIG    – level up, badge earned, new streak week, monthly challenge complete,
 *           1.2.1: full monthly photo set
 * 1.2.1 photo sessions: every session ends with a SMALL one (a random otter move); badges or
 * level-ups earned during the session follow as SMALL tap-away toasts (not a blocking BIG),
 * then the monthly-set BIG if the session completed it.
 * @module features/celebrations
 */
import { on } from '../../core/bus.js';
import { L, fmtDate, t } from '../../core/i18n.js';
import { durationMin } from '../../core/dates.js';
import { settings } from '../../core/settings.js';
import { celebrate, preloadSounds } from './api.js';
import { exName } from '../library/api.js';
import { stats, XP } from '../motivation/api.js';
import { activeWorkout } from '../workouts/api.js';

/** Done / total sets of a workout, or null. @param {any} w @returns {{done: number, total: number}|null} */
export const setCount = (w) => {
  const sets = w?.items?.flatMap((/** @type {any} */ it) => it.sets) ?? [];
  return sets.length ? { done: sets.filter((/** @type {any} */ x) => x.done).length, total: sets.length } : null;
};

const tap = () => t('cel.continue');

/** SMALL otter moves for photo sessions (see play.js SMALL_VARIANTS). */
export const PHOTO_VARIANTS = /** @type {const} */ (['wave', 'hop', 'spin', 'flash']);
/** Photo-session toast titles (one is picked with the move). */
const PHOTO_TITLES = ['cel.photo1', 'cel.photo2', 'cel.photo3', 'cel.photo4'];

/**
 * A random index in 0…n−1 that differs from `last` (so two sessions in a row look different).
 * @param {number} n @param {number} last @param {() => number} [rnd]
 */
export function pickOther(n, last, rnd = Math.random) {
  if (n < 2) return 0;
  const i = Math.floor(rnd() * (n - 1));
  return last >= 0 && i >= last ? i + 1 : i;
}

let lastVariant = -1,
  lastTitle = -1;
/** While a photo session sheet is open, badge/level/monthly-set celebrations wait here. */
let holding = false;
/** @type {{kind: 'badge'|'level'|'set', data: any}[]} */
let held = [];

/** Listen for app events (call once after the store is loaded). */
export function startCelebrations() {
  // Sounds need the tap-unlocked audio context: decode them right after the first tap.
  addEventListener('pointerdown', () => setTimeout(preloadSounds, 50), { once: true, capture: true });

  // 1.2: every + glass and every food item gets a light micro animation where she tapped
  // (no overlay, no queue). Reaching the water goal still gets the SMALL celebration.
  on('water:added', async (/** @type {{glasses: number, before: number}} */ e) => {
    (await import('./micro.js')).microWater();
    const s = settings(),
      goal = s.waterGoal || 8;
    if (e.before < goal && e.glasses >= goal)
      celebrate({
        size: 'small',
        key: 'water',
        icon: 'drop',
        title: t('cel.water', { ml: (e.glasses - e.before) * s.glassMl }),
        sub: t('cel.waterSub', { n: e.glasses, goal }),
        progress: [Math.min(1, e.before / goal), Math.min(1, e.glasses / goal)],
      });
  });
  on('food:logged', async (/** @type {{emoji?: string}} */ e) => (await import('./micro.js')).microFood(e.emoji));
  on('set:done', (/** @type {{done: number, total: number}} */ e) => {
    let last = e;
    celebrate({
      size: 'small',
      key: 'set',
      icon: 'check',
      title: t('cel.set'),
      sub: t('cel.setSub', { n: e.done, total: e.total }),
      progress: [(e.done - 1) / e.total, e.done / e.total],
      // Fast taps: one toast, counting from the workout as it is now (not when it was queued).
      live: () => {
        last = setCount(activeWorkout()) ?? last;
        return { sub: t('cel.setSub', { n: last.done, total: last.total }), pct: last.done / last.total };
      },
    });
  });
  on('protein:done', (/** @type {{onTime: boolean}} */ e) =>
    celebrate({
      size: 'small',
      icon: 'egg',
      title: t('cel.protein'),
      sub: e.onTime ? t('cel.proteinOnTime') : t('cel.proteinLate'),
    }),
  );
  on('checkin:done', () =>
    celebrate({ size: 'small', key: 'checkin', icon: 'check', title: t('cel.checkin'), sub: t('cel.checkinSub') }),
  );

  on('workout:finished', (/** @type {any} */ s) => {
    const st = stats();
    const pr = s.prs?.[0];
    celebrate({
      size: 'medium',
      title: s.partial ? t('cel.workoutPartial') : t('cel.workout'),
      sub: t('cel.workoutSub', {
        name: L(s.name) || '—', // the plan name is stored per language ({en, bg})
        n: s.items?.length ?? 0,
        min: durationMin(s.durationSec),
      }),
      chips: [
        { text: `+${s.xp} XP`, tone: 'warm' },
        ...(s.partial ? [] : [{ text: t('cel.weekOf', { n: st.streak.thisWeek, goal: st.streak.goal }), tone: 'ok' }]),
        ...(pr ? [{ text: t('cel.pr', { name: exName(pr.exId) }), tone: 'accent' }] : []),
      ],
    });
  });
  on('quests:all', (/** @type {number} */ n) =>
    celebrate({
      size: 'medium',
      title: t('cel.quests'),
      sub: t('cel.questsSub', { n }),
      chips: [{ text: '✓ ' + t('cel.allDone'), tone: 'ok' }],
    }),
  );

  const levelBig = (/** @type {number} */ n) =>
    celebrate({
      size: 'big',
      kicker: t('cel.levelUp'),
      title: t('cel.level', { n }),
      sub: t('cel.levelSub'),
      chips: [{ text: `🏆 ${t('cel.trophy')}`, tone: 'g' }],
      button: tap(),
    });
  const badgeBig = (/** @type {{label: string}} */ b) =>
    celebrate({
      size: 'big',
      kicker: t('cel.badge'),
      title: t(b.label),
      sub: t('cel.badgeSub'),
      chips: [{ text: `🏅 ${t('cel.badgeChip')}`, tone: 'g' }, { text: `+${XP.badge} XP` }],
      button: tap(),
    });
  const setBig = (/** @type {{month: string, streak: number}} */ e) =>
    celebrate({
      size: 'big',
      kicker: t('cel.photoSetKicker'),
      title: t('cel.photoSet'),
      sub: t('cel.photoSetSub', { month: fmtDate(new Date(`${e.month}-15T12:00`), { month: 'long' }) }),
      chips: [
        { text: `📸 4 / 4`, tone: 'g' },
        { text: `+${XP.photoSet} XP` },
        ...(e.streak > 1 ? [{ text: `🔥 ${t('photo.streak', { n: e.streak })}`, tone: 'warm' }] : []),
      ],
      button: tap(),
    });
  on('level:up', (/** @type {number} */ n) => (holding ? held.push({ kind: 'level', data: n }) : levelBig(n)));
  on('badge:earned', (/** @type {{label: string}} */ b) =>
    holding ? held.push({ kind: 'badge', data: b }) : badgeBig(b),
  );
  on('photos:set', (/** @type {{month: string, streak: number}} */ e) =>
    holding ? held.push({ kind: 'set', data: e }) : setBig(e),
  );
  on('photos:sessionStart', () => (holding = true));
  on('photos:sessionEnd', (/** @type {{added: number, poses: number}} */ e) => {
    holding = false;
    const later = held;
    held = [];
    if (e.added > 0) {
      lastVariant = pickOther(PHOTO_VARIANTS.length, lastVariant);
      lastTitle = pickOther(PHOTO_TITLES.length, lastTitle);
      celebrate({
        size: 'small',
        key: 'photos',
        icon: 'camera',
        variant: PHOTO_VARIANTS[lastVariant],
        title: t(PHOTO_TITLES[lastTitle]),
        sub: t('cel.photoSub', { n: e.poses }),
        progress: [Math.max(0, e.poses - e.added) / 4, Math.min(1, e.poses / 4)],
      });
    }
    // Badges and level-ups from the session: light tap-away toasts after it (not blocking).
    for (const h of later.filter((x) => x.kind !== 'set'))
      if (e.added > 0)
        celebrate({
          size: 'small',
          icon: 'badge',
          dismiss: true,
          variant: 'hop',
          title: h.kind === 'badge' ? `${t('cel.badgeChip')}: ${t(h.data.label)}` : t('cel.level', { n: h.data }),
          sub: h.kind === 'badge' ? `+${XP.badge} XP · ${t('cel.badgeSub')}` : t('cel.levelSub'),
        });
      else (h.kind === 'badge' ? badgeBig : levelBig)(h.data);
    for (const h of later.filter((x) => x.kind === 'set')) setBig(h.data);
  });
  on('streak:week', (/** @type {number} */ n) =>
    celebrate({
      size: 'big',
      kicker: t('cel.streak'),
      title: t('cel.weeks', { n }),
      sub: t('cel.streakSub'),
      chips: [{ text: `🔥 ${t('cel.streakChip', { n })}`, tone: 'g' }],
      button: tap(),
    }),
  );
  on('challenge:done', () =>
    celebrate({
      size: 'big',
      kicker: t('cel.challenge'),
      title: t('cel.challengeTitle'),
      sub: t('cel.challengeSub'),
      chips: [{ text: `🏆 ${t('cel.trophy')}`, tone: 'g' }, { text: `+${XP.challenge} XP` }],
      button: tap(),
    }),
  );
}
