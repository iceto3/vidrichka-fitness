/**
 * "Recently deleted" (1.3.1): the bin page (reachable from Profile and the Food diary) and
 * the purge of entries older than 7 days at start.
 * @module features/trash
 */
import { register } from '../../core/registry.js';
import { purge } from '../../core/trash.js';

register('routes', { pattern: 'trash', load: async () => (await import('./views/trash.js')).default() });

/** Drop bin entries older than 7 days (called once the store is loaded). */
export const startTrash = () => void purge();
