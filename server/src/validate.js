/**
 * Input validation. Everything from the network is checked and normalized here; anything
 * unexpected is rejected (400) or dropped. No free-form data is stored except short,
 * length-capped notification texts written by the app itself.
 * @module validate
 */
import { validZone } from './schedule.js';

/** Max request body (bytes). */
export const MAX_BODY = 8192;
/** Client-generated random device id: 22–64 base64url characters. */
export const DEVICE_ID = /^[A-Za-z0-9_-]{22,64}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const B64URL = /^[A-Za-z0-9_-]+$/;
/** Push services we deliver to (prevents using the Worker to POST to arbitrary hosts). */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^android\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,
];
export const EVENTS = ['awake', 'protein-done', 'protein-skipped', 'water-logged', 'checkin-done', 'goodnight-done'];
/** Notification text kinds the app may provide. */
export const TEXT_KINDS = ['wake', 'loud', 'protein', 'water', 'checkinAm', 'checkinPm', 'bed', 'photos'];
const ACTIONS = ['protein-yes', 'water-add'];

export class Invalid extends Error {}
/** @param {boolean} ok @param {string} what */
const need = (ok, what) => {
  if (!ok) throw new Invalid(what);
};
const isObj = (/** @type {unknown} */ v) => !!v && typeof v === 'object' && !Array.isArray(v);
const bool = (/** @type {unknown} */ v, d = false) => (typeof v === 'boolean' ? v : d);

/** @param {unknown} id */
export function deviceId(id) {
  need(typeof id === 'string' && DEVICE_ID.test(id), 'id');
  return /** @type {string} */ (id);
}

/** @param {unknown} tz */
export function zone(tz) {
  need(validZone(tz), 'tz');
  return /** @type {string} */ (tz);
}

/** @param {any} s @returns {{endpoint: string, p256dh: string, auth: string}} */
export function subscription(s) {
  need(isObj(s) && isObj(s.keys), 'subscription');
  const { endpoint } = s,
    { p256dh, auth } = s.keys;
  need(typeof endpoint === 'string' && endpoint.length <= 1024, 'endpoint');
  let url;
  try {
    url = new URL(endpoint);
  } catch {
    need(false, 'endpoint');
  }
  need(url.protocol === 'https:' && PUSH_HOSTS.some((h) => h.test(url.hostname)), 'endpoint host');
  need(typeof p256dh === 'string' && B64URL.test(p256dh) && p256dh.length >= 86 && p256dh.length <= 88, 'p256dh');
  need(typeof auth === 'string' && B64URL.test(auth) && auth.length >= 22 && auth.length <= 24, 'auth');
  return { endpoint, p256dh, auth };
}

/** @param {any} v @param {string} d */
const time = (v, d) => (typeof v === 'string' && TIME.test(v) ? v : d);
/** @param {any} v @param {string} d @param {boolean} on */
const tt = (v, d, on) => ({ time: time(v?.time, d), on: bool(v?.on, on) });

/**
 * Reminder settings, normalized over the app's defaults (unknown keys dropped).
 * @param {any} s
 * @returns {import('./schedule.js').Settings}
 */
export function settings(s) {
  need(isObj(s), 'settings');
  need(s.water == null || (Array.isArray(s.water) && s.water.length <= 8), 'water');
  return {
    morning: bool(s.morning, true),
    wake: time(s.wake, '07:30'),
    loud: time(s.loud, '08:15'),
    protein: bool(s.protein, true),
    water: (s.water ?? []).map((/** @type {any} */ w) => tt(w, '12:00', false)),
    checkinAm: tt(s.checkinAm, '11:00', false),
    checkinPm: tt(s.checkinPm, '19:30', false),
    bedtime: tt(s.bedtime, '22:30', false),
    silent: { wake: bool(s.silent?.wake, true), bed: bool(s.silent?.bed, true) },
  };
}

/** @param {unknown} v @param {number} max */
const str = (v, max) => (typeof v === 'string' ? v.slice(0, max) : '');

/**
 * Localized notification texts by kind ({title, body, actions: {action: label}}).
 * @param {any} t
 * @returns {Record<string, {title: string, body: string, actions?: Record<string, string>}>}
 */
export function texts(t) {
  if (t == null) return {};
  need(isObj(t), 'texts');
  /** @type {Record<string, any>} */
  const out = {};
  for (const k of TEXT_KINDS) {
    const v = t[k];
    if (!isObj(v)) continue;
    const o = { title: str(v.title, 80), body: str(v.body, 200) };
    if (isObj(v.actions))
      o.actions = Object.fromEntries(
        ACTIONS.filter((a) => typeof v.actions[a] === 'string').map((a) => [a, str(v.actions[a], 30)]),
      );
    if (o.title) out[k] = o;
  }
  return out;
}

/** @param {any} e */
export function event(e) {
  need(typeof e?.type === 'string' && EVENTS.includes(e.type), 'type');
  need(e.at == null || (Number.isFinite(e.at) && e.at > 0), 'at');
  need(e.type !== 'checkin-done' || e.which === 'am' || e.which === 'pm', 'which');
  return { type: /** @type {string} */ (e.type), at: e.at == null ? null : Math.round(e.at), which: e.which };
}

/**
 * Read a JSON body with a hard size cap.
 * @param {Request} req
 */
export async function jsonBody(req) {
  const len = Number(req.headers.get('content-length') || 0);
  need(len <= MAX_BODY, 'too large');
  const buf = await req.arrayBuffer();
  need(buf.byteLength <= MAX_BODY, 'too large');
  try {
    return JSON.parse(new TextDecoder().decode(buf));
  } catch {
    throw new Invalid('json');
  }
}
