/**
 * End-to-end smoke test (Playwright, no test runner needed).
 *
 * Runs the main user flows on two emulated phones:
 *   - "android": Chromium, 412x915 (Pixel-class Android Chrome)
 *   - "iphone":  WebKit, iPhone 14 profile (iOS Safari engine)
 * Flows: onboarding → workout (steppers, Done locks set, rest timer, skip, finish) → summary;
 * food via category → grams sheet → second item → "save as regular meal?" prompt;
 * a body measurement; Bulgarian language; dark theme; backup export; offline reload (Chromium).
 * 1.1: + buttons update in place (same DOM nodes, sheet animation not restarted, scroll kept);
 * daily rhythm on a fixed clock: 7:30 in-app prompt → #morning countdown (survives reload) →
 * "Yes, I ate" small celebration; 11:00 and 19:30 check-ins; goodnight ritual; four nights →
 * Progress › Sleep.
 *
 * Usage: node tests/e2e/smoke.mjs [--dir dist] [--only android|iphone] [--shots]
 *   --shots writes screenshots to ./screenshots (android: <name>.png, iphone: iphone-<name>.png).
 * Exits non-zero on the first failed assertion or any page error.
 */
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { existsSync, mkdirSync } from 'node:fs';
import assert from 'node:assert/strict';
import { chromium, webkit, devices } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (k, d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIR = opt('--dir', '.');
const ONLY = opt('--only', '');
const SHOTS = args.includes('--shots');
// A port the OS says is free (a fixed or random one can collide with other local services).
const PORT = await new Promise((resolve) => {
  const srv = createServer().listen(0, '127.0.0.1', () => {
    const { port } = /** @type {import('node:net').AddressInfo} */ (srv.address());
    srv.close(() => resolve(port));
  });
});
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
  // Fixed, flowing clock (Sofia, UTC+3 until 25 Oct) so the daily reminders are deterministic.
  await page.clock.install({ time: new Date('2026-10-19T06:00:00+03:00') });
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
  const layer = page.locator('#layer');
  const settle = () => page.waitForTimeout(350);
  /** Wait until no celebration is showing; taps the button of a big one. */
  const clearCel = async () => {
    for (let i = 0; i < 80; i++) {
      const busy = await page.evaluate(() => {
        const c = document.getElementById('cel');
        if (!c?.children.length) return false;
        /** @type {HTMLElement | null} */ (c.querySelector('.tapbtn'))?.click();
        return true;
      });
      if (!busy) return;
      await page.waitForTimeout(250);
    }
    throw new Error('celebration did not finish');
  };
  /** Navigate (after any celebration has finished, as a person would). */
  const go = async (/** @type {string} */ r) => {
    await clearCel();
    await page.evaluate((r) => (location.hash = '#/' + r), r);
    await page.waitForTimeout(350);
  };
  /** Tag a node so a later `same()` can tell whether it survived a re-render. */
  const tag = (/** @type {string} */ sel) =>
    page.evaluate((sel) => {
      /** @type {any} */ (document.querySelector(sel)).__smoke = 1;
    }, sel);
  const same = (/** @type {string} */ sel) =>
    page.evaluate((sel) => /** @type {any} */ (document.querySelector(sel))?.__smoke === 1, sel);

  // Onboarding
  await page.goto(BASE);
  await page.getByRole('heading', { name: /Vidrichka/ }).waitFor();
  assert.match(await layer.locator('.genderrow .on').innerText(), /Female/, 'onboarding asks; female preselected');
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
  // 1.2 fixes #1/#8: the celebration names the plan; 3 sets of a long plan is a partial workout.
  const celSub = await page.locator('#cel .msub').first().innerText({ timeout: 8000 });
  assert.doesNotMatch(celSub, /object/i, 'no [object Object] in the celebration');
  assert.match(celSub, /^[^·]*\p{L}[^·]* · \d+ exercises · \d+ min$/u);
  assert.match(await page.locator('.summary .chip.warm').innerText(), /Partial/i, 'partial workout chip');
  await page.waitForTimeout(2600);
  await clearCel();
  await shot('summary');
  await page.locator('.summary [data-go="home"]').last().click();
  await settle();

  // Food: category → grams → second item → save-meal prompt
  await go('food');
  await go('food/add/breakfast');
  await page.locator('.cat').first().click();
  await layer.locator('[data-act="pick"]').first().click();
  await layer.locator('#grams').waitFor();
  await settle();
  await tag('#layer .panel');
  await tag('#layer [data-act="g"][data-d="1"]');
  const g0 = await layer.locator('#grams').inputValue();
  await layer.locator('[data-act="g"][data-d="1"]').click();
  await layer.locator('[data-act="g"][data-d="1"]').click();
  await settle();
  assert.notEqual(await layer.locator('#grams').inputValue(), g0, '+ changes the grams');
  assert.ok(await same('#layer .panel'), 'grams sheet panel is kept on + (no flicker)');
  assert.ok(await same('#layer [data-act="g"][data-d="1"]'), '+ button node is kept');
  const anims = await page.evaluate(
    () =>
      document
        .querySelector('#layer .panel')
        .getAnimations({ subtree: true })
        .filter((a) => a.playState === 'running').length,
  );
  assert.equal(anims, 0, 'no animation restarted by +');
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
  await clearCel();
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

  await daily(page, { go, settle, shot, clearCel, tag, same, layer });
  if (name === 'android') await fixes(page, { go, settle, shot, clearCel, layer });

  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

/**
 * 1.1 daily rhythm on the fixed clock: prompt → morning → protein yes → check-ins → goodnight,
 * then a few nights so Progress › Sleep has data. Also the water + button keeps its node and scroll.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function daily(page, { go, settle, shot, clearCel, tag, same, layer }) {
  const at = async (/** @type {number} */ d, /** @type {string} */ hm) => {
    await page.clock.setSystemTime(new Date(`2026-10-${d}T${hm}:00+03:00`));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await settle();
  };
  /** Answer "Later" to reminder prompts until none has shown up for 2.5 s. */
  const closePrompts = async () => {
    for (let quiet = 0, i = 0; quiet < 5 && i < 60; i++) {
      if (await layer.locator('.dprompt').count()) {
        await layer
          .locator('[data-close]')
          .first()
          .click({ timeout: 2000 })
          .catch(() => {}); // the locator handler may have closed it already
        quiet = 0;
      } else quiet++;
      await page.waitForTimeout(500);
    }
  };
  const tuck = async () => {
    await page.locator('.moonbtn').click();
    await page.locator('.gn-asleep').waitFor();
    await page.waitForTimeout(4200); // yawn → curl up → Zzz
  };

  // 7:31 – the silent morning reminder shows in-app; it opens the full-screen morning page.
  // 1.2 fix #4: no morning prompt after a workout today (the smoke workout ran on the 19th).
  await go('home');
  await at(19, '07:31');
  await page.waitForTimeout(3000);
  assert.equal(await layer.locator('.dprompt').count(), 0, 'no morning prompt after a workout today');
  console.log('  ✔ #4 no morning prompt after a workout today');
  await at(20, '07:31');
  await layer.locator('.dprompt').waitFor();
  assert.match(await layer.locator('.dprompt').innerText(), /morning/i);
  await layer.locator('.dprompt [data-act="go"]').click();
  await page.locator('.pclock').waitFor();
  assert.match(page.url(), /#\/morning/);
  assert.equal(await page.locator('#nav').isVisible(), false, 'morning page is full-screen');
  await page.reload();
  await page.locator('.pclock').waitFor({ timeout: 8000 });
  assert.match(await page.locator('.pclock').innerText(), /^(2\d:\d\d|30:00)$/, 'countdown survives a reload');
  // 1.2: Home shows the live protein bar; only its timer text ticks (same nodes, no re-render).
  await go('home');
  await page.locator('.pbar.running .ptime').waitFor();
  await tag('.pbar');
  await tag('.pbar .ptime');
  const t1 = await page.locator('.pbar .ptime').innerText();
  assert.match(t1, /^[0-3]\d:[0-5]\d$/, 'mm:ss countdown');
  await page.waitForTimeout(2200);
  const t2 = await page.locator('.pbar .ptime').innerText();
  assert.notEqual(t1, t2, 'the timer ticks');
  assert.ok((await same('.pbar')) && (await same('.pbar .ptime')), 'timer updates in place');
  await shot('home-protein-running');
  await page.locator('.pbar [data-act="proteinYes"]').click();
  await page.locator('.cel .toastc').waitFor();
  // …then the Food logger opens on today's breakfast with a hint; logging there also
  // completes the "Log breakfast" quest.
  await page.locator('.add .phint').waitFor();
  assert.match(page.url(), /#\/food\/add\/breakfast\?protein$/);
  assert.match(await page.locator('.add .topbar').innerText(), /breakfast/i);
  await clearCel();
  await shot('protein-breakfast-logger');
  await page.locator('.add .chips [data-act="pick"]').first().click();
  await layer.locator('[data-act="done"]').click();
  await page.locator('#micro .micro.food').waitFor({ timeout: 2000 });
  await page.waitForTimeout(200);
  await shot('micro-food');
  await page.locator('#micro .micro.food').waitFor({ state: 'detached', timeout: 2000 });
  await page.locator('.add .topbar [data-act="finish"]').first().click();
  await settle();
  await go('home');
  await page.locator('.pbar.done').waitFor();
  await page.locator('.quest[data-go="food/add/breakfast"] .qbox.done').waitFor();
  console.log('  ✔ Home protein bar ticks in place → "Ate it" → celebration → breakfast logger → quest done');
  // From here on, answer "Later" whenever a reminder prompt pops up in the way (on a slow CI
  // runner one can appear between steps, exactly as it would for a person).
  // (A DOM click: the sheet may still be sliding in, which Playwright calls "not stable".)
  await page.addLocatorHandler(layer.locator('.dprompt'), async (l) => {
    await l
      .locator('[data-close]')
      .first()
      .evaluate((b) => /** @type {HTMLElement} */ (b).click());
    await l.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  });
  await clearCel();
  await closePrompts();

  // 11:05 check-in (+ water + keeps its node and the scroll position)
  await at(20, '11:05');
  await closePrompts();
  await go('food');
  await closePrompts();
  await page.locator('.bluebtn').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 40));
  await settle();
  await tag('.bluebtn');
  await tag('.glasses');
  const y = await page.evaluate(() => scrollY);
  const n = await page.locator('.glass.on').count();
  await page.locator('.bluebtn').click();
  await settle();
  assert.equal(await page.locator('.glass.on').count(), n + 1, '+1 glass');
  assert.ok((await same('.bluebtn')) && (await same('.glasses')), 'water + updates in place');
  // 1.2 micro animation: rapid taps restart one animation (no queue), in its own layer.
  await page.locator('.bluebtn').click();
  await page.waitForTimeout(120);
  await page.locator('.bluebtn').click();
  await page.waitForTimeout(120);
  await page.locator('.bluebtn').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#micro .micro.water').count(), 1, 'one water animation, restarted');
  assert.equal(await page.locator('.glass.on').count(), n + 4, 'every rapid tap counted');
  assert.ok((await same('.bluebtn')) && (await same('.glasses')), 'no re-render from the animation');
  assert.equal(await page.locator('#page #micro').count(), 0, 'animation layer is outside the page');
  await shot('micro-water');
  await page.locator('#micro .micro.water').waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await page.evaluate(() => scrollY), y, 'scroll position kept');
  await clearCel();
  await go('checkin/morning');
  await page.locator('[data-f="mood"][data-v="4"]').click();
  await page.locator('[data-f="sleepQ"][data-v="3"]').click();
  await settle();
  assert.equal(await page.locator('[data-act="rate"].on').count(), 2);
  await clearCel();

  // 19:35 evening check-in
  await at(20, '19:35');
  await closePrompts();
  await go('checkin/evening');
  await page.locator('[data-f="energy"][data-v="4"]').click();
  await settle();
  assert.equal(await page.locator('[data-act="rate"].on').count(), 1);
  await clearCel();

  // 22:35 goodnight from the moon card on Home
  await at(20, '22:35');
  await closePrompts();
  await go('home');
  await page.locator('[data-act="tuck"]').first().click();
  await page.locator('.moonbtn, .gn-asleep').first().waitFor();
  if (await page.locator('.moonbtn').count()) await tuck();
  await clearCel();
  console.log('  ✔ check-ins and goodnight');

  // A few more nights for Progress › Sleep
  const nights = [
    [21, '07:20', '23:10', [4, 3], 3],
    [22, '07:45', '22:50', [5, 4], 5],
    [23, '07:10', '23:30', [3, 5], 4],
  ];
  let first = true;
  for (const [d, wake, bed, [mood, sq], energy] of nights) {
    await at(d, wake);
    await closePrompts();
    await go('morning');
    await page.locator('.yes').click();
    await page.waitForURL(/#\/food\/add\/breakfast\?protein$/);
    await clearCel();
    if (first) {
      // Closing the breakfast logger without adding anything: protein still counts.
      await page.locator('.add .topbar [data-act="finish"]').first().click();
      await go('morning');
      await page.locator('.pcard.done').waitFor();
      first = false;
    }
    await at(d, '11:10');
    await closePrompts();
    await go('checkin/morning');
    await page.locator(`[data-f="mood"][data-v="${mood}"]`).click();
    await page.locator(`[data-f="sleepQ"][data-v="${sq}"]`).click();
    await clearCel();
    await at(d, '19:40');
    await closePrompts();
    await go('checkin/evening');
    await page.locator(`[data-f="energy"][data-v="${energy}"]`).click();
    await clearCel();
    await at(d, bed);
    await closePrompts();
    await go('goodnight');
    await tuck();
    await clearCel();
  }
  await shot('goodnight');

  await at(24, '07:05');
  await closePrompts();
  await go('morning');
  await page.locator('.pclock').waitFor();
  assert.match(await page.locator('body').innerText(), /\d+[.,]?\d*\s*h/, 'slept hours shown');
  await page.waitForTimeout(1500);
  await shot('morning');
  // 1.2: no answer for 30 min → the Home bar turns dark red at 00:00 (also after a reload),
  // and "Skipped" ends it without a celebration.
  await at(24, '07:40');
  await closePrompts();
  await go('home');
  await page.locator('.pbar.overdue').waitFor();
  assert.equal(await page.locator('.pbar .ptime').innerText(), '00:00');
  await page.reload();
  await page.locator('.pbar.overdue').waitFor({ timeout: 8000 });
  await closePrompts();
  assert.notEqual(
    await page.locator('.pbar .ptime').evaluate((n) => getComputedStyle(n).animationName),
    'none',
    'the zeros blink',
  );
  assert.equal(
    await page.locator('.pbar').evaluate((n) => getComputedStyle(n).animationName),
    'none',
    'the bar itself does not',
  );
  await shot('home-protein-overdue');
  await page.locator('.pbar [data-act="proteinSkip"]').click();
  await page.locator('.pbar.skipped').waitFor();
  assert.equal(await layer.locator('.cel .toastc').count(), 0, 'no celebration for a skip');
  console.log('  ✔ protein overdue (red, blinking 00:00, survives reload) → "Skipped"');
  await closePrompts();
  await go('progress/sleep');
  await page.locator('.sbars').waitFor();
  await settle();
  await shot('progress-sleep');
  await go('home');
  await page.evaluate(() => scrollTo(0, 0));
}

/**
 * 1.2: the tester's 1.1.0 findings, in the UI (the logic has unit tests in v12-fixes.test.js).
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function fixes(page, { go, settle, shot, clearCel, layer }) {
  const panels = () => layer.locator('.panel').count();
  await page.addLocatorHandler(layer.locator('.dprompt'), async (l) => {
    await l
      .locator('[data-close]')
      .first()
      .evaluate((b) => /** @type {HTMLElement} */ (b).click());
  });

  // #11 Esc, the backdrop and picking close sheets
  await go('profile');
  await page.locator('[data-act="outfit"]').click();
  await layer.locator('.outfits').waitFor();
  // #10 the unlock line lists only real gear
  assert.doesNotMatch(await layer.innerText(), /Dumbbell/i, 'no "Dumbbell 3" unlock');
  await page.keyboard.press('Escape');
  await settle();
  assert.equal(await panels(), 0, 'Esc closes the outfit sheet');
  await page.locator('[data-act="outfit"]').click();
  await layer.locator('.outfits').waitFor();
  await layer.locator('.overlay').click({ position: { x: 10, y: 10 } });
  await settle();
  assert.equal(await panels(), 0, 'a tap on the backdrop closes it');
  await page.locator('[data-act="outfit"]').click();
  await layer.locator('.outfit[data-id="classic"]').click();
  await settle();
  assert.equal(await panels(), 0, 'picking an outfit closes the sheet');
  assert.match(await page.locator('.outfitrow').innerText(), /Classic/);
  await page.locator('[data-act="outfit"]').click();
  await layer.locator('.outfit[data-id="auto"]').click();
  await settle();
  await page.locator('[data-act="outfit"]').click();
  await layer.locator('.outfits').waitFor();
  await page.goBack(); // Android back gesture
  await settle();
  assert.equal(await panels(), 0, 'back closes the sheet');
  console.log('  ✔ #10 #11 outfit unlocks, Esc / backdrop / back / pick close sheets');

  // 1.2 grammatical gender: Profile switch → Bulgarian texts follow (and back)
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await go('profile/reminders');
  assert.match(await page.locator('#page').innerText(), /не си докоснала първото/, 'female by default');
  await go('profile');
  await page.locator('[data-act="gender"][data-v="m"]').click();
  await settle();
  await go('profile/reminders');
  const txt = await page.locator('#page').innerText();
  assert.match(txt, /не си докоснал първото/, 'male form');
  assert.doesNotMatch(txt, /докоснала/);
  await shot('gender-male-bg');
  await go('profile');
  await page.locator('[data-act="gender"][data-v="f"]').click();
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log('  ✔ gender: onboarding asks, Profile switch changes the Bulgarian forms');

  // #5 the Reminders row reflects the real state; times are one style and never clipped
  await go('profile');
  const row = await page.locator('[data-go="profile/reminders"]').innerText();
  assert.doesNotMatch(row, /\bOff\b/, 'daily reminders are on → not "Off"');
  assert.match(row, /daily reminders/);
  await go('profile/reminders');
  const times = await page.locator('.tbox').evaluateAll((els) =>
    els.map((e) => {
      const v = /** @type {HTMLElement} */ (e.querySelector('.tval'));
      return { text: v.textContent, clipped: v.scrollWidth > e.clientWidth };
    }),
  );
  assert.ok(times.length >= 8);
  for (const x of times) {
    assert.match(String(x.text), /^\d{2}:\d{2}$/, `en-GB → 24 h (${x.text})`);
    assert.equal(x.clipped, false, `${x.text} is not clipped`);
  }
  await shot('fix-reminders');
  console.log('  ✔ #5 reminder times: one 24 h style, not clipped; summary not "Off"');

  // #6 manual food: inline errors, no silent clamping; odd kcal asks once
  // keep the test offline-deterministic: Open Food Facts answers "nothing found"
  await page.route('**/*openfoodfacts.org/**', (r) =>
    r.fulfill({ json: { count: 0, products: [] }, headers: { 'access-control-allow-origin': '*' } }),
  );
  await go('food/add/lunch');
  await page.locator('#fq').fill('zzqx homemade bar');
  await settle();
  await page.locator('[data-act="manual"]').first().click();
  await layer.locator('#mname').fill('Test bar');
  await layer.locator('#mkcal').fill('150');
  await layer.locator('#mp').fill('90');
  await layer.locator('#mc').fill('90');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await layer.locator('.ferr').first().innerText(), /100 g/, 'P+C+F > 100 g is an error');
  assert.equal(await panels(), 1, 'nothing saved');
  await shot('fix-manual-food');
  await layer.locator('#mp').fill('20');
  await layer.locator('#mc').fill('30');
  await layer.locator('#mf').fill('10');
  await layer.locator('#mkcal').fill('50');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.equal(await layer.locator('.ferr').count(), 0);
  assert.match(await layer.locator('.fwarn').innerText(), /290 kcal/);
  assert.match(await layer.locator('[data-act="save"]').innerText(), /Save anyway/);
  await page.keyboard.press('Escape');
  await settle();
  // body weight
  await go('progress/body');
  await page.locator('[data-act="add"]').click();
  await layer.locator('#m_weight').fill('-60');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await layer.locator('#h_weight.ferr').innerText(), /between 20 and 300 kg/);
  assert.equal(await panels(), 1, 'negative weight is not saved');
  await page.keyboard.press('Escape');
  await settle();
  console.log('  ✔ #6 manual food and body weight validation');

  // #3 a past workout opens as a read-only detail in Progress, and can be deleted
  await go('progress/calendar');
  await page.locator('.lrow[data-go^="history/"]').first().click();
  await page.locator('.history').waitFor();
  assert.equal(await page.locator('#page .confetti').count(), 0, 'no confetti');
  assert.equal(await page.locator('#page .summary').count(), 0, 'not the summary');
  await page.waitForTimeout(800);
  assert.equal(await page.evaluate(() => document.getElementById('cel')?.children.length ?? 0), 0, 'no celebration');
  assert.match(await page.locator('#nav .t.on').innerText(), /Progress/, 'Progress tab stays active');
  assert.ok((await page.locator('.history .hex').count()) > 0, 'per-exercise detail');
  assert.match(await page.locator('.history .hsets').first().innerText(), /kg × \d+|reps/);
  await shot('fix-history');
  await page.locator('.history [data-act="del"]').click();
  await layer.locator('.btn.danger').click();
  await page.waitForURL(/#\/progress\/calendar/);
  await settle();
  assert.equal(await page.locator('.lrow[data-go^="history/"]').count(), 0, 'the workout is gone');
  await clearCel();
  console.log('  ✔ #3 past workout: read-only detail in Progress, delete with confirm');
  await page.removeLocatorHandler(layer.locator('.dprompt'));
}
