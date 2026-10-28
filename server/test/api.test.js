// HTTP API (validation, CORS, abuse limits) and the cron run (send, dedupe, dead
// subscriptions, per-run cap), on an in-memory store and a fake push service.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, runCron, eventDay } from '../src/app.js';
import { memoryStore } from '../src/store.js';
import { MAX_BODY } from '../src/validate.js';
import { SETTINGS, TZ, fakeBrowser, sofia, vapidKeys } from './helpers.js';

const V = vapidKeys();
const ENV = {
  VAPID_PUBLIC_KEY: V.publicKey,
  VAPID_PRIVATE_KEY: JSON.stringify(V.privateJwk),
  VAPID_SUBJECT: 'https://iceto3.github.io/vidrichka-fitness/',
  ALLOWED_ORIGINS: 'https://iceto3.github.io',
  MAX_DEVICES: '3',
  MAX_SENDS_PER_RUN: '2',
};
const APP = 'https://iceto3.github.io';
const ID = 'test-device-0123456789abcd';

const post = (store, path, body, { origin = APP, now } = {}) =>
  handle(
    new Request(`https://push.example${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', ...(origin ? { Origin: origin } : {}) },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    ENV,
    store,
    now,
  );

const browser = fakeBrowser();
const sub = (id = ID, endpoint = `https://fcm.googleapis.com/fcm/send/${id}`) => ({
  id,
  subscription: { endpoint, keys: browser.keys },
  tz: TZ,
  settings: SETTINGS,
  texts: { water: { title: 'Вода 💧', body: 'Пи вода', actions: { 'water-add': '+1 чаша' } } },
});

test('health', async () => {
  const r = await handle(new Request('https://push.example/health'), ENV, memoryStore());
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.ok, true);
  assert.equal(j.vapid, true);
});

test('CORS: only the app origin and localhost', async () => {
  const s = memoryStore();
  const pre = (origin) =>
    handle(new Request('https://push.example/subscribe', { method: 'OPTIONS', headers: { Origin: origin } }), ENV, s);
  assert.equal((await pre(APP)).headers.get('access-control-allow-origin'), APP);
  assert.equal((await pre('http://localhost:8080')).status, 204);
  assert.equal((await pre('https://evil.example')).status, 403);
  assert.equal((await pre('https://evil.example')).headers.get('access-control-allow-origin'), null);
  assert.equal((await post(s, '/subscribe', sub(), { origin: 'https://evil.example' })).status, 403);
  assert.equal((await post(s, '/subscribe', sub(), { origin: null })).status, 403);
  assert.equal(s.devices.size, 0);
});

test('subscribe validates and upserts; settings and unsubscribe', async () => {
  const s = memoryStore();
  assert.equal((await post(s, '/subscribe', { ...sub(), id: 'short' })).status, 400);
  assert.equal((await post(s, '/subscribe', { ...sub(), id: 'bad id with spaces 0123456' })).status, 400);
  assert.equal((await post(s, '/subscribe', { ...sub(), tz: 'Mars/Olympus' })).status, 400);
  assert.equal((await post(s, '/subscribe', sub(ID, 'https://evil.example/push'))).status, 400, 'unknown push host');
  assert.equal((await post(s, '/subscribe', sub(ID, 'http://fcm.googleapis.com/x'))).status, 400, 'https only');
  assert.equal((await post(s, '/subscribe', '{not json')).status, 400);
  assert.equal((await post(s, '/subscribe', JSON.stringify({ ...sub(), pad: 'x'.repeat(MAX_BODY) }))).status, 413);
  assert.equal((await post(s, '/subscribe', sub())).status, 204);
  assert.equal((await post(s, '/subscribe', sub())).status, 204, 'idempotent');
  assert.equal(s.devices.size, 1);
  const d = s.devices.get(ID);
  assert.equal(d.tz, TZ);
  assert.equal(d.settings.wake, '07:30');
  assert.equal(d.texts.water.title, 'Вода 💧');
  assert.ok(!('mood' in d) && !('weight' in d), 'no health data');

  const water = SETTINGS.water.map((w) => ({ ...w, time: '09:00', extra: 'dropped' }));
  assert.equal(
    (await post(s, '/settings', { id: ID, settings: { ...SETTINGS, wake: '06:45', water, hack: 1 } })).status,
    204,
  );
  assert.equal(s.devices.get(ID).settings.wake, '06:45');
  assert.deepEqual(s.devices.get(ID).settings.water[0], { time: '09:00', on: true });
  assert.ok(!('hack' in s.devices.get(ID).settings));
  assert.equal((await post(s, '/settings', { id: 'unknown-device-0123456789', tz: TZ })).status, 404);
  assert.equal((await post(s, '/settings', { id: ID, settings: { wake: '25:00' } })).status, 204);
  assert.equal(s.devices.get(ID).settings.wake, '07:30', 'bad time falls back to the default');

  assert.equal((await post(s, '/unsubscribe', { id: ID })).status, 204);
  assert.equal(s.devices.size, 0);
});

test('device cap protects against sign-up floods', async () => {
  const s = memoryStore();
  for (let i = 0; i < 3; i++)
    assert.equal((await post(s, '/subscribe', sub(`device-${i}-0123456789abcdefg`))).status, 204);
  assert.equal((await post(s, '/subscribe', sub('device-9-0123456789abcdefg'))).status, 503);
  assert.equal(
    (await post(s, '/subscribe', sub('device-0-0123456789abcdefg'))).status,
    204,
    'existing device may update',
  );
});

test('events set first-time-wins daily flags on the device-local day', async () => {
  const s = memoryStore();
  await post(s, '/subscribe', sub());
  const now = sofia('2026-10-20T07:40');
  assert.equal((await post(s, '/event', { id: ID, type: 'awake' }, { now })).status, 204);
  assert.equal((await post(s, '/event', { id: ID, type: 'awake', at: now + 60e3 }, { now: now + 120e3 })).status, 204);
  assert.equal(s.daily.get(`${ID}|2026-10-20`).ack_at, now, 'first one wins');
  assert.equal((await post(s, '/event', { id: ID, type: 'checkin-done' })).status, 400, 'which is required');
  assert.equal((await post(s, '/event', { id: ID, type: 'checkin-done', which: 'am' }, { now })).status, 204);
  assert.equal((await post(s, '/event', { id: ID, type: 'water-logged' }, { now })).status, 204);
  assert.equal((await post(s, '/event', { id: ID, type: 'nope' })).status, 400);
  assert.equal((await post(s, '/event', { id: 'unknown-device-0123456789', type: 'awake' })).status, 404);
  const row = s.daily.get(`${ID}|2026-10-20`);
  assert.deepEqual(Object.keys(row).sort(), ['ack_at', 'checkin_am', 'day', 'device_id']);
  assert.equal(
    eventDay(TZ, sofia('2026-10-21T01:10'), 'goodnight-done'),
    '2026-10-20',
    'after midnight = last evening',
  );
  assert.equal(eventDay(TZ, sofia('2026-10-21T01:10'), 'awake'), '2026-10-21');
});

test('cron sends due reminders once, skips acknowledged ones, removes dead subscriptions', async () => {
  const s = memoryStore();
  await post(s, '/subscribe', sub());
  /** @type {Request[]} */
  const reqs = [];
  const send = async (r) => (reqs.push(r), new Response(null, { status: 201 }));
  const run = (iso) => runCron(ENV, s, sofia(iso), send);

  assert.deepEqual(await run('2026-10-20T07:29'), { due: 0, sent: 0, failed: 0, removed: 0 });
  assert.equal((await run('2026-10-20T07:30')).sent, 1);
  assert.equal((await run('2026-10-20T07:31')).sent, 0, 'deduped');
  const wake = JSON.parse(browser.decrypt(new Uint8Array(await reqs[0].arrayBuffer())).text);
  assert.equal(wake.silent, true);
  assert.equal(wake.route, 'morning');
  assert.equal(wake.tag, 'vf-morning');
  assert.equal(wake.day, '2026-10-20');

  await post(s, '/event', { id: ID, type: 'awake' }, { now: sofia('2026-10-20T07:40') });
  assert.equal((await run('2026-10-20T07:50')).sent, 1, 'p10');
  await post(s, '/event', { id: ID, type: 'protein-done' }, { now: sofia('2026-10-20T07:55') });
  assert.equal((await post(s, '/event', { id: ID, type: 'protein-skipped' })).status, 204, 'skip also accepted');
  assert.equal((await run('2026-10-20T08:00')).due, 0, 'p20 skipped after protein');
  assert.equal((await run('2026-10-20T08:15')).due, 0, 'loud skipped after awake');

  reqs.length = 0;
  assert.equal((await run('2026-10-20T14:00')).sent, 1);
  const w = JSON.parse(browser.decrypt(new Uint8Array(await reqs[0].arrayBuffer())).text);
  assert.deepEqual(w.actions, [{ action: 'water-add', title: '+1 чаша' }]);
  assert.equal(w.title, 'Вода 💧');
  assert.equal(w.route, 'food?water');

  const gone = async () => new Response(null, { status: 410 });
  assert.deepEqual(await runCron(ENV, s, sofia('2026-10-20T17:00'), gone), { due: 1, sent: 0, failed: 1, removed: 1 });
  assert.equal(s.devices.size, 0);
  assert.equal([...s.sent.values()].length, 0, 'its rows are gone too');
});

test('per-run send cap: the rest goes out next minute', async () => {
  const s = memoryStore();
  for (let i = 0; i < 3; i++) await post(s, '/subscribe', sub(`device-${i}-0123456789abcdefg`));
  let n = 0;
  const send = async () => (n++, new Response(null, { status: 201 }));
  const a = await runCron(ENV, s, sofia('2026-10-20T07:30'), send);
  assert.deepEqual([a.due, a.sent], [3, 2]);
  const b = await runCron(ENV, s, sofia('2026-10-20T07:31'), send);
  assert.deepEqual([b.due, b.sent], [1, 1]);
  assert.equal(n, 3);
});

test('1.4.0 /test: one push to this device now, 2 per minute, unknown device 404, gone device dropped', async () => {
  const { resetLimits } = await import('../src/app.js');
  resetLimits();
  const s = memoryStore();
  /** @type {Request[]} */
  const sent = [];
  let status = 201;
  const send = async (r) => (sent.push(r), new Response(null, { status }));
  const call = (body) =>
    handle(
      new Request('https://push.example/test', {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain', Origin: APP },
        body: JSON.stringify(body),
      }),
      ENV,
      s,
      Date.now(),
      send,
    );
  assert.equal((await call({ id: ID })).status, 404);
  assert.equal((await post(s, '/subscribe', sub())).status, 204);
  assert.equal((await call({ id: ID, title: 'Пробно', body: 'Работи!' })).status, 204);
  assert.equal(sent.length, 1);
  assert.equal(new URL(sent[0].url).host, 'fcm.googleapis.com');
  assert.equal(sent[0].headers.get('Topic'), 'vf-test');
  assert.equal((await call({ id: ID })).status, 204);
  assert.equal((await call({ id: ID })).status, 429, '2 per minute');
  resetLimits();
  status = 410;
  assert.equal((await call({ id: ID })).status, 410);
  assert.equal(s.devices.size, 0, 'a gone subscription is removed');
});

test('1.4.0 loudOn=false: no loud alarm, the silent nudge stays', async () => {
  const { dueNow } = await import('../src/schedule.js');
  const { settings } = await import('../src/validate.js');
  const off = settings({ ...SETTINGS, loudOn: false });
  assert.equal(off.loudOn, false);
  assert.equal(settings(SETTINGS).loudOn, true, 'default on');
  const kinds = (st, at) => dueNow({ tz: TZ, settings: st, now: sofia(at), flags: {}, sent: {} }).map((x) => x.kind);
  assert.ok(kinds(settings(SETTINGS), '2026-10-28T08:20').includes('loud'));
  assert.ok(!kinds(off, '2026-10-28T08:20').includes('loud'));
  assert.ok(kinds(off, '2026-10-28T07:35').includes('wake'));
});
