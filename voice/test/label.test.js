// 1.4.2 POST /vision?kind=label on mocked Workers AI / xAI: per-100 g values, kJ → kcal,
// sodium → salt, per serving → per 100 g, out-of-range values dropped, unreadable → null,
// `today` optional, xAI fallback, and the image is never returned.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { MAX_LABEL_NAME, labelNum, labelPrompt, normalizeLabel } from '../src/label.js';

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
    new Request(`https://voice.example/vision${o.q ?? '?kind=label&lang=bg'}`, {
      method: 'POST',
      headers: { Origin: APP, 'Content-Type': 'image/jpeg' },
      body: img(),
    }),
    { ALLOWED_ORIGINS: APP, XAI_API_KEY: 'k', ...(o.ai === null ? {} : { AI: o.ai }) },
    { visionLimit: () => true, fetch: o.fetch ?? fakeXai({ basis: null }) },
  );

const LABEL = {
  name: 'Овесени ядки',
  basis: '100g',
  energy_kcal: '372',
  energy_kj: '1 566',
  protein: '13,5',
  fat: '7',
  carbs: '58,7',
  fiber: '10',
  salt: '<0,01',
};

test('labelNum: comma decimals, "<", spaces, junk', () => {
  assert.equal(labelNum('12,5 g'), 12.5);
  assert.equal(labelNum('<0.5'), 0.5);
  assert.equal(labelNum('1 566'), 1566);
  assert.equal(labelNum(3), 3);
  assert.equal(labelNum(-1), null);
  assert.equal(labelNum('n/a'), null);
  assert.equal(labelNum(null), null);
  assert.match(labelPrompt(), /PER 100 g/);
});

test('normalizeLabel: per 100 g, kJ only, sodium only, per serving, ranges, nothing read', () => {
  assert.deepEqual(normalizeLabel(LABEL), {
    name: 'Овесени ядки',
    kcal: 372,
    p: 13.5,
    f: 7,
    c: 58.7,
    fib: 10,
    salt: 0.01,
    basis: '100g',
  });
  const kj = normalizeLabel({ basis: '100ml', energy_kj: 1046, sodium: 0.4, protein: 3 });
  assert.equal(kj?.kcal, 250);
  assert.equal(kj?.salt, 1);
  // per serving of 30 g → per 100 g
  const s = normalizeLabel({ basis: 'serving', serving_g: 30, energy_kcal: 120, protein: 3, fat: 1.5, carbs: 22.5 });
  assert.deepEqual([s?.kcal, s?.p, s?.f, s?.c], [400, 10, 5, 75]);
  assert.equal(normalizeLabel({ basis: 'serving', energy_kcal: 120 }), null, 'serving without weight');
  // out of range dropped, not clamped
  const r = normalizeLabel({ basis: '100g', energy_kcal: 3700, protein: 130, fat: 5, carbs: 10 });
  assert.equal(r?.kcal, null);
  assert.equal(r?.p, null);
  assert.equal(r?.f, 5);
  assert.equal(normalizeLabel({ basis: null }), null);
  assert.equal(normalizeLabel({ basis: '100g', name: 'x' }), null);
  assert.equal(normalizeLabel('nope'), null);
  assert.equal(normalizeLabel({ ...LABEL, name: 'a'.repeat(200) })?.name?.length, MAX_LABEL_NAME);
});

test('/vision kind=label: Workers AI first, no `today` needed, label returned', async () => {
  const ai = fakeAi({ response: 'Here: ' + JSON.stringify(LABEL) });
  const x = fakeXai({ basis: null });
  const r = await call({ ai, fetch: x });
  assert.equal(r.status, 200);
  const j = await r.json();
  assert.equal(j.via, 'workers-ai');
  assert.deepEqual(j.days, []);
  assert.equal(j.label.kcal, 372);
  assert.equal(j.label.c, 58.7);
  assert.equal(x.calls.length, 0);
  assert.match(ai.calls[0].input.messages[0].content[0].text, /nutrition label/);
  assert.ok(!JSON.stringify(j).includes('base64'), 'the image is not echoed');
});

test('/vision kind=label: xAI fallback when Workers AI fails or reads nothing; unreadable → null', async () => {
  for (const ai of [fakeAi(null, true), fakeAi({ response: '{"basis": null}' })]) {
    const x = fakeXai(LABEL);
    const j = await (await call({ ai, fetch: x })).json();
    assert.equal(j.via, 'xai');
    assert.equal(j.label.p, 13.5);
    assert.equal(x.calls.length, 1);
  }
  const none = await (await call({ ai: fakeAi({ response: 'blurry' }), fetch: fakeXai({ basis: null }) })).json();
  assert.equal(none.label, null);
  // a bad kind is still refused; steps still need today
  assert.equal((await call({ q: '?kind=food' })).status, 400);
  assert.equal((await call({ q: '?kind=steps' })).status, 400);
});
