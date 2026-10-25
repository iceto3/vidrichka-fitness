/**
 * vidrichka-voice — turns a dictated/typed sentence into food and water diary entries
 * with xAI (Cloudflare Worker, stateless: no D1, no KV).
 *
 * HTTP API (CORS only for the app's origin and localhost):
 *   POST /parse  body (JSON, sent as text/plain to skip the preflight, ≤ 4 kB):
 *                {text, today: 'YYYY-MM-DD', time: 'HH:MM', tz, lang}
 *                → 200 {entries: [...], model} | 400/413 bad input | 403 origin | 429 limit | 502/503
 *   GET  /health → {ok, version, configured}
 * Privacy: the text is forwarded to xAI and never logged or stored here.
 * Cost guards: Origin check, text length cap, max_tokens cap, per-IP rate limit
 * (Workers Rate Limiting binding, plus a per-isolate fallback), one model call per request.
 * @module app
 */
import { chatBody } from './prompt.js';
import { Invalid, checkRequest, normalize } from './parse.js';

export const VERSION = '1.0.0';
export const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const MAX_BODY = 4096;

/**
 * @typedef {object} Env
 * @property {string} [XAI_API_KEY] Worker secret (never logged, never returned)
 * @property {string} [XAI_MODEL] @property {string} [ALLOWED_ORIGINS] comma-separated
 * @property {string} [ALLOW_LOCALHOST] "false" disables http://localhost origins
 * @property {string} [MAX_TEXT] @property {string} [MAX_TOKENS]
 * @property {{limit: (o: {key: string}) => Promise<{success: boolean}>}} [LIMITER] rate limiting binding
 */

const LOCAL = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** @param {Env} env @param {string|null} origin */
export function originAllowed(env, origin) {
  if (!origin) return false;
  const list = (env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim());
  return list.includes(origin) || (env.ALLOW_LOCALHOST !== 'false' && LOCAL.test(origin));
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

/** @param {number} status @param {any} body @param {Record<string, string>} [h] */
const reply = (status, body, h = {}) =>
  new Response(body == null ? null : JSON.stringify(body), {
    status,
    headers: { ...h, ...(body == null ? {} : { 'Content-Type': 'application/json' }), 'Cache-Control': 'no-store' },
  });

/**
 * Per-isolate fallback limiter (sliding minute): per IP and a global cap per isolate.
 * @param {number} perIp @param {number} global
 */
export function isolateLimiter(perIp = 8, global = 60) {
  /** @type {Map<string, number[]>} */
  const hits = new Map();
  /** @type {number[]} */
  let all = [];
  return (/** @type {string} */ key, now = Date.now()) => {
    const cut = now - 60_000;
    all = all.filter((t) => t > cut);
    const mine = (hits.get(key) ?? []).filter((t) => t > cut);
    if (mine.length >= perIp || all.length >= global) return false;
    mine.push(now);
    all.push(now);
    hits.set(key, mine);
    if (hits.size > 5000) hits.clear(); // bounded memory
    return true;
  };
}
const fallback = isolateLimiter();

/**
 * Handle one request.
 * @param {Request} req
 * @param {Env} env
 * @param {{fetch?: typeof fetch, limit?: (key: string) => boolean}} [deps] For tests.
 */
export async function handle(req, env, deps = {}) {
  const url = new URL(req.url),
    origin = req.headers.get('Origin');
  const ok = originAllowed(env, origin),
    h = cors(ok ? origin : null);
  if (req.method === 'OPTIONS') return reply(ok ? 204 : 403, null, h);
  if (url.pathname === '/health' && req.method === 'GET')
    return reply(200, { ok: true, version: VERSION, configured: !!env.XAI_API_KEY }, h);
  if (url.pathname !== '/parse') return reply(404, { error: 'not-found' }, h);
  if (req.method !== 'POST') return reply(405, { error: 'method' }, { ...h, Allow: 'POST' });
  if (!ok) return reply(403, { error: 'origin' }, h);
  if (!env.XAI_API_KEY) return reply(503, { error: 'not-configured' }, h);

  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const allowed = env.LIMITER
    ? (await env.LIMITER.limit({ key: ip }).catch(() => ({ success: true }))).success && (deps.limit ?? fallback)(ip)
    : (deps.limit ?? fallback)(ip);
  if (!allowed) return reply(429, { error: 'rate-limit' }, { ...h, 'Retry-After': '60' });

  let q;
  try {
    const raw = await req.text();
    if (raw.length > MAX_BODY) throw new Invalid('too-big', 413);
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      throw new Invalid('bad-json');
    }
    q = checkRequest(body, Number(env.MAX_TEXT) || 500);
  } catch (e) {
    if (e instanceof Invalid) return reply(e.status, { error: e.message }, h);
    throw e;
  }

  const model = env.XAI_MODEL || 'grok-4.20-0309-non-reasoning';
  const maxTokens = Math.min(Number(env.MAX_TOKENS) || 700, 1200);
  let res;
  try {
    res = await (deps.fetch ?? fetch)(XAI_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(chatBody(q, { model, maxTokens })),
      signal: AbortSignal.timeout(20_000),
    });
  } catch {
    console.log('xai', 'network'); // no user text, no key
    return reply(502, { error: 'upstream' }, h);
  }
  if (!res.ok) {
    console.log('xai', res.status);
    return reply(res.status === 429 ? 429 : 502, { error: res.status === 429 ? 'upstream-busy' : 'upstream' }, h);
  }
  try {
    const data = await res.json();
    const content = data?.choices?.[0]?.message?.content;
    const out = typeof content === 'string' ? JSON.parse(content) : content;
    const entries = normalize(out, q);
    const u = data?.usage ?? {};
    return reply(
      200,
      { entries, model: data?.model ?? model, usage: { in: u.prompt_tokens, out: u.completion_tokens } },
      h,
    );
  } catch {
    console.log('xai', 'bad-output');
    return reply(502, { error: 'bad-model-output' }, h);
  }
}
