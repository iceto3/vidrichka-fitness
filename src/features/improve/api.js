/**
 * Public API of the "help improve the app" feature (1.3.4): anonymous food sharing,
 * the feedback sheet and sending feedback to the push Worker's /feedback.
 * @module features/improve/api
 */
import { getLang } from '../../core/i18n.js';
import { APP_VERSION } from '../../core/version.js';
import { pushUrl } from '../daily/push-config.js';
import { dayKey } from '../../core/dates.js';
import { kv, setKv } from '../../core/store.js';
import { TURNSTILE_SITEKEY } from '../../core/channel.js';
import { fbCounted, fbLeft, feedbackBody } from './logic.js';

const FB_KEY = 'feedbackSent';

/** Feedback messages this phone may still send today (10 per day). */
export const feedbackLeft = () => fbLeft(kv(FB_KEY, null), dayKey());

export { shareFood } from './share.js';

/**
 * Send feedback (text and up to 3 prepared screenshots).
 * @param {string} text @param {{mime: string, b64: string}[]} images
 * @throws {Error} 'daily' (10 today already) | 'offline' | 'rate-limit' | 'turnstile' | 'server'
 */
export async function sendFeedback(text, images) {
  if (feedbackLeft() <= 0) throw new Error('daily');
  let token = '';
  if (TURNSTILE_SITEKEY) {
    token = await (await import('./turnstile.js')).turnstileToken(TURNSTILE_SITEKEY).catch(() => '');
    if (!token) throw new Error('turnstile');
  }
  let r;
  try {
    r = await fetch(`${pushUrl()}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(feedbackBody(text, images, APP_VERSION, getLang(), token)),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('offline');
  }
  if (r.status === 429) throw new Error('rate-limit');
  if (r.status === 403) throw new Error('turnstile');
  if (!r.ok) throw new Error('server');
  setKv(FB_KEY, fbCounted(kv(FB_KEY, null), dayKey()));
}

/** Open the feedback sheet (Profile only). */
export const openFeedback = async () => (await import('./views/feedback.js')).openFeedback();
