/**
 * vidrichka-voice — turns a dictated/typed sentence into food and water diary entries
 * with xAI (Cloudflare Worker, stateless: no D1, no KV).
 *
 * HTTP API (CORS only for the app's origin and localhost):
 *   POST /parse  body (JSON, sent as text/plain to skip the preflight, ≤ 4 kB):
 *                {text, today: 'YYYY-MM-DD', time: 'HH:MM', tz, lang}
 *                → 200 {entries: [...], model} | 400/413 bad input | 403 origin | 429 limit | 502/503
 *   POST /transcribe?lang=bg|en  body: the recorded audio (Content-Type audio/*, ≤ 1 MB, ≤ 35 s)
 *                → 200 {text, duration} | 413/415/400 bad input | 403 origin | 429 limit | 502/503
 *                (Workers AI Whisper, 6 per minute per IP)
 *   POST /vision?kind=steps|sleep&today=YYYY-MM-DD&lang=bg|en  body: a screenshot (image/jpeg|png|webp,
 *                ≤ 600 kB) → 200 {days: [{date, steps} | {date, hours, quality}], via}
 *                (1.4.0: Workers AI vision first, xAI fallback; 4 per minute per IP; never stored)
 *   GET  /off-search?q=…&lang=bg|en → 200 {products: [...]} (1.4.0: Open Food Facts text search
 *                proxied for the app – OFF's search has no usable CORS; cached, 20 per minute per IP)
 *   GET  /health → {ok, version, configured, transcribe, vision, offSearch}
 * Privacy: the text is forwarded to xAI and never logged or stored here; audio is only
 * transcribed in memory by Workers AI and never stored or logged.
 * Cost guards: Origin check, text length cap, max_tokens cap, per-IP rate limit
 * (Workers Rate Limiting binding, plus a per-isolate fallback), one model call per request.
 * @module app
 */
import { chatBody } from './prompt.js';
import { Invalid, checkRequest, normalize } from './parse.js';
import { readAudio, transcribe } from './transcribe.js';
import { readScreenshot, readVision } from './vision.js';
import { CACHE_TTL, cacheKey, memo, offSearch, readQuery } from './off.js';

export const VERSION = '1.4.0';
export const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const MAX_BODY = 4096;

/**
 * @typedef {object} Env
 * @property {string} [XAI_API_KEY] Worker secret (never logged, never returned)
 * @property {string} [XAI_MODEL] @property {string} [ALLOWED_ORIGINS] comma-separated
 * @property {string} [ALLOW_LOCALHOST] "false" disables http://localhost origins
 * @property {string} [MAX_TEXT] @property {string} [MAX_TOKENS]
 * @property {{limit: (o: {key: string}) => Promise<{success: boolean}>}} [LIMITER] rate limiting binding
 * @property {{limit: (o: {key: string}) => Promise<{success: boolean}>}} [STT_LIMITER] for /transcribe
 * @property {{limit: (o: {key: string}) => Promise<{success: boolean}>}} [VISION_LIMITER] for /vision
 * @property {{limit: (o: {key: string}) => Promise<{success: boolean}>}} [OFF_LIMITER] for /off-search
 * @property {string} [XAI_VISION_MODEL] xAI model for /vision (default: XAI_MODEL)
 * @property {{run: (model: string, input: any) => Promise<any>}} [AI] Workers AI binding (Whisper, vision)
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
const sttFallback = isolateLimiter(6, 60);
const visionFallback = isolateLimiter(4, 30);
const offFallback = isolateLimiter(20, 120);
const offMemo = memo();

/**
 * GET /off-search (origin already checked): edge cache → isolate memo → OFF.
 * @param {Request} req @param {Env} env @param {Record<string, string>} h
 * @param {{fetch?: typeof fetch, offLimit?: (key: string) => boolean, cache?: Cache|null, memo?: ReturnType<typeof memo>}} deps
 */
async function handleOffSearch(req, env, h, deps) {
  const url = new URL(req.url);
  let s;
  try {
    s = readQuery(url);
  } catch (e) {
    if (e instanceof Invalid) return reply(e.status, { error: e.message }, h);
    throw e;
  }
  const ok = (/** @type {string} */ body, /** @type {string} */ hit) =>
    new Response(body, {
      status: 200,
      headers: {
        ...h,
        'Content-Type': 'application/json',
        'Cache-Control': `public, max-age=${CACHE_TTL}`,
        'X-Cache': hit,
      },
    });
  const key = cacheKey(url.origin, s),
    mk = key.url;
  const cache =
    deps.cache !== undefined ? deps.cache : typeof caches !== 'undefined' ? /** @type {any} */ (caches).default : null;
  const mem = deps.memo ?? offMemo;
  const seen = mem.get(mk);
  if (seen) return ok(seen, 'memo');
  const hit = cache ? await cache.match(key).catch(() => null) : null;
  if (hit) {
    const body = await hit.text();
    mem.set(mk, body);
    return ok(body, 'edge');
  }
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const lim = deps.offLimit ?? offFallback;
  const allowed = env.OFF_LIMITER
    ? (await env.OFF_LIMITER.limit({ key: ip }).catch(() => ({ success: true }))).success && lim(ip)
    : lim(ip);
  if (!allowed) return reply(429, { error: 'rate-limit' }, { ...h, 'Retry-After': '60' });
  let products;
  try {
    products = await offSearch(s, deps.fetch ?? fetch);
  } catch (e) {
    const busy = /** @type {Error} */ (e).message === 'upstream-busy';
    console.log('off', busy ? 'busy' : 'upstream'); // never the query
    return reply(busy ? 429 : 502, { error: busy ? 'upstream-busy' : 'upstream' }, h);
  }
  const body = JSON.stringify({ products });
  mem.set(mk, body);
  if (cache)
    await cache
      .put(
        key,
        new Response(body, {
          headers: { 'Content-Type': 'application/json', 'Cache-Control': `public, max-age=${CACHE_TTL}` },
        }),
      )
      .catch(() => {});
  return ok(body, 'miss');
}

/**
 * POST /vision (origin already checked). The image is read, sent to the model(s) and
 * dropped; only the re-checked numbers are returned.
 * @param {Request} req @param {Env} env @param {Record<string, string>} h
 * @param {{fetch?: typeof fetch, visionLimit?: (key: string) => boolean}} deps
 */
async function handleVision(req, env, h, deps) {
  if (!env.AI && !env.XAI_API_KEY) return reply(503, { error: 'not-configured' }, h);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const lim = deps.visionLimit ?? visionFallback;
  const allowed = env.VISION_LIMITER
    ? (await env.VISION_LIMITER.limit({ key: ip }).catch(() => ({ success: true }))).success && lim(ip)
    : lim(ip);
  if (!allowed) return reply(429, { error: 'rate-limit' }, { ...h, 'Retry-After': '60' });
  let q;
  try {
    q = await readVision(req);
  } catch (e) {
    if (e instanceof Invalid) return reply(e.status, { error: e.message }, h);
    throw e;
  }
  try {
    return reply(200, await readScreenshot(q, env, deps.fetch ?? fetch), h);
  } catch (e) {
    const busy = /** @type {Error} */ (e).message === 'upstream-busy';
    return reply(busy ? 429 : 502, { error: busy ? 'upstream-busy' : 'upstream' }, h);
  }
}

/**
 * POST /transcribe (origin already checked).
 * @param {Request} req @param {Env} env @param {Record<string, string>} h
 * @param {{limit?: (key: string) => boolean, sttLimit?: (key: string) => boolean}} deps
 */
async function handleTranscribe(req, env, h, deps) {
  if (!env.AI) return reply(503, { error: 'not-configured' }, h);
  const ip = req.headers.get('CF-Connecting-IP') || 'unknown';
  const lim = deps.sttLimit ?? sttFallback;
  const allowed = env.STT_LIMITER
    ? (await env.STT_LIMITER.limit({ key: ip }).catch(() => ({ success: true }))).success && lim(ip)
    : lim(ip);
  if (!allowed) return reply(429, { error: 'rate-limit' }, { ...h, 'Retry-After': '60' });
  const lang = new URL(req.url).searchParams.get('lang') === 'en' ? 'en' : 'bg';
  try {
    const bytes = await readAudio(req);
    let out;
    try {
      out = await transcribe(env.AI, bytes, lang);
    } catch (e) {
      if (e instanceof Invalid) throw e;
      console.log('stt', 'upstream'); // never the audio or the text
      return reply(502, { error: 'upstream' }, h);
    }
    return reply(200, out, h);
  } catch (e) {
    if (e instanceof Invalid) return reply(e.status, { error: e.message }, h);
    throw e;
  }
}

/**
 * Handle one request.
 * @param {Request} req
 * @param {Env} env
 * @param {{fetch?: typeof fetch, limit?: (key: string) => boolean, sttLimit?: (key: string) => boolean, visionLimit?: (key: string) => boolean, offLimit?: (key: string) => boolean, cache?: Cache|null, memo?: ReturnType<typeof memo>}} [deps] For tests.
 */
export async function handle(req, env, deps = {}) {
  const url = new URL(req.url),
    origin = req.headers.get('Origin');
  const ok = originAllowed(env, origin),
    h = cors(ok ? origin : null);
  if (req.method === 'OPTIONS') return reply(ok ? 204 : 403, null, h);
  if (url.pathname === '/health' && req.method === 'GET')
    return reply(
      200,
      {
        ok: true,
        version: VERSION,
        configured: !!env.XAI_API_KEY,
        transcribe: !!env.AI,
        vision: !!(env.AI || env.XAI_API_KEY),
        offSearch: true,
      },
      h,
    );
  if (url.pathname === '/off-search') {
    if (req.method !== 'GET') return reply(405, { error: 'method' }, { ...h, Allow: 'GET' });
    if (!ok) return reply(403, { error: 'origin' }, h);
    return handleOffSearch(req, env, h, deps);
  }
  if (!['/parse', '/transcribe', '/vision'].includes(url.pathname)) return reply(404, { error: 'not-found' }, h);
  if (req.method !== 'POST') return reply(405, { error: 'method' }, { ...h, Allow: 'POST' });
  if (!ok) return reply(403, { error: 'origin' }, h);
  if (url.pathname === '/transcribe') return handleTranscribe(req, env, h, deps);
  if (url.pathname === '/vision') return handleVision(req, env, h, deps);
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
