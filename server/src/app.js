/**
 * vidrichka-push — Web Push reminders for Vidrichka Fitness (Cloudflare Worker).
 *
 * HTTP API (JSON bodies, ≤ 8 kB, CORS only for the app's origin and localhost):
 *   POST /subscribe    {id, subscription, tz, settings, texts?}  upsert a device
 *   POST /settings     {id, tz?, settings?, texts?}              update it (404 = re-subscribe)
 *   POST /event        {id, type, at?, which?}                   awake | protein-done |
 *                      protein-skipped | water-logged | checkin-done (which: am|pm) | goodnight-done
 *   POST /unsubscribe  {id}
 *   POST /foods        {name, kcal, protein, carbs, fat, fiber, salt, lang}   1.3.4, anonymous
 *   POST /feedback     {text, version, lang, images?: [{mime, data(base64)}]} 1.3.4, ≤ 1.4 MB
 *   GET  /health
 * Cron (every minute): sends each device the reminders due in its own time zone.
 * The Worker entry (index.js) only wires these to the D1 store.
 * @module app
 */
import { dueNow, localParts, shiftDay } from './schedule.js';
import { message } from './messages.js';
import { pushRequest, vapidSigner } from './webpush.js';
import * as v from './validate.js';
import * as c from './collect.js';

export const VERSION = '1.2.0';

/** 1.3.4 collection limits: per-isolate windows (no sender key) and hard totals. */
const LIMITS = { foodsPerMin: 30, feedbackPerMin: 5, feedbackPerDay: 200, maxFoods: 20000, testsPerMin: 2 };
/** @type {Map<string, {start: number, n: number}>} */
const windows = new Map();
/** Forget the rate windows (tests). */
export const resetLimits = () => windows.clear();

/**
 * @typedef {object} Env
 * @property {D1Database} DB
 * @property {string} VAPID_PUBLIC_KEY @property {string} VAPID_PRIVATE_KEY JWK (JSON), a Worker secret
 * @property {string} VAPID_SUBJECT @property {string} ALLOWED_ORIGINS comma-separated
 * @property {string} [ALLOW_LOCALHOST] "false" disables http://localhost origins
 * @property {string} [MAX_DEVICES] @property {string} [MAX_SENDS_PER_RUN]
 * @property {string} [TURNSTILE_SECRET] 1.4.0, optional secret: when set, /feedback needs a
 *   valid Cloudflare Turnstile token (`turnstile` in the body); when unset nothing changes.
 */

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** @param {Env} env @param {string|null} origin */
export function originAllowed(env, origin) {
  if (!origin) return false;
  if (
    (env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((s) => s.trim())
      .includes(origin)
  )
    return true;
  return env.ALLOW_LOCALHOST !== 'false' && LOCAL.test(origin);
}

/** @param {string|null} origin */
const cors = (origin) =>
  origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : { Vary: 'Origin' };

/** @param {number} status @param {any} [body] @param {Record<string, string>} [h] */
const reply = (status, body, h = {}) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...h, ...(body == null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store' },
  });

/** Event → daily flag column. @param {{type: string, which?: string}} e */
const flagOf = (e) =>
  ({
    awake: 'ack_at',
    'protein-done': 'protein_done',
    'protein-skipped': 'protein_done',
    'goodnight-done': 'goodnight',
  })[e.type] ?? (e.type === 'checkin-done' ? (e.which === 'am' ? 'checkin_am' : 'checkin_pm') : null);

/**
 * Device-local day an event belongs to. Goodnight before 04:00 counts for the previous evening.
 * @param {string} tz @param {number} at @param {string} type
 */
export function eventDay(tz, at, type) {
  const p = localParts(tz, at);
  return type === 'goodnight-done' && p.min < 240 ? shiftDay(p.day, -1) : p.day;
}

/**
 * Route one HTTP request.
 * @param {Request} req @param {Env} env @param {import('./store.js').Store} store @param {number} [now]
 * @param {(r: Request) => Promise<Response>} [send] outbound fetch (Turnstile check; tests stub it)
 */
export async function handle(req, env, store, now = Date.now(), send = (r) => fetch(r)) {
  const url = new URL(req.url),
    origin = req.headers.get('Origin'),
    ok = originAllowed(env, origin),
    h = cors(ok ? origin : null);
  if (req.method === 'OPTIONS') return reply(ok ? 204 : 403, null, h);
  if (req.method === 'GET' && url.pathname === '/health') {
    const db = await store.countDevices().then(
      () => true,
      () => false,
    );
    return reply(
      db ? 200 : 503,
      {
        ok: db,
        service: 'vidrichka-push',
        version: VERSION,
        time: new Date(now).toISOString(),
        db,
        vapid: !!env.VAPID_PRIVATE_KEY,
      },
      h,
    );
  }
  if (req.method !== 'POST') return reply(405, { error: 'method' }, h);
  if (!ok) return reply(403, { error: 'origin' }, h);
  try {
    if (url.pathname === '/foods') {
      const f = c.food(await c.body(req, c.MAX_FOOD_BODY));
      if (!c.allow(windows, 'foods', LIMITS.foodsPerMin, 60e3, now)) return reply(429, { error: 'rate' }, h);
      if ((await store.countFoods()) >= LIMITS.maxFoods) return reply(503, { error: 'full' }, h);
      await store.addFood(f);
      return reply(204, null, h);
    }
    if (url.pathname === '/feedback') {
      const raw = await c.body(req, c.MAX_FEEDBACK_BODY);
      const f = c.feedback(raw);
      if (!c.allow(windows, 'feedback', LIMITS.feedbackPerMin, 60e3, now)) return reply(429, { error: 'rate' }, h);
      if (
        env.TURNSTILE_SECRET &&
        !(await c.turnstileOk(raw?.turnstile, env.TURNSTILE_SECRET, req.headers.get('CF-Connecting-IP'), send))
      )
        return reply(403, { error: 'turnstile' }, h);
      if ((await store.countFeedback(now - 864e5)) >= LIMITS.feedbackPerDay) return reply(429, { error: 'rate' }, h);
      const id = await store.addFeedback(f, now);
      return reply(201, { ok: true, id }, h);
    }
    const b = await v.jsonBody(req),
      id = v.deviceId(b?.id);
    switch (url.pathname) {
      case '/subscribe': {
        const sub = v.subscription(b.subscription);
        const dev = {
          id,
          ...sub,
          tz: v.zone(b.tz),
          settings: v.settings(b.settings),
          texts: v.texts(b.texts),
          created_at: now,
          updated_at: now,
        };
        if (!(await store.getDevice(id)) && (await store.countDevices()) >= Number(env.MAX_DEVICES || 50))
          return reply(503, { error: 'full' }, h);
        await store.upsertDevice(dev);
        return reply(204, null, h);
      }
      case '/settings': {
        const p = {
          tz: b.tz == null ? undefined : v.zone(b.tz),
          settings: b.settings == null ? undefined : v.settings(b.settings),
          texts: b.texts == null ? undefined : v.texts(b.texts),
        };
        return reply((await store.updateDevice(id, p, now)) ? 204 : 404, null, h);
      }
      case '/event': {
        const e = v.event(b),
          dev = await store.getDevice(id);
        if (!dev) return reply(404, null, h);
        const flag = flagOf(e);
        // Queued events keep their real time, but never from the future or days ago.
        const at = Math.min(now, Math.max(now - 36 * 3600e3, e.at ?? now));
        if (flag) await store.setFlag(id, eventDay(dev.tz, at, e.type), flag, at);
        return reply(204, null, h);
      }
      case '/test': {
        // 1.4.0: "Send a test notification" from the push card – right now, to this device only.
        const dev = await store.getDevice(id);
        if (!dev) return reply(404, null, h);
        if (!c.allow(windows, `test:${id}`, LIMITS.testsPerMin, 60e3, now)) return reply(429, { error: 'rate' }, h);
        const text = (/** @type {unknown} */ x, /** @type {number} */ n, /** @type {string} */ d) =>
          typeof x === 'string' && x.trim() ? x.trim().slice(0, n) : d;
        const sign = vapidSigner({
          publicKey: env.VAPID_PUBLIC_KEY,
          privateJwk: JSON.parse(env.VAPID_PRIVATE_KEY),
          subject: env.VAPID_SUBJECT,
        });
        const msg = {
          v: 1,
          title: text(b.title, 80, 'Vidrichka 🦦'),
          body: text(b.body, 200, 'Test notification – it works!'),
          tag: 'vf-test',
          route: 'home',
          silent: false,
          loud: false,
          actions: [],
          day: '',
          kind: 'test',
          group: 'test',
          at: now,
        };
        const res = await send(await pushRequest(dev, msg, sign, { topic: 'vf-test', urgency: 'high', ttl: 300 }));
        if (res.status === 404 || res.status === 410) {
          await store.deleteDevices([id]);
          return reply(410, { error: 'gone' }, h);
        }
        return reply(res.ok ? 204 : 502, res.ok ? null : { error: 'push' }, h);
      }
      case '/unsubscribe':
        await store.deleteDevices([id]);
        return reply(204, null, h);
      default:
        return reply(404, { error: 'not found' }, h);
    }
  } catch (err) {
    if (err instanceof v.Invalid) return reply(err.message === 'too large' ? 413 : 400, { error: err.message }, h);
    console.error('request failed', err);
    return reply(500, { error: 'server' }, h);
  }
}

/**
 * One cron run: compute what is due for every device, claim it (once per day per kind),
 * send, and drop subscriptions the push service says are gone (404/410).
 * Sends are capped per run (free plan: 50 subrequests); the rest go out next minute,
 * well within each reminder's grace window.
 * @param {Env} env @param {import('./store.js').Store} store @param {number} now
 * @param {(r: Request) => Promise<Response>} [send]
 * @returns {Promise<{due: number, sent: number, failed: number, removed: number}>}
 */
export async function runCron(env, store, now, send = (r) => fetch(r)) {
  const devices = await store.listDevices();
  const stats = { due: 0, sent: 0, failed: 0, removed: 0 };
  if (!devices.length) return stats;
  const days = [
    ...new Set(devices.flatMap((d) => [localParts(d.tz, now).day, shiftDay(localParts(d.tz, now).day, -1)])),
  ];
  const { daily, sent } = await store.stateFor(days);
  /** @type {{dev: import('./store.js').Device, slot: import('./schedule.js').Slot}[]} */
  const todo = [];
  for (const dev of devices) {
    const flags = Object.fromEntries(daily.filter((r) => r.device_id === dev.id).map((r) => [r.day, r]));
    /** @type {Record<string, string[]>} */
    const done = {};
    for (const r of sent) if (r.device_id === dev.id) (done[r.day] ??= []).push(r.kind);
    for (const slot of dueNow({ tz: dev.tz, settings: dev.settings, now, flags, sent: done })) todo.push({ dev, slot });
  }
  stats.due = todo.length;
  const batch = todo.slice(0, Number(env.MAX_SENDS_PER_RUN || 20));
  const claimed = new Set(
    (
      await store.claim(batch.map(({ dev, slot }) => ({ device_id: dev.id, day: slot.day, kind: slot.kind, at: now })))
    ).map((r) => `${r.device_id}|${r.day}|${r.kind}`),
  );
  const sign = vapidSigner({
    publicKey: env.VAPID_PUBLIC_KEY,
    privateJwk: JSON.parse(env.VAPID_PRIVATE_KEY),
    subject: env.VAPID_SUBJECT,
  });
  /** @type {string[]} */
  const gone = [];
  await Promise.all(
    batch
      .filter(({ dev, slot }) => claimed.has(`${dev.id}|${slot.day}|${slot.kind}`))
      .map(async ({ dev, slot }) => {
        try {
          const req = await pushRequest(dev, message(dev, slot), sign, {
            topic: `vf-${slot.group}`,
            urgency: 'high',
            ttl: 30 * 60,
          });
          const res = await send(req);
          if (res.ok) return void stats.sent++;
          stats.failed++;
          if (res.status === 404 || res.status === 410) gone.push(dev.id);
          else console.warn('push rejected', res.status, new URL(dev.endpoint).host, (await res.text()).slice(0, 200));
        } catch (err) {
          stats.failed++;
          console.error('push failed', err);
        }
      }),
  );
  if (gone.length) await store.deleteDevices([...new Set(gone)]);
  stats.removed = new Set(gone).size;
  // Hourly: forget daily flags and dedupe rows older than 3 days.
  if (new Date(now).getUTCMinutes() === 0) await store.cleanup(shiftDay(new Date(now).toISOString().slice(0, 10), -3));
  return stats;
}
