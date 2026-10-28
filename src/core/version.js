/**
 * App version (injected by the build from package.json; the fallback is for dev/tests).
 * @module core/version
 */
export const APP_VERSION = /** @type {string} */ (/** @type {any} */ (globalThis).__APP_VERSION__ ?? '1.4.1');

/**
 * 1.4.1: the full build id the build writes into index.html (`<meta name="vf-build">`, e.g.
 * 1.4.1-beta-<hash>), shown in the Profile footer and in What's new; the app version in dev/tests.
 * @returns {string}
 */
export function buildId() {
  if (typeof document === 'undefined') return APP_VERSION;
  return document.querySelector('meta[name="vf-build"]')?.getAttribute('content') || APP_VERSION;
}

/**
 * Release whose "What's new" note is shown once. Since 1.2.1 the full version, so a patch
 * release can have its own note (1.2.0 stored "1.2").
 */
export const WHATS_NEW = APP_VERSION;
