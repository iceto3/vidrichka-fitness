/**
 * Food feature registration: the Food tab and its routes (diary, add, regular meals).
 * @module features/food
 */
import { register } from '../../core/registry.js';

register('tabs', { id: 'food', icon: 'food', label: 'nav.food', path: 'food', order: 30 });
register(
  'routes',
  { pattern: 'food', load: async () => (await import('./views/diary.js')).default() },
  {
    pattern: 'food/add/:meal',
    load: async (p) => (await import('./views/add.js')).default(/** @type {{meal: string}} */ (p)),
  },
  { pattern: 'food/meals', load: async () => (await import('./views/meals.js')).default() },
);
