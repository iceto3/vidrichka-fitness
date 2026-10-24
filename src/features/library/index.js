/**
 * Library feature registration: routes for the exercise list and exercise detail.
 * @module features/library
 */
import { register } from '../../core/registry.js';

register(
  'routes',
  { pattern: 'library', load: async () => (await import('./views/list.js')).default() },
  {
    pattern: 'exercise/:id',
    load: async (p) => (await import('./views/detail.js')).default(/** @type {{id: string}} */ (p)),
  },
);
