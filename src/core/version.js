/**
 * App version (injected by the build from package.json; the fallback is for dev/tests).
 * @module core/version
 */
export const APP_VERSION = /** @type {string} */ (/** @type {any} */ (globalThis).__APP_VERSION__ ?? '1.3.1');

/**
 * Release whose "What's new" note is shown once. Since 1.2.1 the full version, so a patch
 * release can have its own note (1.2.0 stored "1.2").
 */
export const WHATS_NEW = APP_VERSION;
