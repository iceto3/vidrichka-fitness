/**
 * 1.3.3: in-app recording helpers (container choice, mic errors, level, timer, where the
 * browser's own speech recognition is kept), sending a recording for transcription, the
 * gendered combination names and the new strings.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  BITRATE,
  MAX_REC_MS,
  TYPES,
  clock,
  isAndroidChrome,
  level,
  micError,
  pickType,
} from '../../src/features/voice/recorder.js';
import { transcribeAudio } from '../../src/features/voice/api.js';
import { VOICE_URL } from '../../src/features/voice/config.js';
import { setLang } from '../../src/core/i18n.js';
import bg from '../../src/data/i18n/bg.js';
import en from '../../src/data/i18n/en.js';

test('recording settings: 30 s, 32 kbps, mp4 first then webm/opus', () => {
  assert.equal(MAX_REC_MS, 30_000);
  assert.equal(BITRATE, 32_000);
  assert.equal(TYPES[0], 'audio/mp4');
  assert.equal(
    pickType(() => true),
    'audio/mp4',
  );
  assert.equal(
    pickType((t) => t.startsWith('audio/webm')),
    'audio/webm;codecs=opus',
  );
  assert.equal(
    pickType(() => false),
    '',
  );
});

test('mic errors map to clear messages', () => {
  assert.equal(micError({ name: 'NotAllowedError' }), 'mic-denied');
  assert.equal(micError({ name: 'SecurityError' }), 'mic-denied');
  assert.equal(micError({ name: 'NotFoundError' }), 'no-mic');
  assert.equal(micError(new Error('x')), 'mic-failed');
  for (const k of ['mic-denied', 'no-mic', 'mic-failed', 'no-audio', 'stt', 'offline', 'rate-limit'])
    assert.ok(bg[`voice.err.${k}`] && en[`voice.err.${k}`], k);
});

test('level meter and timer', () => {
  assert.equal(level(new Uint8Array(64).fill(128)), 0);
  assert.equal(level(new Uint8Array(64).map((_, i) => (i % 2 ? 255 : 0))), 1);
  const mid = level(new Uint8Array(64).map((_, i) => (i % 2 ? 144 : 112)));
  assert.ok(mid > 0.3 && mid < 0.7, String(mid));
  assert.equal(clock(0), '0:00');
  assert.equal(clock(7400), '0:07');
  assert.equal(clock(30_000), '0:30');
});

test('the browser speech recognition is kept only on Android Chrome', () => {
  const android =
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Mobile Safari/537.36';
  assert.equal(isAndroidChrome(android), true);
  assert.equal(isAndroidChrome(android.replace('Chrome/141.0', 'SamsungBrowser/27.0 Chrome/125.0')), false);
  assert.equal(isAndroidChrome('Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0'), false);
  assert.equal(
    isAndroidChrome(
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/141.0 Mobile/15E148 Safari/604.1',
    ),
    false,
  );
  assert.equal(
    isAndroidChrome(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36',
    ),
    false,
  );
});

test('transcribeAudio posts the raw audio with its type and the app language', async () => {
  const real = globalThis.fetch;
  /** @type {any[]} */
  const calls = [];
  const reply = (/** @type {number} */ status, /** @type {any} */ body) =>
    (globalThis.fetch = /** @type {any} */ (
      async (/** @type {string} */ url, /** @type {any} */ o) => (
        calls.push({ url, o }),
        new Response(JSON.stringify(body), { status })
      )
    ));
  const blob = new Blob([new Uint8Array(4000)], { type: 'audio/webm;codecs=opus' });
  try {
    await setLang('bg');
    reply(200, { text: ' 150 г сьомга с ориз ', duration: 3.1 });
    assert.equal(await transcribeAudio(blob), '150 г сьомга с ориз');
    assert.equal(calls[0].url, `${VOICE_URL}/transcribe?lang=bg`);
    assert.equal(calls[0].o.method, 'POST');
    assert.equal(calls[0].o.headers['Content-Type'], 'audio/webm');
    assert.equal(calls[0].o.body, blob);
    await setLang('en');
    await transcribeAudio(blob);
    assert.equal(calls[1].url, `${VOICE_URL}/transcribe?lang=en`);
    await setLang('bg');
    const code = async () =>
      transcribeAudio(blob).then(
        () => 'ok',
        (e) => e.message,
      );
    reply(429, { error: 'rate-limit' });
    assert.equal(await code(), 'rate-limit');
    reply(200, { text: '  ', duration: 1 });
    assert.equal(await code(), 'no-audio');
    reply(502, { error: 'upstream' });
    assert.equal(await code(), 'stt');
    globalThis.fetch = /** @type {any} */ (async () => Promise.reject(new TypeError('Failed to fetch')));
    assert.equal(await code(), 'offline');
    assert.equal(await transcribeAudio(new Blob([])).catch((e) => e.message), 'no-audio');
  } finally {
    globalThis.fetch = real;
  }
});

test('suggested combination names agree with the meal; shorter over-100 text; 1.3.3 strings', () => {
  assert.equal(bg['food.usualMeal.breakfast'], 'Обичайната ти закуска');
  assert.equal(bg['food.usualMeal.lunch'], 'Обичайният ти обяд');
  assert.equal(bg['food.usualMeal.dinner'], 'Обичайната ти вечеря');
  assert.equal(bg['food.usualMeal.snack'], 'Обичайното ти междинно хранене');
  assert.equal(bg['manual.errOver100'], 'Най-много 100 г на 100 г продукт.');
  assert.equal(bg['voice.record'], 'Запиши');
  assert.equal(bg['voice.transcribing'], 'Разпознаване…');
  const keys = Object.keys(bg).filter((k) =>
    /^(food\.usualMeal\.\w+|voice\.(hintRec|privacyRec|record|transcribing|level|err\.(mic-denied|no-mic|mic-failed|no-audio|stt))|whatsNew\.(record|fixes133))$/.test(
      k,
    ),
  );
  assert.equal(keys.length, 16);
  for (const k of keys) assert.ok(k in en, k);
  assert.ok(!('food.usualMeal' in bg));
});
