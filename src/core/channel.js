/**
 * Release channel (1.4.0): `live` (the public app) or `beta` (a test build at its own URL).
 * The build injects `globalThis.__APP_CHANNEL__` (`npm run build -- --beta`); dev and tests
 * default to `live`. Everything a beta must keep apart from the live app is derived here,
 * so a beta can never read or overwrite live users' data, caches or servers:
 *   - IndexedDB name, localStorage keys and Cache Storage names get their own prefix,
 *   - the voice and push servers point at the separate `-beta` Workers,
 *   - the UI shows a "БЕТА" marker.
 * Extension point: add any new per-channel value to CHANNELS (both entries).
 * @module core/channel
 */

/** @typedef {'live'|'beta'} Channel */

const CHANNELS = /** @type {const} */ ({
  live: {
    db: 'vidrichka-fitness',
    prefix: 'vf-',
    voice: 'https://vidrichka-voice.vidrichka.workers.dev',
    push: 'https://vidrichka-push.vidrichka.workers.dev',
  },
  beta: {
    db: 'vidrichka-fitness-beta',
    prefix: 'vfb-',
    voice: 'https://vidrichka-voice-beta.vidrichka.workers.dev',
    push: 'https://vidrichka-push-beta.vidrichka.workers.dev',
  },
});

/** @type {Channel} */
export const CHANNEL = /** @type {any} */ (globalThis).__APP_CHANNEL__ === 'beta' ? 'beta' : 'live';
export const IS_BETA = CHANNEL === 'beta';
const cfg = CHANNELS[CHANNEL];

/** IndexedDB database name of this channel. */
export const DB_NAME = cfg.db;
/** Prefix of every localStorage key and Cache Storage name of this channel. */
export const PREFIX = cfg.prefix;
/** Default server URLs of this channel. */
export const SERVERS = { voice: cfg.voice, push: cfg.push };

/** A localStorage key namespaced to this channel. @param {string} name e.g. `theme` */
export const lsKey = (name) => `${PREFIX}${name}`;
