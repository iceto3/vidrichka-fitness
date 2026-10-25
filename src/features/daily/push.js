/**
 * Web Push reminders (1.2), app side. A small server (../../../server, a Cloudflare
 * Worker) sends the daily-rhythm reminders at the right minute even when the app is
 * closed — the only way they can arrive on iPhone. This module:
 *  - turns push on/off (`pushManager.subscribe` with the VAPID key → POST /subscribe),
 *  - keeps the server's copy of the settings, texts and time zone in sync,
 *  - reports app events (awake, protein, check-ins, goodnight, water) so the server
 *    stops follow-ups, queueing them while offline and retrying on the next open.
 * While push is on, local scheduling is switched off (see notify.js) so nothing is
 * shown twice. Only a random device id, the subscription, time zone, reminder settings
 * and the notification texts leave the phone — no health data.
 * @module features/daily/push
 */
import { kv, setKv } from '../../core/store.js';
import { on } from '../../core/bus.js';
import { dailySettings } from '../../core/settings.js';
import { isIOS, isStandalone } from '../profile/install.js';
import { slotText, syncDaily } from './notify.js';
import { PUSH_URL, VAPID_KEY, pushUrl } from './push-config.js';
import { EVENT_OF, b64urlBytes, enqueue, newDeviceId, serverSettings, serverTexts } from './push-format.js';

export { PUSH_URL, VAPID_KEY, pushUrl };

const CONFIG = 'vf-config',
  QUEUE = 'push-queue';

/** @returns {{on: boolean, id: string, endpoint: string, dirty?: boolean}} */
const state = () => kv('push', { on: false, id: '', endpoint: '' });

/** Are reminders coming from the push server on this device? */
export const pushOn = () => state().on && !!pushUrl();

/** What this device can do. */
export function pushSupport() {
  const api =
    typeof navigator !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window;
  return {
    configured: !!pushUrl(),
    api,
    iosNeedsInstall: isIOS() && !isStandalone(),
    permission: 'Notification' in window ? Notification.permission : 'unsupported',
  };
}

/** Time zone, settings and texts — the device's registration besides the subscription. */
const profile = () => ({
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
  settings: serverSettings(dailySettings()),
  texts: serverTexts((s) => slotText(/** @type {any} */ (s))),
});

/** @param {string} path @param {object} body @returns {Promise<number>} HTTP status (throws when offline) */
async function api(path, body) {
  const r = await fetch(pushUrl() + path, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain' }, // a "simple" request: no CORS preflight
    body: JSON.stringify(body),
    keepalive: true,
  });
  return r.status;
}

/** Tell the service worker where to post events from notification taps (null = off). */
async function swConfig() {
  const reg = await navigator.serviceWorker?.ready;
  const st = state();
  reg?.active?.postMessage({
    type: 'push',
    push: pushOn() ? { url: pushUrl(), id: st.id, key: VAPID_KEY, reg: profile() } : null,
  });
}

/** Does a subscription use our VAPID key? @param {PushSubscription} sub */
function sameKey(sub) {
  const k = sub.options?.applicationServerKey;
  if (!k) return true;
  const a = new Uint8Array(k),
    b = b64urlBytes(VAPID_KEY);
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/**
 * Turn push reminders on: ask permission (call from a tap), subscribe, register.
 * @returns {Promise<'on'|'denied'|'default'|'unsupported'>}
 */
export async function enablePush() {
  const s = pushSupport();
  if (!s.configured || !s.api || s.iosNeedsInstall) return 'unsupported';
  const perm = Notification.permission === 'default' ? await Notification.requestPermission() : Notification.permission;
  if (perm !== 'granted') return /** @type {'denied'|'default'} */ (perm);
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub)) (await sub.unsubscribe(), (sub = null));
  sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64urlBytes(VAPID_KEY) });
  // Reuse the id only for the same subscription (a restored backup on a new phone gets its own).
  const st = state(),
    id = st.id && st.endpoint === sub.endpoint ? st.id : newDeviceId();
  const status = await api('/subscribe', { id, subscription: sub.toJSON(), ...profile() });
  if (status !== 204) throw new Error(`subscribe failed (${status})`);
  setKv('push', { on: true, id, endpoint: sub.endpoint });
  await swConfig();
  await syncDaily(); // local scheduling off
  return 'on';
}

/** Turn push reminders off: unsubscribe here and on the server; local reminders resume. */
export async function disablePush() {
  const st = state();
  setKv('push', { ...st, on: false });
  const reg = await navigator.serviceWorker?.ready;
  await (await reg?.pushManager.getSubscription())?.unsubscribe().catch(() => {});
  // If this fails (offline), the server drops the device on its next send (410 Gone).
  await api('/unsubscribe', { id: st.id }).catch(() => {});
  await swConfig();
  await syncDaily();
}

/** @returns {Promise<any[]>} */
async function readQueue() {
  return (await (await (await caches.open(CONFIG)).match(QUEUE))?.json().catch(() => [])) ?? [];
}
/** @param {any[]} q */
const writeQueue = async (q) => (await caches.open(CONFIG)).put(QUEUE, new Response(JSON.stringify(q)));

/**
 * Report an app event to the server (queued while offline).
 * @param {string} type @param {'am'|'pm'} [which]
 */
export async function pushEvent(type, which) {
  if (!pushOn()) return;
  const e = { type, ...(which ? { which } : {}), at: Date.now() };
  try {
    const st = await api('/event', { id: state().id, ...e });
    if (st === 404) return void reRegister();
    if (st >= 500) throw new Error(String(st));
  } catch {
    await writeQueue(enqueue(await readQueue(), e)).catch(() => {});
  }
}

/** Re-register after the server forgot the device or the browser renewed the subscription. */
async function reRegister() {
  if (Notification.permission !== 'granted') return void (setKv('push', { ...state(), on: false }), syncDaily());
  await enablePush().catch(() => setKv('push', { ...state(), dirty: true }));
}

let timer = 0;
/** Send settings/texts/time zone to the server (debounced; retried on next open if offline). */
export function syncPushSettings(delay = 1500) {
  if (!pushOn()) return;
  clearTimeout(timer);
  timer = /** @type {any} */ (
    setTimeout(async () => {
      try {
        const st = await api('/settings', { id: state().id, ...profile() });
        if (st === 404) return reRegister();
        setKv('push', { ...state(), dirty: st >= 500 });
        swConfig();
      } catch {
        setKv('push', { ...state(), dirty: true });
      }
    }, delay)
  );
}

/** Send queued events (oldest first); keep the ones that still fail. */
export async function flushPush() {
  if (!pushOn()) return;
  const q = await readQueue().catch(() => []);
  if (!q.length) return;
  const left = [];
  for (const e of q)
    try {
      const st = await api('/event', { id: state().id, ...e });
      if (st >= 500) left.push(e);
    } catch {
      left.push(e);
    }
  await writeQueue(left);
}

/** Start: check the subscription is alive, sync, flush the queue, and report app events. */
export async function startPush() {
  for (const [ev, type] of Object.entries(EVENT_OF)) on(ev, () => pushEvent(type));
  on('checkin:done', (/** @type {string} */ k) => pushEvent('checkin-done', k === 'morning' ? 'am' : 'pm'));
  on(
    'settings:changed',
    (/** @type {Record<string, any>} */ p) =>
      ('daily' in p || 'lang' in p || 'userName' in p || 'otterName' in p) && syncPushSettings(),
  );
  addEventListener('online', () => flushPush());
  if (!pushOn() || !pushSupport().api) return;
  const sub = await (await navigator.serviceWorker.ready).pushManager.getSubscription().catch(() => null);
  if (!sub || sub.endpoint !== state().endpoint) await reRegister();
  else syncPushSettings(0); // also carries a new time zone after travel
  await swConfig();
  await flushPush();
}
