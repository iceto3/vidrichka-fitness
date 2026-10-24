/**
 * Workout reminders (plus the periodic-sync registration shared with the daily-rhythm
 * reminders of features/daily/notify.js). Web apps cannot schedule reliable alarms everywhere, so this uses,
 * best first: Notification Triggers (if the browser has them), Periodic Background Sync
 * (installed Chrome/Android, best-effort), and in-app checks while the app is open.
 * On iPhone notifications need iOS 16.4+, the app added to the Home Screen and
 * permission requested from a tap.
 * @module features/profile/reminders
 */
import { settings } from '../../core/settings.js';
import { kv, setKv } from '../../core/store.js';
import { dayKey, weekdayMon } from '../../core/dates.js';
import { t } from '../../core/i18n.js';
import { notify } from '../../ui/feedback.js';
import { isIOS, isStandalone } from './install.js';
import { dailyEnabled, syncDaily } from '../daily/api.js';

/** What the current device supports. */
export function support() {
  const notif = 'Notification' in window;
  return {
    notif,
    permission: notif ? Notification.permission : 'unsupported',
    triggers: notif && 'showTrigger' in Notification.prototype,
    periodic: typeof ServiceWorkerRegistration !== 'undefined' && 'periodicSync' in ServiceWorkerRegistration.prototype,
    iosNeedsInstall: isIOS() && !isStandalone(),
  };
}

/** Ask for notification permission (must be called from a tap). */
export async function requestPermission() {
  if (!('Notification' in window)) return 'unsupported';
  return Notification.permission === 'default' ? Notification.requestPermission() : Notification.permission;
}

/** Next reminder Date from settings, or null. */
export function nextReminder(now = new Date()) {
  const r = settings().reminders;
  if (!r.enabled || !r.days.length) return null;
  const [h, m] = r.time.split(':').map(Number);
  for (let i = 0; i < 8; i++) {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i, h, m);
    if (d > now && r.days.includes(weekdayMon(d))) return d;
  }
  return null;
}

/** Schedule what the platform allows; safe to call often. */
export async function scheduleReminders() {
  const reg = await navigator.serviceWorker?.getRegistration().catch(() => null);
  if (!reg) return;
  const s = support();
  if (s.periodic) {
    try {
      // Daily-rhythm reminders need frequent wake-ups; Chrome decides the real interval
      // (from site engagement), so this is a wish, not a promise.
      const daily = dailyEnabled();
      if (settings().reminders.enabled || daily)
        await /** @type {any} */ (reg).periodicSync.register('reminder', {
          minInterval: (daily ? 15 : 60) * 60 * 1000,
        });
      else await /** @type {any} */ (reg).periodicSync.unregister('reminder');
    } catch {
      /* not installed or not allowed */
    }
  }
  reg.active?.postMessage({
    type: 'reminders',
    reminders: settings().reminders,
    title: t('reminder.title'),
    body: t('reminder.body'),
    lastShown: kv('reminderShown', ''),
  });
  await syncDaily();
  if (s.triggers && s.permission === 'granted') {
    const when = nextReminder();
    (await reg.getNotifications({ tag: 'reminder', includeTriggered: false } /** @type {any} */)).forEach((n) =>
      n.close(),
    );
    if (when)
      await reg.showNotification(
        t('reminder.title'),
        /** @type {any} */ ({
          body: t('reminder.body'),
          tag: 'reminder',
          showTrigger: new /** @type {any} */ (window).TimestampTrigger(when.getTime()),
        }),
      );
  }
}

/**
 * In-app check (every 30 s while open): when a reminder time has passed today and no
 * workout was done, show a notification (or return true so the UI can show a banner).
 * @param {boolean} workedOutToday
 */
export function checkDue(workedOutToday) {
  const r = settings().reminders,
    now = new Date();
  if (!r.enabled || workedOutToday || !r.days.includes(weekdayMon(now)) || kv('reminderShown', '') === dayKey())
    return false;
  const [h, m] = r.time.split(':').map(Number);
  if (now.getHours() * 60 + now.getMinutes() < h * 60 + m) return false;
  setKv('reminderShown', dayKey());
  notify(t('reminder.title'), t('reminder.body'), 'reminder');
  return true;
}
