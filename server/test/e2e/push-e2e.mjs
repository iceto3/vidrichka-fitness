// End-to-end Web Push check: the real app (dist) in headless Chrome turns reminders on
// through Profile › Reminders, the worker schedules a water reminder ~2 min ahead in
// Europe/Sofia, the cron sends it through the real push service (FCM), the app's service
// worker shows it, and "Turn off" deletes the test device on the server.
//
//   node test/e2e/push-e2e.mjs [--worker http://localhost:8787] [--dir ../dist] [--no-trigger]
//
// With a local `wrangler dev --test-scheduled` worker the cron is triggered through
// /__scheduled; against a deployed worker (--no-trigger) the real cron runs every minute.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import assert from 'node:assert/strict';

const args = process.argv.slice(2);
const opt = (/** @type {string} */ k, /** @type {string} */ d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const WORKER = opt('--worker', 'http://localhost:8787').replace(/\/$/, '');
const ROOT = resolve(import.meta.dirname, '../../..');
const DIR = resolve(ROOT, opt('--dir', 'dist'));
const TRIGGER = !args.includes('--no-trigger');
const PORT = 8840 + Math.floor(Math.random() * 100);
const APP = `http://localhost:${PORT}/`;
const TZ = 'Europe/Sofia';
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const { chromium } = await import(join(ROOT, 'node_modules/playwright-core/index.mjs'));

const log = (/** @type {string} */ m) =>
  console.log(`[${new Date().toLocaleTimeString('en-GB', { timeZone: TZ })} Sofia] ${m}`);
const hm = (/** @type {number} */ ts) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(ts);
const post = (/** @type {string} */ path, /** @type {object} */ body) =>
  fetch(WORKER + path, { method: 'POST', headers: { Origin: `http://localhost:${PORT}` }, body: JSON.stringify(body) });
const cron = async () => {
  if (TRIGGER) await fetch(`${WORKER}/__scheduled?cron=*+*+*+*+*`).catch(() => {});
};

assert.ok(existsSync(join(DIR, 'index.html')), `build the app first (${DIR})`);
const health = await (await fetch(`${WORKER}/health`)).json();
assert.ok(health.ok && health.db && health.vapid, `worker health: ${JSON.stringify(health)}`);
log(`worker ${WORKER} healthy`);

const server = spawn(process.execPath, [join(ROOT, 'tools/serve.mjs'), String(PORT), DIR], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 500));
const profile = mkdtempSync(join(tmpdir(), 'vf-push-'));
const ctx = await chromium.launchPersistentContext(profile, {
  executablePath: CHROME,
  headless: true,
  args: ['--no-sandbox'],
  timezoneId: TZ,
  locale: 'en-GB',
  viewport: { width: 412, height: 915 },
});
let id = '';
let ok = false;
try {
  await ctx.grantPermissions(['notifications'], { origin: APP.slice(0, -1) });
  await ctx.addInitScript((w) => localStorage.setItem('vf-push-url', w), WORKER);
  const page = await ctx.newPage();
  /** @type {any} */
  let reg = null;
  page.on('request', (r) => {
    if (r.url() === `${WORKER}/subscribe`) reg = JSON.parse(r.postData() ?? '{}');
  });

  await page.goto(APP);
  await page.getByRole('heading', { name: /Vidrichka/ }).waitFor();
  await page.locator('#layer input').first().fill('E2E');
  await page.getByRole('button', { name: "Let's go" }).click();
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.evaluate(() => (location.hash = '#/profile/reminders'));
  await page.locator('[data-act="push"]').click();
  await page.locator('.pushstate.on').waitFor({ timeout: 20000 });
  assert.ok(reg?.id, 'the app registered with the worker');
  id = reg.id;
  log(`subscribed through the UI: device ${id.slice(0, 6)}…, endpoint ${new URL(reg.subscription.endpoint).host}`);

  // One water reminder ~2 min ahead, everything else off (so nothing else is due now).
  const due = Date.now() + 2 * 60_000 + 30_000; // the reminder fires at the start of that minute
  const time = hm(due);
  const settings = {
    ...reg.settings,
    morning: false,
    protein: false,
    water: [{ time, on: true }, ...reg.settings.water.slice(1).map((/** @type {any} */ w) => ({ ...w, on: false }))],
    checkinAm: { ...reg.settings.checkinAm, on: false },
    checkinPm: { ...reg.settings.checkinPm, on: false },
    bedtime: { ...reg.settings.bedtime, on: false },
  };
  assert.equal((await post('/settings', { id, tz: TZ, settings })).status, 204);
  log(`water reminder scheduled for ${time} (Europe/Sofia)`);

  const shown = () =>
    page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      return (await r.getNotifications()).map((n) => ({ tag: n.tag, title: n.title, body: n.body, data: n.data }));
    });
  /** @type {any} */
  let got = null;
  for (let i = 0; i < 60 && !got; i++) {
    await cron();
    await page.waitForTimeout(5000);
    const n = (await shown()).find((x) => x.tag === 'vf-water');
    if (n) {
      got = n;
      const at = hm(Date.now());
      assert.ok(at >= time, `not sent before its time (${at} < ${time})`);
    }
  }
  assert.ok(got, 'the pushed reminder was shown by the service worker');
  log(`push received and shown by the SW: "${got.title}" – ${got.body} (route ${got.data?.route ?? '?'})`);

  // Turn off → the server forgets the device.
  await page.evaluate(() => (location.hash = '#/profile/reminders'));
  await page.locator('[data-act="push"]').click();
  await page.locator('.pushstate:not(.on)').waitFor({ timeout: 20000 });
  assert.equal((await post('/settings', { id, tz: TZ })).status, 404, 'test device deleted');
  log('turned off in the UI: test device deleted on the server (404)');
  id = '';
  ok = true;
} finally {
  if (id) await post('/unsubscribe', { id }).catch(() => {});
  await ctx.close();
  server.kill();
  rmSync(profile, { recursive: true, force: true });
}
console.log(ok ? '✔ push e2e passed' : '✘ push e2e failed');
process.exit(ok ? 0 : 1);
