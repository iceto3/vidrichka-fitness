/**
 * 1.3.4 anonymous food sharing: after a MANUALLY entered food is saved, its name and
 * per-100 g values (see logic.foodPayload) go to the push Worker's /foods. On by default,
 * off in Profile ("Помогни да подобрим приложението"); no cookies, no ids, fails silently.
 * @module features/improve/share
 */
import { settings } from '../../core/settings.js';
import { getLang } from '../../core/i18n.js';
import { pushUrl } from '../daily/push-config.js';
import { foodPayload } from './logic.js';

/**
 * Send a manually entered food (fire and forget).
 * @param {{name: string, kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} food
 * @returns {boolean} true if a request was started.
 */
export function shareFood(food) {
  if (!settings().shareFoods) return false;
  const body = foodPayload(food, getLang());
  const url = pushUrl();
  if (!body || !url || (typeof navigator !== 'undefined' && navigator.onLine === false)) return false;
  try {
    fetch(`${url}/foods`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' }, // a "simple" request: no preflight
      body: JSON.stringify(body),
      credentials: 'omit',
      keepalive: true,
      cache: 'no-store',
    }).catch(() => {});
  } catch {
    return false;
  }
  return true;
}
