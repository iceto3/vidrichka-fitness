// 1.3.4 POST /foods and /feedback: validation, CORS/origin, size and rate limits, and
// that nothing but the allowed fields is stored.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle, resetLimits } from '../src/app.js';
import { memoryStore } from '../src/store.js';
import { MAX_FEEDBACK_BODY, MAX_IMAGE, allow, food } from '../src/collect.js';

const ENV = { ALLOWED_ORIGINS: 'https://iceto3.github.io', ALLOW_LOCALHOST: 'false' };
const APP = 'https://iceto3.github.io';
const post = (store, path, body, origin = APP, now = 1_700_000_000_000) =>
  handle(
    new Request(`https://push.example${path}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain',
        ...(origin ? { Origin: origin } : {}),
        'CF-Connecting-IP': '203.0.113.9',
      },
      body: typeof body === 'string' ? body : JSON.stringify(body),
    }),
    /** @type {any} */ (ENV),
    store,
    now,
  );
const FOOD = {
  name: '  Баница  с  сирене ',
  kcal: 290,
  protein: 9.04,
  carbs: 30,
  fat: 15,
  fiber: null,
  salt: 1.234,
  lang: 'bg',
};
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, ...Array(60).fill(1)]).toString('base64');

test('/foods stores only name, per-100 g values and language; identical entries are counted', async () => {
  resetLimits();
  const s = memoryStore();
  assert.equal((await post(s, '/foods', { ...FOOD, grams: 150, date: '2026-10-27', id: 'x' })).status, 204);
  assert.equal((await post(s, '/foods', FOOD)).status, 204);
  assert.equal(s.foods.length, 1);
  assert.deepEqual(s.foods[0], {
    id: 1,
    name: 'Баница с сирене',
    lang: 'bg',
    kcal: 290,
    protein: 9,
    carbs: 30,
    fat: 15,
    fiber: null,
    salt: 1.23,
    n: 2,
  });
  assert.equal(s.devices.size, 0);
});

test('/foods rejects bad values, other origins and big bodies', async () => {
  resetLimits();
  const s = memoryStore();
  assert.equal((await post(s, '/foods', { ...FOOD, kcal: 5000 })).status, 400);
  assert.equal((await post(s, '/foods', { ...FOOD, name: '' })).status, 400);
  assert.equal((await post(s, '/foods', { ...FOOD, protein: 'a lot' })).status, 400);
  assert.equal((await post(s, '/foods', FOOD, 'https://evil.example')).status, 403);
  assert.equal((await post(s, '/foods', FOOD, null)).status, 403);
  assert.equal((await post(s, '/foods', { ...FOOD, pad: 'x'.repeat(2000) })).status, 413);
  assert.equal(s.foods.length, 0);
  assert.throws(() => food({ ...FOOD, name: 'x'.repeat(81) }));
});

test('/foods and /feedback are rate limited per isolate', async () => {
  resetLimits();
  const s = memoryStore();
  let last = 0;
  for (let i = 0; i < 31; i++) last = (await post(s, '/foods', { ...FOOD, kcal: i })).status;
  assert.equal(last, 429);
  assert.equal((await post(s, '/foods', FOOD, APP, 1_700_000_000_000 + 61e3)).status, 204);
  const st = new Map();
  assert.equal(allow(st, 'k', 1, 1000, 0), true);
  assert.equal(allow(st, 'k', 1, 1000, 10), false);
  assert.equal(allow(st, 'k', 1, 1000, 1000), true);
});

test('/feedback stores text, version, language, time and up to 3 checked images', async () => {
  resetLimits();
  const s = memoryStore();
  const r = await post(s, '/feedback', {
    text: '  Искам графика за водата  ',
    version: '1.3.4',
    lang: 'bg',
    images: [{ mime: 'image/jpeg', data: JPEG }],
    deviceId: 'nope',
  });
  assert.equal(r.status, 201);
  assert.deepEqual(await r.json(), { ok: true, id: 1 });
  const f = s.feedback[0];
  assert.equal(f.text, 'Искам графика за водата');
  assert.equal(f.version, '1.3.4');
  assert.equal(f.created_at, 1_700_000_000_000);
  assert.equal(f.images.length, 1);
  assert.equal(f.images[0].data[0], 0xff);
  assert.deepEqual(Object.keys(f).sort(), ['created_at', 'id', 'images', 'lang', 'text', 'version']);
});

test('/feedback rejects empty text, fake or too many images and huge bodies', async () => {
  resetLimits();
  const s = memoryStore();
  const ok = { text: 'Hi', version: '1.3.4', lang: 'en' };
  assert.equal((await post(s, '/feedback', { ...ok, text: '   ' })).status, 400);
  assert.equal((await post(s, '/feedback', { ...ok, version: '<script>' })).status, 400);
  const png = Buffer.from('not an image at all, honestly').toString('base64');
  assert.equal((await post(s, '/feedback', { ...ok, images: [{ mime: 'image/png', data: png }] })).status, 400);
  const four = Array(4).fill({ mime: 'image/jpeg', data: JPEG });
  assert.equal((await post(s, '/feedback', { ...ok, images: four })).status, 400);
  const big = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_IMAGE)]).toString('base64');
  assert.equal((await post(s, '/feedback', { ...ok, images: [{ mime: 'image/jpeg', data: big }] })).status, 400);
  assert.equal((await post(s, '/feedback', { ...ok, pad: 'x'.repeat(MAX_FEEDBACK_BODY) })).status, 413);
  assert.equal(s.feedback.length, 0);
  let last = 0;
  for (let i = 0; i < 6; i++) last = (await post(s, '/feedback', ok)).status;
  assert.equal(last, 429);
  assert.equal(s.feedback.length, 5);
});

test('1.4.0 Turnstile: off without a secret; with one, /feedback needs a valid token (never stored)', async () => {
  const body = { text: 'здрасти', version: '1.4.0', lang: 'bg' };
  const req = (b) =>
    new Request('https://push.example/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain', Origin: APP, 'CF-Connecting-IP': '203.0.113.9' },
      body: JSON.stringify(b),
    });
  /** @type {{token: string|null, ip: string|null}[]} */
  const seen = [];
  const send = async (/** @type {Request} */ r) => {
    const f = await r.formData();
    seen.push({ token: /** @type {string} */ (f.get('response')), ip: /** @type {string} */ (f.get('remoteip')) });
    return Response.json({ success: f.get('response') === 'good' });
  };
  resetLimits();
  let s = memoryStore();
  assert.equal((await handle(req(body), /** @type {any} */ (ENV), s, 1, send)).status, 201, 'off: works as before');
  assert.equal(seen.length, 0);
  const env = /** @type {any} */ ({ ...ENV, TURNSTILE_SECRET: 'x' });
  resetLimits();
  s = memoryStore();
  assert.equal((await handle(req(body), env, s, 1, send)).status, 403, 'no token');
  assert.equal((await handle(req({ ...body, turnstile: 'bad' }), env, s, 1, send)).status, 403);
  assert.equal((await handle(req({ ...body, turnstile: 'good' }), env, s, 1, send)).status, 201);
  assert.deepEqual(seen.at(-1), { token: 'good', ip: '203.0.113.9' });
  assert.equal(s.feedback.length, 1);
  assert.ok(!('turnstile' in s.feedback[0]));
});
