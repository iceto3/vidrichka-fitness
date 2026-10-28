/**
 * Public API of the voice feature: whether the voice server is reachable, parsing a
 * sentence into entries, and opening the "Say it" sheet.
 * Only the typed/dictated text plus the local date, time and time zone leave the phone;
 * 1.3.3: a recording made in the app is sent once for transcription and never stored.
 * @module features/voice/api
 */
import { emit } from '../../core/bus.js';
import { getLang } from '../../core/i18n.js';
import { voiceUrl } from './config.js';
import { requestBody } from './logic.js';
import { kv, setKv } from '../../core/store.js';
import { dayKey } from '../../core/dates.js';
import { visionCounted, visionLeft } from './limit.js';

const state = { ok: false, busy: false, stt: false, label: false };

/** True once the server answered /health with a configured key (else the buttons stay hidden). */
export const voiceReady = () => state.ok;

/** True when the server can transcribe recordings (/health says `transcribe`). */
export const sttReady = () => state.ok && state.stt;

/** 1.4.2: the server reads food labels (/health says `label`). */
export const labelReady = () => state.label;

/** Ask the server whether it is up and configured; re-renders when that changes. */
export async function checkVoice() {
  const url = voiceUrl();
  let ok = false;
  if (url && !state.busy) {
    state.busy = true;
    try {
      const r = await fetch(`${url}/health`, { signal: AbortSignal.timeout(5000), cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      ok = !!(j?.ok && j.configured);
      state.stt = !!j?.transcribe;
      state.label = !!j?.label;
    } catch {
      ok = false;
    } finally {
      state.busy = false;
    }
  }
  if (ok !== state.ok) {
    state.ok = ok;
    emit('ui:refresh');
  }
  return ok;
}

/**
 * Turn a sentence into entries (nothing is saved here).
 * @param {string} text @param {Date} [now]
 * @returns {Promise<any[]>} Entries from the server.
 * @throws {Error} message = error code ('offline' | 'rate-limit' | 'too-long' | 'server').
 */
export async function parseText(text, now = new Date()) {
  let r;
  try {
    r = await fetch(`${voiceUrl()}/parse`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // a "simple" request: no CORS preflight
      body: JSON.stringify(requestBody(text, now, getLang())),
      signal: AbortSignal.timeout(25_000),
    });
  } catch {
    throw new Error('offline');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error('rate-limit');
  if (r.status === 413) throw new Error('too-long');
  if (!r.ok || !Array.isArray(j.entries)) throw new Error('server');
  return j.entries;
}

/**
 * Turn a recording into text (1.3.3, Workers AI Whisper on the voice server).
 * @param {Blob} audio
 * @returns {Promise<string>} The recognised text (may need fixing by the user).
 * @throws {Error} message = 'offline' | 'rate-limit' | 'no-audio' | 'stt'
 */
export async function transcribeAudio(audio) {
  if (!audio || audio.size < 200) throw new Error('no-audio');
  const type = /^audio\//.test(audio.type) ? audio.type.split(';')[0] : 'audio/mp4';
  let r;
  try {
    r = await fetch(`${voiceUrl()}/transcribe?lang=${getLang() === 'en' ? 'en' : 'bg'}`, {
      method: 'POST',
      headers: { 'Content-Type': type },
      body: audio,
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('offline');
  }
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error('rate-limit');
  if (r.status === 400 && j.error === 'no-audio') throw new Error('no-audio');
  if (!r.ok || typeof j.text !== 'string') throw new Error('stt');
  if (!j.text.trim()) throw new Error('no-audio');
  return j.text.trim();
}

/**
 * POST a picture to /vision once (1.4.2: shared by screenshots and labels). Counts toward
 * the per-phone daily limit (features/voice/limit) – checked before anything is sent.
 * @param {string} query @param {Blob} image
 * @throws {Error} 'offline' | 'limit' | 'rate-limit' | 'server'
 */
async function postVision(query, image) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('offline');
  const today = dayKey();
  if (!visionLeft(kv('visionDaily', null), today)) throw new Error('limit');
  let r;
  try {
    r = await fetch(`${voiceUrl()}/vision?${query}&lang=${getLang() === 'en' ? 'en' : 'bg'}`, {
      method: 'POST',
      headers: { 'Content-Type': image.type || 'image/jpeg' },
      body: image,
      signal: AbortSignal.timeout(40_000),
    });
  } catch {
    throw new Error('offline');
  }
  setKv('visionDaily', visionCounted(kv('visionDaily', null), today));
  const j = await r.json().catch(() => ({}));
  if (r.status === 429) throw new Error('rate-limit');
  if (!r.ok) throw new Error('server');
  return j;
}

/**
 * 1.4.0: read steps or sleep from a health-app screenshot (the voice server tries a free
 * Workers AI vision model, then xAI). The image is sent once and never stored.
 * @param {'steps'|'sleep'} kind @param {Blob} image JPEG ≤ 600 kB (see improve/images)
 * @param {string} today Day key the phone considers today.
 * @returns {Promise<{date: string|null, steps?: number, hours?: number, quality?: number|null}[]>}
 * @throws {Error} message = 'offline' | 'limit' | 'rate-limit' | 'server'
 */
export async function readScreenshot(kind, image, today) {
  const j = await postVision(`kind=${kind}&today=${today}`, image);
  if (!Array.isArray(j.days)) throw new Error('server');
  return j.days;
}

/**
 * 1.4.2: read a food's nutrition label (per 100 g; see voice/src/label.js). The photo is
 * sent once and never stored – not on the phone, not on the server.
 * @param {Blob} image JPEG ≤ 600 kB
 * @returns {Promise<any>} The label ({name, kcal, p, f, c, fib, salt}) or null when unreadable.
 * @throws {Error} message = 'offline' | 'limit' | 'rate-limit' | 'server'
 */
export async function readLabel(image) {
  const j = await postVision('kind=label', image);
  if (!('label' in j)) throw new Error('server');
  return j.label ?? null;
}

/**
 * Open the "Say it" sheet.
 * @param {{meal?: string}} [o] Opened from Food › Add (meal) or Home.
 */
export const openVoice = async (o = {}) => (await import('./views/voice.js')).openVoice(o);
