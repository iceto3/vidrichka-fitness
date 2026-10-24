/**
 * End-to-end smoke test (Playwright, no test runner needed).
 *
 * Runs the main user flows on two emulated phones:
 *   - "android": Chromium, 412x915 (Pixel-class Android Chrome)
 *   - "iphone":  WebKit, iPhone 14 profile (iOS Safari engine)
 * Flows: onboarding → workout (steppers, Done locks set, rest timer, skip, finish) → summary;
 * food via category → grams sheet → second item → "save as regular meal?" prompt;
 * a body measurement; Bulgarian language; dark theme; backup export; offline reload (Chromium).
 *
 * Usage: node tests/e2e/smoke.mjs [--dir dist] [--only android|iphone] [--shots]
 *   --shots writes screenshots to ./screenshots (android: <name>.png, iphone: iphone-<name>.png).
 * Exits non-zero on the first failed assertion or any page error.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIR = opt('--dir', '.');
const ONLY = opt('--only', '');
const SHOTS = args.includes('--shots');
const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://localhost:${PORT}/`;
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));

const server = spawn(process.execPath, ['tools/serve.mjs', String(PORT), DIR], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 400));
if (SHOTS) mkdirSync('screenshots', { recursive: true });

const PROFILES = {
  android: {
    type: chromium,
    launch: CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : {},
    ctx: {
      viewport: { width: 412, height: 915 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      userAgent: devices['Pixel 7'].userAgent,
    },
    prefix: '',
  },
  iphone: { type: webkit, launch: {}, ctx: { ...devices['iPhone 14'] }, prefix: 'iphone-' },
};

let failed = false;
for (const [name, P] of Object.entries(PROFILES)) {
  if (ONLY && ONLY !== name) continue;
  const t0 = Date.now();
  const browser = await P.type.launch(P.launch);
  try {
    await run(name, browser, P);
    console.log(`✔ ${name} flows passed (${((Date.now() - t0) / 1000).toFixed(1)} s)`);
  } catch (e) {
    failed = true;
    console.error(`✘ ${name}:`, e);
  } finally {
    await browser.close();
  }
}
server.kill();
process.exit(failed ? 1 : 0);

/**
 * @param {string} name
 * @param {import('playwright-core').Browser} browser
 * @param {any} P
 */
async function run(name, browser, P) {
  const ctx = await browser.newContext({
    ...P.ctx,
    acceptDownloads: true,
    locale: 'en-GB',
    timezoneId: 'Europe/Sofia',
    serviceWorkers: name === 'android' ? 'allow' : 'block',
  });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) &&
      errors.push(m.text()),
  );
  const shot = async (/** @type {string} */ n, full = false) => {
    if (!SHOTS) return;
    await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
    await page.screenshot({ path: `screenshots/${P.prefix}${n}.png`, fullPage: full });
  };
  const go = async (/** @type {string} */ r) => {
    await page.evaluate((r) => (location.hash = '#/' + r), r);
    await page.waitForTimeout(350);
  };
  const layer = page.locator('#layer');
  const settle = () => page.waitForTimeout(350);

  // Onboarding
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Vidrichka/ }).waitFor();
  await layer.locator('input').first().fill('Maria');
  await page.getByRole('button', { name: "Let's go" }).click();
  await settle();
  assert.match(await page.locator('h1').first().innerText(), /Maria/);

  // Workout → summary
  await page.locator('.wcard [data-act="start"]').click();
  await page.locator('.wtop').waitFor();
  const firstActive = page.locator('.set.active').first();
  await firstActive.locator('[data-d="1"]').last().click(); // +1 rep
  await page.locator('.done-b.go').click();
  assert.equal(await page.locator('.set.done').count(), 1, 'Done locks the set');
  assert.ok(await page.locator('.set.done input').first().isDisabled(), 'locked set inputs are disabled');
  await page.locator('.restbar').waitFor();
  await page.locator('.restbar [data-act="more"]').click();
  await page.locator('.restbar [data-act="skip"]').click();
  await page.locator('.restbar').waitFor({ state: 'detached' });
  await page.locator('.done-b.go').click();
  await page.waitForTimeout(1200);
  await shot('workout');
  await page.locator('.restbar [data-act="skip"]').click();
  await page.locator('.done-b.go').click();
  await page.locator('.restbar [data-act="skip"]').click();
  assert.equal(await page.locator('.set.done').count(), 3);
  await page.locator('.wtop [data-act="finish"]').click();
  await layer.getByRole('button', { name: /^Finish$/ }).click(); // confirm: remaining sets stay unfinished
  await page.locator('.summary').waitFor();
  assert.match(await page.locator('.summary .grid3').innerText(), /3\s*of/i);
  await page.waitForTimeout(2600);
  await shot('summary');
  await page.locator('.summary [data-go="home"]').last().click();
  await settle();

  // Food: category → grams → second item → save-meal prompt
  await go('food');
  await go('food/add/breakfast');
  await page.locator('.cat').first().click();
  await layer.locator('[data-act="pick"]').first().click();
  await layer.locator('#grams').waitFor();
  await layer.locator('[data-act="g"][data-d="1"]').click();
  await layer.locator('[data-act="g"][data-d="1"]').click();
  await settle();
  await shot('food-add');
  await layer.locator('[data-act="done"]').click();
  await settle();
  await page.locator('.cat').nth(1).click();
  await layer.locator('[data-act="pick"]').first().click();
  await layer.locator('[data-act="done"]').click();
  await settle();
  assert.equal(await page.locator('.basket .chip').count(), 2, 'two items in the meal basket');
  await page.locator('.topbar .btn[data-act="finish"]').click();
  await layer
    .getByText(/regular meal/i)
    .first()
    .waitFor();
  await page.waitForTimeout(600);
  await shot('food-save');
  await layer.locator('[data-act="save"]').click();
  await page.locator('.food').waitFor();
  await settle();
  assert.match(await page.locator('.meals').innerText(), /Breakfast/);
  await shot('food');

  // Body measurement
  await go('progress/body');
  await page.locator('[data-act="add"]').click();
  await layer.locator('#m_weight').fill('61.2');
  await layer.locator('#m_waist').fill('68');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await page.locator('.weightcard').innerText(), /61[.,]2/);
  await shot('body');
  await go('progress/lifts');
  await shot('progress');

  // Backup export
  await go('profile');
  await shot('profile');
  const dl = page.waitForEvent('download', { timeout: 8000 });
  await page.locator('[data-act="export"]').click();
  const file = await dl;
  assert.match(file.suggestedFilename(), /^vidrichka-backup-.*\.json$/);
  const json = JSON.parse(await (await import('node:fs/promises')).readFile(await file.path(), 'utf8'));
  assert.ok(
    json.app && json.version && json.stores?.sessions?.length === 1 && json.stores.measurements.length === 1,
    'backup contains the session and measurement',
  );

  // Home (EN), Bulgarian, dark
  await go('home');
  await page.evaluate(() => scrollTo(0, 0));
  await shot('home');
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await go('home');
  assert.match(await page.locator('#nav').innerText(), /Начало/);
  await shot('home-BG');
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await page.locator('[data-act="theme"][data-v="dark"]').click();
  await settle();
  assert.ok(await page.evaluate(() => document.documentElement.classList.contains('dark')));
  await go('home');
  await shot('home-dark');
  await page
    .locator('[data-act="theme"][data-v="light"]')
    .click()
    .catch(() => {});

  // Offline (Chromium: service worker)
  if (name === 'android') {
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await page.reload();
    await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 8000 });
    await page.waitForTimeout(800);
    await ctx.setOffline(true);
    await page.reload();
    await page.locator('#nav .t').first().waitFor({ timeout: 8000 });
    assert.match(await page.locator('h1').first().innerText(), /Maria/, 'app loads offline with data');
    await go('food');
    await page.locator('.food').waitFor();
    await ctx.setOffline(false);
    console.log('  ✔ offline reload works');
  }

  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}
