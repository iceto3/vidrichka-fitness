/**
 * Celebrations feature: maps app events to the three celebration sizes.
 *  MICRO  – each + glass of water and each food item (micro.js, no overlay, no queue)
 *  SMALL  – water goal reached, set finished, protein on time, check-ins
 *  MEDIUM – workout finished (incl. new PRs), all daily quests done
 *  BIG    – level up, badge earned, new streak week, monthly challenge complete
 * @module features/celebrations
 */
import { on } from '../../core/bus.js';
import { t } from '../../core/i18n.js';
import { settings } from '../../core/settings.js';
import { celebrate, preloadSounds } from './api.js';
import { exName } from '../library/api.js';
import { stats, XP } from '../motivation/api.js';

const tap = () => t('cel.continue');

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
  on('set:done', (/** @type {{done: number, total: number}} */ e) =>
    celebrate({
      size: 'small',
      key: 'set',
      icon: 'check',
      title: t('cel.set'),
      sub: t('cel.setSub', { n: e.done, total: e.total }),
      progress: [(e.done - 1) / e.total, e.done / e.total],
    }),
  );
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
      title: t('cel.workout'),
      sub: t('cel.workoutSub', {
        name: s.name,
        n: s.items?.length ?? 0,
        min: Math.max(1, Math.round(s.durationSec / 60)),
      }),
      chips: [
        { text: `+${s.xp} XP`, tone: 'warm' },
        { text: t('cel.weekOf', { n: st.streak.thisWeek, goal: st.streak.goal }), tone: 'ok' },
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

  on('level:up', (/** @type {number} */ n) =>
    celebrate({
      size: 'big',
      kicker: t('cel.levelUp'),
      title: t('cel.level', { n }),
      sub: t('cel.levelSub'),
      chips: [{ text: `🏆 ${t('cel.trophy')}`, tone: 'g' }],
      button: tap(),
    }),
  );
  on('badge:earned', (/** @type {{label: string}} */ b) =>
    celebrate({
      size: 'big',
      kicker: t('cel.badge'),
      title: t(b.label),
      sub: t('cel.badgeSub'),
      chips: [{ text: `🏅 ${t('cel.badgeChip')}`, tone: 'g' }, { text: `+${XP.badge} XP` }],
      button: tap(),
    }),
  );
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
