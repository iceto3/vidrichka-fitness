/**
 * POST /transcribe — Bulgarian (or English) speech → text with Workers AI Whisper
 * (`@cf/openai/whisper-large-v3-turbo`, free daily allocation). The audio is only held in
 * memory for this one request: it is never stored and never logged.
 * @module transcribe
 */
import { Invalid } from './parse.js';

export const STT_MODEL = '@cf/openai/whisper-large-v3-turbo';
/** Upload cap (bytes): 30 s at 32 kbps is ~120 kB, so 1 MB leaves room for any codec. */
export const MAX_AUDIO = 1024 * 1024;
/** Longest accepted recording (s); the app stops at 30 s. */
export const MAX_SECONDS = 35;

/** Base64 of bytes, in chunks (no spread over huge arrays). @param {Uint8Array} bytes */
export function toBase64(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

/**
 * Validate the upload: `audio/*` only, non-empty, at most {@link MAX_AUDIO}.
 * @param {Request} req
 * @returns {Promise<Uint8Array>}
 */
export async function readAudio(req) {
  const type = (req.headers.get('Content-Type') || '').toLowerCase();
  if (!type.startsWith('audio/')) throw new Invalid('not-audio', 415);
  const declared = Number(req.headers.get('Content-Length') || 0);
  if (declared > MAX_AUDIO) throw new Invalid('too-big', 413);
  const bytes = new Uint8Array(await req.arrayBuffer());
  if (bytes.length > MAX_AUDIO) throw new Invalid('too-big', 413);
  if (bytes.length < 200) throw new Invalid('no-audio');
  return bytes;
}

/**
 * Run Whisper. Throws Invalid('too-long', 413) past {@link MAX_SECONDS}.
 * @param {{run: (model: string, input: any) => Promise<any>}} ai Workers AI binding
 * @param {Uint8Array} bytes
 * @param {'bg'|'en'} lang
 * @returns {Promise<{text: string, duration: number}>}
 */
export async function transcribe(ai, bytes, lang) {
  const r = await ai.run(STT_MODEL, { audio: toBase64(bytes), language: lang, vad_filter: true, task: 'transcribe' });
  const duration = Math.round((Number(r?.transcription_info?.duration) || 0) * 10) / 10;
  if (duration > MAX_SECONDS) throw new Invalid('too-long', 413);
  const text = String(r?.text ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return { text, duration };
}
