/**
 * Motivation feature registration: starts the reward engine (badges, quests, challenge
 * XP, milestones) and registers the monthly Wrapped route. Level-ups, badges, challenges
 * and milestones are celebrated by the celebrations feature (it listens to the events).
 * @module features/motivation
 */
import { register } from '../../core/registry.js';
import { startRewards } from './rewards.js';

register('routes', {
  pattern: 'recap/:month',
  load: async (p) => (await import('./views/recap.js')).default(/** @type {{month: string}} */ (p)),
});

/** Start the reward engine (call once after the store is loaded). */
export function startMotivation() {
  startRewards();
}
