/**
 * Worker entry (only handlers may be exported here; the logic lives in app.js).
 * @module index
 */
import { handle } from './app.js';

export default {
  /** @param {Request} req @param {import('./app.js').Env} env */
  fetch: (req, env) => handle(req, env),
};
