/**
 * 1.4.0 Day feature: the date-keyed data layer (./api.js), the shared day cards and the
 * day view route `day/:date` (opened from Progress › Calendar).
 * @module features/day
 */
import { register } from '../../core/registry.js';

register('routes', {
  pattern: 'day/:date',
  load: async ({ date }) => (await import('./views/day.js')).default(date),
});
