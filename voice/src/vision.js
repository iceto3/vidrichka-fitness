/**
 * POST /vision?kind=steps|sleep&today=YYYY-MM-DD&lang=bg|en — read step counts (or sleep)
 * from a health-app screenshot (Apple Health, Google Fit, Samsung Health, a watch app).
 * 1.4.2: kind=label reads a food nutrition label instead (see ./label.js; `today` optional).
 * Body: the image (image/jpeg|png|webp, ≤ 600 kB; the app sends ≤ 1080 px JPEG).
 *
 * A free Workers AI vision model is tried first; if it fails or reads nothing, xAI (vision)
 * is the fallback. The image only lives in memory for this request: it is never stored,
 * never logged and never returned. Everything a model says is re-checked here (dates not
 * in the future and within 31 days, steps 0…100 000, sleep 0…16 h, quality 1–5).
 * @module vision
 */
import { Invalid } from './parse.js';
import { toBase64 } from './transcribe.js';
import { labelPrompt, normalizeLabel } from './label.js';

export const VISION_MODEL = '@cf/meta/llama-4-scout-17b-16e-instruct';
export const MAX_IMAGE = 600 * 1024;
export const MAX_DAYS = 14;
const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Days between two YYYY-MM-DD strings (b − a). @param {string} a @param {string} b */
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/**
 * Validate the request: kind, today, image type and size.
 * @param {Request} req
 * @returns {Promise<{kind: 'steps'|'sleep'|'label', today: string, lang: 'bg'|'en', mime: string, bytes: Uint8Array}>}
 */
export async function readVision(req) {
  const q = new URL(req.url).searchParams;
  const kind = q.get('kind');
  if (kind !== 'steps' && kind !== 'sleep' && kind !== 'label') throw new Invalid('bad-kind');
  const today = q.get('today') ?? '';
  if (kind !== 'label' && (!DAY.test(today) || Number.isNaN(Date.parse(today)))) throw new Invalid('bad-today');
  const mime = (req.headers.get('Content-Type') || '').toLowerCase().split(';')[0].trim();
  if (!TYPES.includes(mime)) throw new Invalid('not-image', 415);
  if (Number(req.headers.get('Content-Length') || 0) > MAX_IMAGE) throw new Invalid('too-big', 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_IMAGE) throw new Invalid('too-big', 413);
  if (bytes.length < 100) throw new Invalid('no-image');
  return { kind, today, lang: q.get('lang') === 'en' ? 'en' : 'bg', mime, bytes };
}

/** @param {'steps'|'sleep'} kind @param {string} today */
export function visionPrompt(kind, today) {
  const weekday = new Date(`${today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  const what =
    kind === 'steps'
      ? 'the STEP COUNT per day. Use {"date": "YYYY-MM-DD" or null, "steps": integer}. Ignore distance, calories, floors, minutes and goals.'
      : 'the SLEEP per night. Use {"date": "YYYY-MM-DD" or null, "hours": integer, "minutes": integer 0-59, "quality": 1-5 or null}. "date" is the MORNING the person woke up. Copy the duration exactly as shown: "7 h 20 min" is hours 7, minutes 20; "7.5 h" is hours 7, minutes 30. quality only if the app shows a score (map 0-100 to 1-5), else null.';
  return [
    `This is a screenshot from a phone health or fitness app. Today is ${weekday}, ${today}.`,
    `Read ${what}`,
    'If the screen shows one day, return one item; if it shows a week or several days with readable values, return one item per day (at most 14).',
    'Resolve labels like "Today", "Yesterday", "Днес", "Вчера", weekday names or "12 Oct" to dates in the past relative to today; use null if the date is unclear.',
    'If no value is readable, return {"days": []}. Never guess numbers.',
    'Answer with JSON only: {"days": [...]}',
  ].join('\n');
}

/** Extract the first JSON object from a model answer. @param {any} out */
export function parseAnswer(out) {
  if (out && typeof out === 'object' && !Array.isArray(out)) return out;
  const s = String(out ?? '');
  const a = s.indexOf('{'),
    b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try {
    return JSON.parse(s.slice(a, b + 1));
  } catch {
    return null;
  }
}

/**
 * Re-check a model's answer. Unknown/future/too-old dates become null (the app asks); one
 * item per date (the first wins); at most MAX_DAYS items.
 * @param {any} out @param {'steps'|'sleep'} kind @param {string} today
 * @returns {{date: string|null, steps?: number, hours?: number, quality?: number|null}[]}
 */
export function normalizeVision(out, kind, today) {
  const list = Array.isArray(out?.days) ? out.days : [];
  /** @type {any[]} */
  const res = [];
  const seen = new Set();
  for (const d of list) {
    if (!d || typeof d !== 'object') continue;
    let date = typeof d.date === 'string' && DAY.test(d.date) && !Number.isNaN(Date.parse(d.date)) ? d.date : null;
    if (date && (dayDiff(date, today) < 0 || dayDiff(date, today) > 31)) date = null;
    if (date && seen.has(date)) continue;
    if (kind === 'steps') {
      const n = Math.round(Number(String(d.steps ?? '').replace(/[\s,.\u00a0\u202f]/g, '')));
      if (!Number.isFinite(n) || n <= 0 || n > 100_000) continue;
      res.push({ date, steps: n });
    } else {
      // 1.4.0: hours + minutes (exact to the minute; "7 h 20 min" was rounded to 7.25 before).
      // A decimal "hours" alone is still accepted (older prompts / models).
      const m = d.minutes == null || d.minutes === '' ? 0 : Number(d.minutes);
      const h = Number(d.hours) + (Number.isFinite(m) && m >= 0 && m < 60 ? m : NaN) / 60;
      if (!Number.isFinite(h) || h <= 0 || h > 16) continue;
      const q = Number(d.quality);
      res.push({ date, hours: Math.round(h * 60) / 60, quality: q >= 1 && q <= 5 ? Math.round(q) : null });
    }
    if (date) seen.add(date);
    if (res.length >= MAX_DAYS) break;
  }
  return res;
}

/**
 * Ask Workers AI, then xAI. Returns the first non-empty, valid reading.
 * For kind=label the answer is `{label, days: [], via}` (label null = unreadable).
 * @param {{kind: 'steps'|'sleep'|'label', today: string, mime: string, bytes: Uint8Array}} q
 * @param {{AI?: {run: Function}, XAI_API_KEY?: string, XAI_VISION_MODEL?: string, XAI_MODEL?: string}} env
 * @param {typeof fetch} doFetch
 * @returns {Promise<{days: any[], via: string, label?: ReturnType<typeof normalizeLabel>}>}
 */
export async function readScreenshot(q, env, doFetch) {
  const url = `data:${q.mime};base64,${toBase64(q.bytes)}`,
    isLabel = q.kind === 'label',
    prompt = isLabel ? labelPrompt() : visionPrompt(/** @type {'steps'|'sleep'} */ (q.kind), q.today);
  /** @param {any} answer @param {string} via */
  const result = (answer, via) => {
    if (isLabel) return { label: normalizeLabel(parseAnswer(answer)), days: [], via };
    return { days: normalizeVision(parseAnswer(answer), /** @type {'steps'|'sleep'} */ (q.kind), q.today), via };
  };
  const found = (/** @type {{days: any[], label?: any}} */ r) => (isLabel ? !!r.label : r.days.length > 0);
  const messages = [
    {
      role: 'user',
      content: [
        { type: 'text', text: prompt },
        { type: 'image_url', image_url: { url } },
      ],
    },
  ];
  let failed = false;
  if (env.AI) {
    try {
      const r = await env.AI.run(VISION_MODEL, { messages, max_tokens: 600, temperature: 0 });
      const got = result(r?.response ?? r, 'workers-ai');
      if (found(got)) return got;
    } catch {
      failed = true;
      console.log('vision', 'workers-ai-failed'); // never the image
    }
  }
  if (!env.XAI_API_KEY) {
    if (failed) throw new Error('upstream');
    return isLabel ? { label: null, days: [], via: 'workers-ai' } : { days: [], via: 'workers-ai' };
  }
  const res = await doFetch('https://api.x.ai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.XAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: env.XAI_VISION_MODEL || env.XAI_MODEL || 'grok-4.20-0309-non-reasoning',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image_url', image_url: { url, detail: 'high' } },
            { type: 'text', text: prompt },
          ],
        },
      ],
      temperature: 0,
      max_tokens: 600,
      response_format: { type: 'json_object' },
    }),
    signal: AbortSignal.timeout(25_000),
  });
  if (!res.ok) {
    console.log('vision', 'xai', res.status);
    throw new Error(res.status === 429 ? 'upstream-busy' : 'upstream');
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return result(content, 'xai');
}
