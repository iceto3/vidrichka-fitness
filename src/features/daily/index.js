/**
 * Daily rhythm feature: good-morning page with the protein countdown, water/check-in
 * reminders, goodnight ritual and the Progress › Sleep tab. Registers routes, the
 * "protein within 30 min" quest and the sleep sub-tab; `startDaily()` wires prompts,
 * evening-use tracking (bedtime estimate) and messages from the service worker.
 * @module features/daily
 */
import { register } from '../../core/registry.js';
import { emit, on } from '../../core/bus.js';
import { currentPath } from '../../core/router.js';
import { dailySettings } from '../../core/settings.js';
import { proteinOnTime } from './logic.js';

register(
  'routes',
  { pattern: 'morning', load: async () => (await import('./views/morning.js')).default() },
  { pattern: 'goodnight', load: async () => (await import('./views/goodnight.js')).default() },
  { pattern: 'checkin/:kind', load: async ({ kind }) => (await import('./views/checkin.js')).default(kind) },
);
register('progressTabs', { id: 'sleep', label: 'progress.sleep', order: 25, load: () => import('./views/sleep.js') });
register('quests', {
  id: 'protein',
  label: 'quest.protein',
  xp: 15,
  go: 'morning',
  show: () => dailySettings().protein && dailySettings().morning,
  done: (/** @type {any} */ s) => proteinOnTime(s.dayRec),
});

/** Start the in-app side of the daily rhythm (after the store is loaded). */
export async function startDaily() {
  const [api, notify, { prompt }] = await Promise.all([
    import('./api.js'),
    import('./notify.js'),
    import('./prompt.js'),
  ]);
  addEventListener('pointerdown', () => api.touch(), { passive: true });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') return api.touch();
    await notify.reloadFromSw();
    api.catchUpProtein();
  });
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    if (e.data?.type === 'open') emit('nav', { path: e.data.path });
    if (e.data?.type === 'db') {
      const { reload } = await import('../../core/store.js');
      await reload(e.data.store, e.data.ids);
      api.catchUpProtein();
    }
  });
  on(
    'daily:prompt',
    (/** @type {import('./logic.js').Slot} */ s) => s.route.split('?')[0] !== currentPath() && prompt(s),
  );
  on('daily:changed', () => notify.syncDaily().catch(() => {}));
  on(
    'settings:changed',
    (/** @type {Record<string, any>} */ p) =>
      ('daily' in p || 'lang' in p || 'userName' in p) && notify.syncDaily().catch(() => {}),
  );
  api.catchUpProtein();
  notify.syncDaily().catch(() => {});
}
