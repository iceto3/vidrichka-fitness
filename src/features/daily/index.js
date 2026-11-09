/**
 * Daily rhythm feature: good-morning page with the protein countdown, water/check-in
 * reminders, goodnight ritual and the Progress › Sleep tab. Registers routes, the
 * "protein within 30 min" quest and the sleep sub-tab; `startDaily()` wires prompts,
 * evening-use tracking (bedtime estimate), messages from the service worker and (1.2)
 * the Web Push client.
 * @module features/daily
 */
import { register } from '../../core/registry.js';
import { emit, on } from '../../core/bus.js';
import { currentPath } from '../../core/router.js';
import { dailySettings } from '../../core/settings.js';
import { all, fromOtherTab } from '../../core/store.js';
import { dayKey } from '../../core/dates.js';
import { proteinOnTime, proteinQuest } from './logic.js';

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
  // 1.4.3 (part A): on time 15 XP, up to 30 min late ticked „+N мин“ 8 XP, later „пропуснато“
  state: (/** @type {any} */ s) => {
    const q = proteinQuest(s.dayRec, Date.now());
    return {
      done: q.state === 'done' || q.state === 'late',
      xp: q.xp,
      missed: q.state === 'missed',
      lateMin: q.state === 'late' ? q.delayMin : 0,
    };
  },
});

/** Start the in-app side of the daily rhythm (after the store is loaded). */
export async function startDaily() {
  const [api, notify, { prompt }, push] = await Promise.all([
    import('./api.js'),
    import('./notify.js'),
    import('./prompt.js'),
    import('./push.js'),
  ]);
  addEventListener('pointerdown', () => api.touch(), { passive: true });
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') return api.touch();
    await notify.reloadFromSw();
    api.catchUpProtein();
    push.flushPush().catch(() => {});
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
      ('daily' in p || 'proteinBreakfast' in p || 'lang' in p || 'userName' in p) && notify.syncDaily().catch(() => {}),
  );
  // 1.4.3 (tester): protein switched on after this morning's wake-up was recorded
  // (part A: also the protein breakfast switch in Profile; switched off, its notifications close)
  on('settings:changed', (/** @type {Record<string, any>} */ p) => {
    if (('daily' in p || 'proteinBreakfast' in p) && api.proteinFromWake()) emit('daily:changed');
    if ('proteinBreakfast' in p && !dailySettings().protein) notify.closeNotifications(['protein']).catch(() => {});
  });
  if (api.proteinFromWake()) emit('daily:changed');
  api.catchUpProtein();
  // 1.4.3: the meal pill above the nav on the other tabs (same countdown as the Home banner)
  (await import('./pill.js')).startMealPill();
  // 1.2.1: the protein breakfast counts only once a breakfast entry is saved.
  // 1.4.3 (round 2): … and stops counting when today's last breakfast entry is deleted (or
  // moved away); Undo / Възстанови puts it back. A later breakfast row of the same late meal
  // gets the typed „Кога яде?“ time too.
  const breakfastIds = () => {
    const d = dayKey();
    return new Set(
      all('food')
        .filter((r) => r.date === d && r.meal === 'breakfast' && r.type !== 'water')
        .map((r) => r.id),
    );
  };
  let bf = breakfastIds();
  on('store:food', (/** @type {any} */ row) => {
    const had = bf.has(row?.id);
    bf = breakfastIds();
    if (fromOtherTab()) return; // round 3: the tab that saved it did this already
    if (had && !bf.has(row.id)) api.proteinUnlogged(row.id);
    else if (!api.proteinLogged(row) && !had) api.ateTimeOnRow(row);
  });
  on('store:replaced', () => (bf = breakfastIds()));
  // Not awaited: it waits for the service worker; pushOn() alone already decides local planning.
  push.startPush().catch((e) => console.warn('[push]', e));
  notify.syncDaily().catch(() => {});
}
