/**
 * Workouts feature registration: the Workouts tab and its routes (plans, editor,
 * active workout, summary). Views are lazy-loaded.
 * @module features/workouts
 */
import { register } from '../../core/registry.js';
import { onRestore } from '../../core/trash.js';

// A workout put back from "Recently deleted" gets its PRs/XP recomputed.
onRestore('session', async (e) => (await import('./session.js')).restoreSession(e));

register('tabs', { id: 'workouts', icon: 'dumbbell', label: 'nav.workouts', path: 'workouts', order: 20 });
register(
  'routes',
  { pattern: 'workouts', load: async () => (await import('./views/plans.js')).default() },
  {
    pattern: 'plan/:id',
    load: async (p) => (await import('./views/editor.js')).default(/** @type {{id: string}} */ (p)),
  },
  { pattern: 'workout', load: async () => (await import('./views/active.js')).default() },
  {
    pattern: 'history/:id',
    load: async (p) => (await import('./views/history.js')).default({ id: String(p.id), tab: 'progress' }),
  },
  {
    pattern: 'workouts/history/:id',
    load: async (p) => (await import('./views/history.js')).default({ id: String(p.id), tab: 'workouts' }),
  },
  {
    pattern: 'summary/:id',
    load: async (p) => (await import('./views/summary.js')).default(/** @type {{id: string}} */ (p)),
  },
);
