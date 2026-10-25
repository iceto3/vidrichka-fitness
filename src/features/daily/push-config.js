/**
 * Where the push server lives (tiny on purpose: main.js reads it for the "What's new" note).
 * @module features/daily/push-config
 */

/** The deployed push server (Cloudflare Worker). Empty = not deployed yet: push stays off and hidden. */
export const PUSH_URL = '';
/** VAPID public key (the private one is a Worker secret). */
export const VAPID_KEY = 'BO9JFEsnJLOmHpg2N_M9-ayXuGGZiPSJikbvjhPVEwtQjXtt3oLME6uWM3JBtmqywZrrrpB2QTC_v14cF-vqbuY';

/** Server URL; on localhost (tests) `localStorage['vf-push-url']` may point at a local server. */
export function pushUrl() {
  const local = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  return ((local && localStorage.getItem('vf-push-url')) || PUSH_URL).replace(/\/$/, '');
}
