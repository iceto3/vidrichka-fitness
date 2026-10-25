/**
 * Public API of the voice feature: whether the voice server is reachable, parsing a
 * sentence into entries, and opening the "Say it" sheet.
 * Only the typed/dictated text plus the local date, time and time zone leave the phone.
 * @module features/voice/api
 */
import { emit } from '../../core/bus.js';
import { getLang } from '../../core/i18n.js';
import { voiceUrl } from './config.js';
import { requestBody } from './logic.js';

const state = { ok: false, busy: false };

/** True once the server answered /health with a configured key (else the buttons stay hidden). */
export const voiceReady = () => state.ok;

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
 * Open the "Say it" sheet.
 * @param {{meal?: string}} [o] Opened from Food › Add (meal) or Home.
 */
export const openVoice = async (o = {}) => (await import('./views/voice.js')).openVoice(o);
