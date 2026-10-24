/**
 * Motivation feature registration: starts the reward engine (badges, quests, challenge
 * XP), shows celebrations for level-ups / badges / completed challenges, and registers
 * the monthly Wrapped route.
 * @module features/motivation
 */
import { register } from '../../core/registry.js';
import { on, emit } from '../../core/bus.js';
import { t } from '../../core/i18n.js';
import { startRewards } from './rewards.js';

register('routes', { pattern: 'recap/:month', load: async (p) => (await import('./views/recap.js')).default(/** @type {{month: string}} */ (p)) });

/** Start rewards and celebration toasts (call once after the store is loaded). */
export function startMotivation() {
  on('level:up', (/** @type {number} */ n) => emit('toast', { text: `⭐ ${t('motivation.levelUp', { n })}` }));
  on('badge:earned', (/** @type {{label: string}} */ b) => emit('toast', { text: `🏅 ${t('motivation.badge', { name: t(b.label) })}` }));
  on('challenge:done', () => emit('toast', { text: `🏆 ${t('motivation.challenge')}` }));
  startRewards();
}
