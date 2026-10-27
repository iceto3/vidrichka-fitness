/**
 * Public API of the "help improve the app" feature (1.3.4): anonymous food sharing,
 * the feedback sheet and sending feedback to the push Worker's /feedback.
 * @module features/improve/api
 */
import { getLang } from '../../core/i18n.js';
import { APP_VERSION } from '../../core/version.js';
import { pushUrl } from '../daily/push-config.js';
import { feedbackBody } from './logic.js';

export { shareFood } from './share.js';

/**
 * Send feedback (text and up to 3 prepared screenshots).
 * @param {string} text @param {{mime: string, b64: string}[]} images
 * @throws {Error} 'offline' | 'rate-limit' | 'server'
 */
export async function sendFeedback(text, images) {
  let r;
  try {
    r = await fetch(`${pushUrl()}/feedback`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify(feedbackBody(text, images, APP_VERSION, getLang())),
      credentials: 'omit',
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
  } catch {
    throw new Error('offline');
  }
  if (r.status === 429) throw new Error('rate-limit');
  if (!r.ok) throw new Error('server');
}

/** Open the feedback sheet (Profile only). */
export const openFeedback = async () => (await import('./views/feedback.js')).openFeedback();
