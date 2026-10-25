/**
 * Worker entry: HTTP requests and the every-minute cron, both on the D1 store.
 * (Only handlers may be exported here; the logic lives in app.js.)
 * @module index
 */
import { handle, runCron } from './app.js';
import { d1Store } from './store.js';

export default {
  /** @param {Request} req @param {import('./app.js').Env} env */
  fetch: (req, env) => handle(req, env, d1Store(env.DB)),
  /** @param {ScheduledController} ctl @param {import('./app.js').Env} env @param {ExecutionContext} ctx */
  scheduled(ctl, env, ctx) {
    ctx.waitUntil(
      runCron(env, d1Store(env.DB), ctl.scheduledTime).then(
        (s) => (s.due || s.failed) && console.log('cron', JSON.stringify(s)),
      ),
    );
  },
};
