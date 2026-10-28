/**
 * Web Push wire format, app side — pure (no DOM, no storage), shared with unit tests.
 * The server (../../../server) validates the same shapes.
 * @module features/daily/push-format
 */

/** Notification text kinds the server sends (protein and water share one text each). */
export const TEXT_KINDS = /** @type {const} */ ([
  'wake',
  'loud',
  'protein',
  'water',
  'checkinAm',
  'checkinPm',
  'bed',
  'photos', // 1.2.1 monthly photo set (scheduled on the phone for now; the text is ready for push)
]);

/** App event → server event (`checkin:done` carries morning/evening). */
export const EVENT_OF = /** @type {const} */ ({
  'daily:wake': 'awake',
  'protein:done': 'protein-done',
  'protein:skipped': 'protein-skipped',
  'water:added': 'water-logged',
  'daily:goodnight': 'goodnight-done',
});

/** Most queued events kept while offline (oldest dropped). */
export const QUEUE_MAX = 30;

/** base64url → bytes (VAPID public key for pushManager.subscribe). @param {string} s */
export function b64urlBytes(s) {
  const bin = atob(s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4));
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** Random device id: 16 random bytes, base64url (22 chars). No account, no personal data. */
export function newDeviceId() {
  const b = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...b))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

/**
 * Reminder settings for the server: only times, toggles and silent flags.
 * @param {import('./logic.js').DailyConfig} d
 */
export const serverSettings = (d) => ({
  morning: !!d.morning,
  wake: d.wake,
  loud: d.loud,
  loudOn: d.loudOn !== false,
  protein: !!d.protein,
  water: d.water.map((w) => ({ time: w.time, on: !!w.on })),
  checkinAm: { time: d.checkinAm.time, on: !!d.checkinAm.on },
  checkinPm: { time: d.checkinPm.time, on: !!d.checkinPm.on },
  bedtime: { time: d.bedtime.time, on: !!d.bedtime.on },
  silent: { wake: true, bed: true }, // 7:30 and 22:30 are silent nudges (Android; iOS always rings)
});

/**
 * Localized texts per kind, from the app's own slot texts (see notify.js slotText).
 * @param {(s: {kind: string, group: string, actions: string[]}) => {title: string, body: string, actions: {action: string, title: string}[]}} text
 */
export function serverTexts(text) {
  /** @type {Record<string, {title: string, body: string, actions?: Record<string, string>}>} */
  const out = {};
  for (const k of TEXT_KINDS) {
    const group = k === 'wake' || k === 'loud' ? 'morning' : k;
    const actions = k === 'protein' ? ['protein-yes'] : k === 'water' ? ['water-add'] : [];
    const s = text({ kind: k === 'protein' ? 'p10' : k === 'water' ? 'water0' : k, group, actions });
    out[k] = { title: s.title, body: s.body };
    if (s.actions.length) out[k].actions = Object.fromEntries(s.actions.map((a) => [a.action, a.title]));
  }
  return out;
}

/**
 * Add an event to the offline queue (deduped by type+which per day, capped).
 * @param {{type: string, which?: string, at: number}[]} q @param {{type: string, which?: string, at: number}} e
 */
export function enqueue(q, e) {
  const day = (/** @type {number} */ t) => Math.floor(t / 864e5);
  const same = (/** @type {typeof e} */ x) => x.type === e.type && x.which === e.which && day(x.at) === day(e.at);
  return (q.some(same) && e.type !== 'water-logged' ? q : [...q, e]).slice(-QUEUE_MAX);
}
