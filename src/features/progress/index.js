/**
 * Progress feature registration: the Progress tab, its Lifts and Calendar sub-tabs, and
 * the `progress/:tab` route that hosts every registered sub-tab (Body comes from the
 * body feature).
 * @module features/progress
 */
import { register, registry } from '../../core/registry.js';

register('tabs', { id: 'progress', icon: 'chart', label: 'nav.progress', path: 'progress/lifts', order: 40 });
register(
  'progressTabs',
  { id: 'lifts', label: 'progress.lifts', order: 10, load: () => import('./views/lifts.js') },
  { id: 'calendar', label: 'progress.calendar', order: 30, load: () => import('./views/calendar.js') },
);
/** @param {string} tab */
const open = async (tab) => {
  const entry = registry.progressTabs.find((p) => p.id === tab) ?? registry.progressTabs[0];
  const [shell, inner] = await Promise.all([import('./views/shell.js'), entry.load()]);
  return shell.default(entry.id, inner.default());
};
register(
  'routes',
  { pattern: 'progress/:tab', load: ({ tab }) => open(tab) },
  { pattern: 'progress', load: () => open('lifts') },
);
