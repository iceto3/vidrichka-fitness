/**
 * "Recently deleted" (1.3.1): the bin page (reachable from Profile and the Food diary) and
 * the purge of entries older than 7 days at start.
 * @module features/trash
 */
import { register } from '../../core/registry.js';
import { purge } from '../../core/trash.js';

// Opened from Food it lives under the Food tab (so Food stays highlighted), else under Profile.
register(
  'routes',
  { pattern: 'trash', load: async () => (await import('./views/trash.js')).default('profile') },
  { pattern: 'food/trash', load: async () => (await import('./views/trash.js')).default('food') },
);

/** Drop bin entries older than 7 days (called once the store is loaded). */
export const startTrash = () => void purge();
