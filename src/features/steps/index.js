/**
 * Steps feature (1.3.4): the daily steps challenge. Registers the daily quest; the Home
 * card and the entry sheet live in views/card.js.
 * @module features/steps
 */
import { register } from '../../core/registry.js';
import { settings } from '../../core/settings.js';

const goal = () => settings().stepGoal || 8000;

register('quests', {
  id: 'steps',
  label: 'quest.steps',
  xp: 20,
  go: 'home?steps',
  order: 1,
  done: (/** @type {any} */ s) => (s.dayRec?.steps ?? 0) >= goal(),
  detail: (/** @type {any} */ s) => ({ n: s.dayRec?.steps ?? 0, goal: goal() }),
});
