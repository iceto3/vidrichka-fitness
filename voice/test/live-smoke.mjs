// Live smoke test against xAI through the Worker's own handler (run from a box/laptop with
// XAI_API_KEY in the environment; the key is never printed). One cheap call per sentence.
//   XAI_API_KEY=… node test/live-smoke.mjs
import assert from 'node:assert/strict';
import { handle } from '../src/app.js';
import { SYSTEM } from '../src/prompt.js';

if (!process.env.XAI_API_KEY) {
  console.log('skip: XAI_API_KEY not set');
  process.exit(0);
}
const env = { XAI_API_KEY: process.env.XAI_API_KEY, ALLOWED_ORIGINS: 'https://iceto3.github.io' };
// Prices in USD per 1M tokens (from GET /v1/language-models for the default model).
const PRICE_IN = Number(process.env.PRICE_IN ?? 1.25),
  PRICE_OUT = Number(process.env.PRICE_OUT ?? 2.5);

const cases = [
  { lang: 'bg', text: 'изядох купа овесени ядки с банан и изпих две чаши вода' },
  { lang: 'en', text: 'yesterday evening I had two eggs and a slice of toast, and a glass of water' },
];
let cost = 0;
for (const c of cases) {
  const t0 = Date.now();
  const res = await handle(
    new Request('https://voice.example/parse', {
      method: 'POST',
      headers: { Origin: 'https://iceto3.github.io', 'Content-Type': 'text/plain' },
      body: JSON.stringify({ text: c.text, today: '2026-10-25', time: '13:05', tz: 'Europe/Sofia', lang: c.lang }),
    }),
    env,
    { limit: () => true },
  );
  const body = await res.json();
  assert.equal(res.status, 200, JSON.stringify(body));
  assert.ok(
    body.entries.some((e) => e.type === 'food'),
    'has food',
  );
  assert.ok(
    body.entries.some((e) => e.type === 'water'),
    'has water',
  );
  const usd = ((body.usage.in ?? 0) * PRICE_IN + (body.usage.out ?? 0) * PRICE_OUT) / 1e6;
  cost += usd;
  console.log(
    `\n[${c.lang}] ${c.text}\nmodel ${body.model} · ${Date.now() - t0} ms · tokens in ${body.usage.in} / out ${body.usage.out} · ≈ $${usd.toFixed(5)}`,
  );
  for (const e of body.entries) console.log('  ', JSON.stringify(e));
}
console.log(`\nsystem prompt ${SYSTEM.length} chars · total ≈ $${cost.toFixed(5)} for ${cases.length} calls`);
