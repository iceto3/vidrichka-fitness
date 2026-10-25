/**
 * Daily-rhythm reminders, app side. Web apps cannot set real alarms, so (best first):
 *  1. Notification Triggers, where the browser has them: every slot of the next 2 days is
 *     scheduled up front and re-planned whenever something changes.
 *  2. Periodic Background Sync (installed Chrome/Android): the service worker gets the
 *     next 7 days of slots (localized here) and shows the due ones when the OS wakes it.
 *  3. In-app checks every 30 s and on every open: due slots become a friendly in-app
 *     prompt when the app is on screen, or a system notification while it is in the
 *     background. Missed slots are caught up on open (only the latest of each group).
 * Every slot is shown at most once (`days.shown`), wherever it was shown.
 * 1.2: when Web Push is on (push.js), the server sends the reminders instead, and all of
 * the above is switched off so nothing is shown twice.
 * @module features/daily/notify
 */
import { all, reload } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { t } from '../../core/i18n.js';
import { dailySettings, settings } from '../../core/settings.js';
import { dayKey } from '../../core/dates.js';
import { otterName } from '../mascot/api.js';
import { isIOS } from '../profile/install.js';
import { day, patchDay } from './api.js';
import { dueSlots, planRange } from './logic.js';
import { pushOn } from './push.js';

/** Is any daily reminder switched on? (Regardless of who sends it: push server or this device.) */
export function dailyEnabled() {
  const c = dailySettings();
  return c.morning || c.water.some((w) => w.on) || c.checkinAm.on || c.checkinPm.on || c.bedtime.on;
}

const granted = () => typeof Notification !== 'undefined' && Notification.permission === 'granted';

/** Records by day key (for the planner). */
const records = () => Object.fromEntries(all('days').map((r) => [r.id, r]));

/**
 * Localized title/body/action labels for a slot. iPhone gets no action buttons (iOS web
 * push has none), so its texts say "tap to …" instead.
 * @param {import('./logic.js').Slot} s
 */
export function slotText(s) {
  const ios = isIOS(),
    name = settings().userName || '',
    otter = otterName();
  const g = s.group === 'water' ? 'water' : s.group === 'protein' ? 'protein' : s.kind;
  const body = t(`notif.${g}.body${ios && s.actions?.length ? 'Ios' : ''}`, { name, otter });
  const labels = { 'protein-yes': t('notif.protein.yes'), 'water-add': t('notif.water.add') };
  return {
    ...s,
    title: t(`notif.${g}.title`, { name, otter }),
    body,
    actions: ios ? [] : (s.actions ?? []).map((a) => ({ action: a, title: labels[/** @type {'protein-yes'} */ (a)] })),
  };
}

const swReg = () => navigator.serviceWorker?.getRegistration().catch(() => null) ?? Promise.resolve(null);

/** Plan the coming days and hand them to the service worker (+ Notification Triggers). */
export async function syncDaily() {
  const reg = await swReg();
  if (!reg) return;
  const now = Date.now(),
    on = dailyEnabled() && !pushOn(); // push on: the server sends them, plan nothing locally
  const slots = on ? planRange(now, 7, dailySettings(), records()).map(slotText) : [];
  reg.active?.postMessage({
    type: 'daily',
    daily: { slots, waterGoal: settings().waterGoal, waterLogged: t('notif.water.logged') },
  });
  if (!granted() || !('showTrigger' in Notification.prototype)) return;
  // Notification Triggers: replace every scheduled daily notification with a fresh plan.
  const groups = ['morning', 'protein', 'water', 'checkinAm', 'checkinPm', 'bed'];
  for (const tag of groups.map((g) => `vf-${g}`))
    (await reg.getNotifications(/** @type {any} */ ({ tag, includeTriggered: false }))).forEach((n) => n.close());
  const recs = records();
  for (const s of slots.filter((x) => x.at > now && x.at < now + 48 * 3600e3)) {
    const r = recs[s.day] ?? {};
    if ((s.skipIf ?? []).some((f) => r[f])) continue;
    await reg.showNotification(
      s.title,
      /** @type {any} */ ({
        body: s.body,
        tag: `vf-${s.group}`,
        data: { day: s.day, kind: s.kind, group: s.group, route: s.route },
        icon: 'assets/icons/icon-192.png',
        silent: !!s.silent,
        actions: s.actions,
        showTrigger: new /** @type {any} */ (window).TimestampTrigger(s.at),
      }),
    );
  }
}

/**
 * In-app check: mark due slots as shown, then prompt in-app (app on screen) or show a
 * system notification (app in the background).
 * @param {number} [now]
 * @returns {import('./logic.js').Slot[]} the slots shown
 */
export function checkDaily(now = Date.now()) {
  if (!dailyEnabled() || !settings().onboarded || pushOn()) return [];
  const { show, seen } = dueSlots(planRange(now, 1, dailySettings(), records()), now, records());
  seen.forEach((s) => patchDay(s.day, { shown: { ...day(s.day).shown, [s.kind]: now } }));
  if (!show.length) return [];
  if (document.visibilityState === 'visible') show.forEach((s) => emit('daily:prompt', s));
  else
    swReg().then((reg) => {
      if (granted()) reg?.active?.postMessage({ type: 'daily-show', slots: show.map(slotText) });
    });
  return show;
}

/** Close notifications that no longer apply (e.g. protein after "yes"). @param {string[]} groups */
export async function closeNotifications(groups) {
  (await swReg())?.active?.postMessage({ type: 'daily-close', tags: groups.map((g) => `vf-${g}`) });
}

/** Re-read rows the service worker may have changed while the app was in the background. */
export const reloadFromSw = () => reload('days', [dayKey(), dayKey(Date.now() - 864e5)]);
