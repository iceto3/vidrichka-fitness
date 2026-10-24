/**
 * Profile feature registration: the Profile tab and the reminders page.
 * @module features/profile
 */
import { register } from '../../core/registry.js';

register('tabs', { id: 'profile', icon: 'user', label: 'nav.profile', path: 'profile', order: 50 });
register(
  'routes',
  { pattern: 'profile', load: async () => (await import('./views/profile.js')).default() },
  { pattern: 'profile/reminders', load: async () => (await import('./views/reminders.js')).default() },
);
