/**
 * App version (injected by the build from package.json; the fallback is for dev/tests).
 * @module core/version
 */
export const APP_VERSION = /** @type {string} */ (/** @type {any} */ (globalThis).__APP_VERSION__ ?? '1.1.0');

/** Release whose "What's new" note is shown once (major.minor). */
export const WHATS_NEW = APP_VERSION.split('.').slice(0, 2).join('.');
