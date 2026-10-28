/**
 * Where the voice server lives (the `vidrichka-voice` Cloudflare Worker).
 * @module features/voice/config
 */
import { SERVERS } from '../../core/channel.js';

/** The deployed voice Worker. Empty = not deployed: the "Say it" buttons stay hidden (also while /health is unreachable). */
export const VOICE_URL = SERVERS.voice; // 1.4.0: per release channel (core/channel.js)

/** Server URL; on localhost (tests, dev) `localStorage['vf-voice-url']` may point elsewhere. */
export function voiceUrl() {
  const local = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return ((local && localStorage.getItem('vf-voice-url')) || VOICE_URL).replace(/\/$/, '');
}
