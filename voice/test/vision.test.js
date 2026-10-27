// POST /vision (1.4.0) on mocked Workers AI / xAI: origin, image types and size, kind and
// date checks, Workers AI first with xAI fallback, clamping of what the model says, the
// rate limit, and that the image is never logged or returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MAX_IMAGE, VISION_MODEL, normalizeVision, parseAnswer, visionPrompt } from '../src/vision.js';

const APP = 'https://iceto3.github.io';
const img = (n = 5000) => new Uint8Array(n).map((_, i) => (i * 7) % 256);
function fakeAi(/** @type {any} */ out, fail = false) {
  /** @type {any[]} */
  const calls = [];
  return {
    calls,
    run: async (/** @type {string} */ model, /** @type {any} */ input) => {
      calls.push({ model, input });
      if (fail) throw new Error('boom');
      return out;
    },
  };
}
function fakeXai(/** @type {any} */ content, status = 200) {
  /** @type {any[]} */
  const calls = [];
  const f = async (/** @type {string} */ url, /** @type {any} */ init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(content) } }] }), { status });
  };
  return Object.assign(f, { calls });
}
const call = (/** @type {any} */ o = {}) =>
  handle(
    new Request(`https://voice.example/vision${o.q ?? '?kind=steps&today=2026-10-28&lang=bg'}`, {
      method: 'POST',
      headers: { ...(o.origin === null ? {} : { Origin: o.origin ?? APP }), 'Content-Type': o.type ?? 'image/jpeg' },
      body: o.body ?? img(),
    }),
    {
      ALLOWED_ORIGINS: APP,
      ...(o.key === null ? {} : { XAI_API_KEY: 'k' }),
      ...(o.ai === null ? {} : { AI: o.ai ?? fakeAi({ response: '{"days":[]}' }) }),
    },
    { visionLimit: o.limit ?? (() => true), fetch: o.fetch ?? fakeXai({ days: [] }) },
  );

test('Workers AI reads the steps; xAI is not called; nothing is logged', async () => {
  const ai = fakeAi({ response: 'Sure: {"days":[{"date":"2026-10-28","steps":"8 432"}]}' });
  const x = fakeXai({ days: [] });
  const logs = [];
  const log = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const r = await call({ ai, fetch: x });
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { days: [{ date: '2026-10-28', steps: 8432 }], via: 'workers-ai' });
  } finally {
    console.log = log;
  }
  assert.equal(ai.calls[0].model, VISION_MODEL);
  assert.match(ai.calls[0].input.messages[0].content[1].image_url.url, /^data:image\/jpeg;base64,/);
  assert.equal(x.calls.length, 0);
  assert.deepEqual(logs, []);
});

test('falls back to xAI when Workers AI fails or reads nothing; multi-day week view', async () => {
  for (const ai of [fakeAi(null, true), fakeAi({ response: 'no numbers here' })]) {
    const x = fakeXai({
      days: [
        { date: '2026-10-27', steps: 10234 },
        { date: '2026-10-26', steps: 4500 },
        { date: '2026-10-29', steps: 999 }, // future → date unknown
      ],
    });
    const r = await call({ ai, fetch: x });
    const j = await r.json();
    assert.equal(j.via, 'xai');
    assert.deepEqual(j.days, [
      { date: '2026-10-27', steps: 10234 },
      { date: '2026-10-26', steps: 4500 },
      { date: null, steps: 999 },
    ]);
    assert.equal(x.calls[0].body.response_format.type, 'json_object');
  }
});

test('sleep: hours rounded to ¼ h, quality 1–5 or null, absurd values dropped', () => {
  assert.deepEqual(
    normalizeVision(
      {
        days: [
          { date: '2026-10-28', hours: 7.4, quality: 4 },
          { date: '2026-10-27', hours: 30 },
          { date: '2026-10-26', hours: '6.1', quality: 9 },
        ],
      },
      'sleep',
      '2026-10-28',
    ),
    [
      { date: '2026-10-28', hours: 7.5, quality: 4 },
      { date: '2026-10-26', hours: 6, quality: null },
    ],
  );
});

test('steps: duplicates, zero, >100 000, too-old dates and junk are handled', () => {
  const out = normalizeVision(
    {
      days: [
        { date: '2026-10-28', steps: 5000 },
        { date: '2026-10-28', steps: 6000 },
        { date: '2026-09-01', steps: 7000 },
        { date: 'yesterday', steps: '12,345' },
        { steps: 0 },
        { steps: 250000 },
        'junk',
      ],
    },
    'steps',
    '2026-10-28',
  );
  assert.deepEqual(out, [
    { date: '2026-10-28', steps: 5000 },
    { date: null, steps: 7000 },
    { date: null, steps: 12345 },
  ]);
  assert.deepEqual(normalizeVision(null, 'steps', '2026-10-28'), []);
  assert.equal(parseAnswer('```json\n{"days":[]}\n```').days.length, 0);
  assert.equal(parseAnswer('nothing'), null);
});

test('bad requests: origin, kind, today, type, size, rate limit, not configured', async () => {
  assert.equal((await call({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ q: '?kind=weight&today=2026-10-28' })).status, 400);
  assert.equal((await call({ q: '?kind=steps&today=28.10.2026' })).status, 400);
  assert.equal((await call({ type: 'image/gif' })).status, 415);
  assert.equal((await call({ body: img(MAX_IMAGE + 1) })).status, 413);
  assert.equal((await call({ body: img(10) })).status, 400);
  const r = await call({ limit: () => false });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Retry-After'), '60');
  assert.equal((await call({ ai: null, key: null })).status, 503);
});

test('xAI error → 502 (busy → 429); the prompt asks for JSON and never to guess', async () => {
  assert.equal((await call({ ai: fakeAi(null, true), fetch: fakeXai({}, 500) })).status, 502);
  assert.equal((await call({ ai: fakeAi(null, true), fetch: fakeXai({}, 429) })).status, 429);
  const p = visionPrompt('sleep', '2026-10-28');
  assert.match(p, /Wednesday, 2026-10-28/);
  assert.match(p, /MORNING/);
  assert.match(p, /Never guess/);
});
