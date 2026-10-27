// POST /transcribe on a mocked Workers AI binding: origin, audio/* only, size, length,
// rate limit, language, and that neither the audio nor the text is logged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MAX_AUDIO, STT_MODEL, toBase64 } from '../src/transcribe.js';

const APP = 'https://iceto3.github.io';
/** A fake AI binding; records the calls. */
function fakeAi(
  out = { text: ' За обяд изядох  150 г сьомга. ', transcription_info: { duration: 4.27 } },
  fail = false,
) {
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
const audio = (n = 4000) => new Uint8Array(n).map((_, i) => i % 251);
const call = (/** @type {any} */ o = {}) =>
  handle(
    new Request(`https://voice.example/transcribe${o.q ?? '?lang=bg'}`, {
      method: o.method ?? 'POST',
      headers: { ...(o.origin === null ? {} : { Origin: o.origin ?? APP }), 'Content-Type': o.type ?? 'audio/mp4' },
      body: o.method === 'GET' ? undefined : (o.body ?? audio()),
    }),
    { ALLOWED_ORIGINS: APP, XAI_API_KEY: 'k', ...(o.ai === null ? {} : { AI: o.ai ?? fakeAi() }) },
    { sttLimit: o.limit ?? (() => true) },
  );

test('transcribes the audio with Whisper turbo in Bulgarian, VAD on, and returns {text, duration}', async () => {
  const ai = fakeAi();
  const logs = [];
  const log = console.log;
  console.log = (...a) => logs.push(a.join(' '));
  try {
    const res = await call({ ai });
    assert.equal(res.status, 200);
    assert.deepEqual(await res.json(), { text: 'За обяд изядох 150 г сьомга.', duration: 4.3 });
    assert.equal(res.headers.get('Access-Control-Allow-Origin'), APP);
    assert.equal(res.headers.get('Cache-Control'), 'no-store');
  } finally {
    console.log = log;
  }
  assert.equal(ai.calls.length, 1);
  assert.equal(ai.calls[0].model, STT_MODEL);
  assert.equal(STT_MODEL, '@cf/openai/whisper-large-v3-turbo');
  assert.equal(ai.calls[0].input.language, 'bg');
  assert.equal(ai.calls[0].input.vad_filter, true);
  assert.equal(ai.calls[0].input.audio, toBase64(audio()));
  assert.deepEqual(logs, [], 'nothing logged');
});

test('English when the app is in English; webm/opus accepted', async () => {
  const ai = fakeAi();
  assert.equal((await call({ ai, q: '?lang=en', type: 'audio/webm;codecs=opus' })).status, 200);
  assert.equal(ai.calls[0].input.language, 'en');
});

test('origin, method, type, size and length limits', async () => {
  assert.equal((await call({ origin: 'https://evil.example' })).status, 403);
  assert.equal((await call({ origin: null })).status, 403);
  assert.equal((await call({ method: 'GET' })).status, 405);
  assert.equal((await call({ type: 'text/plain' })).status, 415);
  assert.equal((await call({ type: 'video/mp4' })).status, 415);
  assert.equal((await call({ body: audio(MAX_AUDIO + 1) })).status, 413);
  const short = await call({ body: audio(50) });
  assert.equal(short.status, 400);
  assert.deepEqual(await short.json(), { error: 'no-audio' });
  const long = await call({ ai: fakeAi({ text: 'x', transcription_info: { duration: 36 } }) });
  assert.equal(long.status, 413);
  assert.deepEqual(await long.json(), { error: 'too-long' });
});

test('rate limit, missing binding and upstream failure', async () => {
  const r = await call({ limit: () => false });
  assert.equal(r.status, 429);
  assert.equal(r.headers.get('Retry-After'), '60');
  assert.equal((await call({ ai: null })).status, 503);
  const log = console.log;
  console.log = () => {};
  try {
    assert.equal((await call({ ai: fakeAi(undefined, true) })).status, 502);
  } finally {
    console.log = log;
  }
});

test('the real binding limiter: 6 per minute per IP', async () => {
  let n = 0;
  const env = {
    ALLOWED_ORIGINS: APP,
    AI: fakeAi(),
    STT_LIMITER: { limit: async () => ({ success: ++n <= 6 }) },
  };
  const codes = [];
  for (let i = 0; i < 7; i++)
    codes.push(
      (
        await handle(
          new Request('https://voice.example/transcribe', {
            method: 'POST',
            headers: { Origin: APP, 'Content-Type': 'audio/mp4' },
            body: audio(),
          }),
          env,
          { sttLimit: () => true },
        )
      ).status,
    );
  assert.deepEqual(codes, [200, 200, 200, 200, 200, 200, 429]);
});

test('/health says whether transcription is available', async () => {
  const res = await handle(new Request('https://voice.example/health', { headers: { Origin: APP } }), {
    ALLOWED_ORIGINS: APP,
    AI: fakeAi(),
  });
  assert.equal((await res.json()).transcribe, true);
});
