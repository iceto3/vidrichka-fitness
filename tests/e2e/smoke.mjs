/**
 * End-to-end smoke test (Playwright, no test runner needed).
 *
 * Runs the main user flows on two emulated phones:
 *   - "android": Chromium, 412x915 (Pixel-class Android Chrome)
 *   - "iphone":  WebKit, iPhone 14 profile (iOS Safari engine)
 * Flows: onboarding → workout (steppers, Done locks set, rest timer, skip, finish) → summary;
 * food via category → grams sheet → second item → "save as regular meal?" prompt;
 * a body measurement; Bulgarian language; dark theme; backup export; offline reload (Chromium);
 * 1.4.1 exercise technique (library thumbnails, page + in-workout sheet, light/dark, offline drawings).
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
import { existsSync, mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
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
  // A persistent (non-private) profile: WebKit's ephemeral contexts cannot store Blobs in
  // IndexedDB (like Safari private browsing), but the installed app on an iPhone can.
  iphone: { type: webkit, launch: {}, ctx: { ...devices['iPhone 14'] }, prefix: 'iphone-', persistent: true },
};

let failed = false;
for (const [name, P] of Object.entries(PROFILES)) {
  if (ONLY && ONLY !== name) continue;
  const t0 = Date.now();
  const browser = P.persistent
    ? {
        newContext: (/** @type {any} */ o) =>
          P.type.launchPersistentContext(mkdtempSync(join(tmpdir(), 'vf-e2e-')), { ...P.launch, ...o }),
        close: async () => {},
      }
    : await P.type.launch(P.launch);
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
 * @param {import('playwright-core').Browser | {newContext: (o: any) => Promise<any>, close: () => Promise<void>}} browser
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
  // The real push and voice Workers are never called from here: they look unreachable, so
  // the voice buttons stay hidden; voice13() mocks its own server. (Real push: server/test/e2e.)
  await ctx.route(/\.workers\.dev\//, (r) => r.abort());
  const page = await ctx.newPage();
  // Fixed, flowing clock (Sofia, UTC+3 until 25 Oct) so the daily reminders are deterministic.
  await page.clock.install({ time: new Date('2026-10-19T06:00:00+03:00') });
  const errors = [];
  page.on('pageerror', (e) => (errors.push(e.message), console.log(`  ! page error: ${e.message}`)));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) &&
      (errors.push(m.text()), console.log(`  ! console error: ${m.text()}`)),
  );
  const shot = async (/** @type {string} */ n, full = false, keepToast = false) => {
    if (!SHOTS) return;
    if (!keepToast)
      await page.evaluate(() => document.querySelectorAll('.toast, .undopill').forEach((e) => e.remove()));
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
  /** Read rows of one IndexedDB store (as saved, not the app's cache). @param {string} store */
  const rows = (store) =>
    page.evaluate(
      (store) =>
        new Promise((res, rej) => {
          const r = indexedDB.open('vidrichka-fitness');
          r.onerror = () => rej(r.error);
          r.onsuccess = () => {
            const q = r.result.transaction(store).objectStore(store).getAll();
            q.onsuccess = () => (
              res(q.result.map((x) => ({ ...x, blob: x.blob ? x.blob.size : undefined }))),
              r.result.close()
            );
          };
        }),
      store,
    );
  /** A field of today's day record (fake clock), or null. @param {string} f */
  const dayField = async (f) => {
    const key = await page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
    await page.waitForTimeout(150); // let the IndexedDB write land
    const r = /** @type {any[]} */ (await rows('days')).find((x) => x.id === key);
    return r?.[f] ?? null;
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
  // 1.4.0: no anonymous-data notice after onboarding (it comes with the first manual food)
  assert.equal(await page.locator('.datanotice').count(), 0, 'no data notice after onboarding');
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

  const h = { go, settle, shot, clearCel, tag, same, layer, rows, dayField };
  await daily(page, h);
  if (name === 'android') await fixes(page, h);
  await photos121(page, h, name);
  await voice13(page, h);
  await v131(page, h);
  await v132(page, h);
  await v133(page, h, name);
  await v134(page, h, name);
  await v140(page, h);
  await v141(page, h, name, ctx);
  await v141tester(page, h, name, ctx);

  assert.deepEqual(errors, [], 'no page errors');
  await ctx.close();
}

/**
 * 1.1 daily rhythm on the fixed clock: prompt → morning → protein yes → check-ins → goodnight,
 * then a few nights so Progress › Sleep has data. Also the water + button keeps its node and scroll.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function daily(page, { go, settle, shot, clearCel, tag, same, layer, dayField }) {
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
  // 1.2.1 (bug L): "Ate it" only opens the Food logger on today's breakfast — no credit yet.
  await page.locator('.add .phint').waitFor();
  assert.match(page.url(), /#\/food\/add\/breakfast\?protein$/);
  assert.match(await page.locator('.add .topbar').innerText(), /breakfast/i);
  assert.equal(await page.locator('.cel .toastc').count(), 0, 'no protein celebration before a breakfast is saved');
  assert.equal(await dayField('proteinAt'), null, 'protein not recorded by the button');
  await shot('protein-breakfast-logger');
  await page.locator('.add .chips [data-act="pick"]').first().click();
  await layer.locator('[data-act="done"]').click();
  await page.locator('.cel .toastc').waitFor(); // saving the breakfast records the protein
  assert.ok(await dayField('proteinAt'), 'protein recorded once the breakfast is saved');
  await page.locator('#micro .micro.food').waitFor({ timeout: 2000 });
  await page.waitForTimeout(200);
  await shot('micro-food');
  await page.locator('#micro .micro.food').waitFor({ state: 'detached', timeout: 2000 });
  await page.locator('.add .topbar [data-act="finish"]').first().click();
  await settle();
  await go('home');
  await page.locator('.pbar.done').waitFor();
  await page.locator('.quest[data-m="breakfast"] .qbox.done').waitFor();
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
  await page.locator('.waterplus').scrollIntoViewIfNeeded();
  await page.evaluate(() => scrollBy(0, 40));
  await settle();
  await tag('.waterplus');
  await tag('.glasses');
  const y = await page.evaluate(() => scrollY);
  const n = await page.locator('.glass.on').count();
  await page.locator('.waterplus').click();
  await settle();
  assert.equal(await page.locator('.glass.on').count(), n + 1, '+1 glass');
  assert.ok((await same('.waterplus')) && (await same('.glasses')), 'water + updates in place');
  // 1.2 micro animation: rapid taps restart one animation (no queue), in its own layer.
  await page.locator('.waterplus').click();
  await page.waitForTimeout(120);
  await page.locator('.waterplus').click();
  await page.waitForTimeout(120);
  await page.locator('.waterplus').click();
  await page.waitForTimeout(250);
  assert.equal(await page.locator('#micro .micro.water').count(), 1, 'one water animation, restarted');
  assert.equal(await page.locator('.glass.on').count(), n + 4, 'every rapid tap counted');
  assert.ok((await same('.waterplus')) && (await same('.glasses')), 'no re-render from the animation');
  assert.equal(await page.locator('#page #micro').count(), 0, 'animation layer is outside the page');
  await shot('micro-water');
  await page.locator('#micro .micro.water').waitFor({ state: 'detached', timeout: 2000 });
  assert.equal(await page.evaluate(() => scrollY), y, 'scroll position kept');
  // 1.4.0: − on the left removes one glass, never below 0
  await page.locator('.waterminus').click();
  await page.waitForTimeout(150);
  assert.equal(await page.locator('.glass.on').count(), n + 3, '− removes one glass');
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
      // 1.2.1 (bug L): closing the breakfast logger without adding anything gives no credit.
      await page.locator('.add .topbar [data-act="finish"]').first().click();
      await go('morning');
      await page.waitForTimeout(300);
      assert.equal(await page.locator('.pcard.done').count(), 0, 'no protein credit without a breakfast');
      assert.equal(await dayField('proteinAt'), null);
      await go('home');
      assert.equal(await page.locator('.quest[data-go="morning"] .qbox.done').count(), 0, 'protein quest not ticked');
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
  await settle();
  // 1.4.0: a live, non-blocking hint while typing; the button stays a plain Save
  assert.match(await layer.locator('#kcalhint .fwarn').innerText(), /290 kcal.*says 50/);
  assert.match(await layer.locator('[data-act="save"]').innerText(), /^\s*Save\s*$/);
  await layer.locator('#mkcal').fill('285');
  await settle();
  assert.equal(await layer.locator('#kcalhint .fwarn').count(), 0, 'close enough: no hint');
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

/**
 * 1.2.1: progress photo sessions (4 pose slots, EXIF date, add several, move, delete, edited
 * date re-sorting the timeline and before/after, monthly quest + small → big celebration),
 * the 2 → 3 photo migration, and fixes C1 (newest weight shows at once), C2 (partial workout),
 * C4 (empty weight card), C5 (reset shows the welcome at once).
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 * @param {string} name profile
 */
async function photos121(page, { go, settle, shot, clearCel, layer, rows }, name) {
  const FX = (/** @type {string} */ n) => `tests/fixtures/${n}`;
  const today = await page.evaluate(() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  await page.addLocatorHandler(layer.locator('.dprompt'), async (l) => {
    await l
      .locator('[data-close]')
      .first()
      .evaluate((b) => /** @type {HTMLElement} */ (b).click());
  });
  const slot = (/** @type {string} */ p) => layer.locator(`.pslot[data-pose="${p}"]`);
  const pick = async (/** @type {string} */ p, /** @type {string} */ file) => {
    await slot(p).locator('input[data-change="slot"]:not([capture])').setInputFiles(FX(file));
    await slot(p).locator('img').waitFor();
    await settle();
  };

  // Monthly quest on Home
  await go('home');
  const quest = page.locator('.quest[data-go="progress/body"]');
  await quest.waitFor();
  assert.match(await quest.innerText(), /Monthly progress photos[\s\S]*0\/4|0 of 4/i);
  await quest.evaluate((e) => e.scrollIntoView({ block: 'center' }));
  await settle();
  await shot('photo-monthly-quest');

  // New session: 4 empty slots, camera + gallery per slot
  await go('progress/body');
  assert.match(await page.locator('.pmonth').innerText(), /0 of 4 poses/);
  await page.locator('[data-act="psNew"]').click();
  await layer.locator('.pslots.edit').waitFor();
  assert.equal(await layer.locator('.pslot.empty').count(), 4, 'all 4 pose slots offered');
  assert.equal(await layer.locator('.pslot.empty input[capture]').count(), 4, 'camera per slot');
  assert.equal(await layer.locator('.pslot.empty input:not([capture])').count(), 4, 'gallery per slot');
  assert.equal(await layer.locator('#psdate').inputValue(), today, 'defaults to the upload day');

  // EXIF capture date becomes the session date
  await pick('front', 'pose-front.jpg');
  const exifSeen = (await layer.locator('#psdate').inputValue()) === '2026-10-18';
  assert.ok(exifSeen, `EXIF DateTimeOriginal read in ${name}`);
  assert.match(await layer.innerText(), /Date from the photo/);
  console.log(`  ✔ EXIF DateTimeOriginal read from the picked JPEG (${name === 'android' ? 'Chromium' : 'WebKit'})`);

  // Add several → fill the empty slots in order (back, left); no EXIF → upload date, the
  // session keeps the earliest date
  await layer.locator('input[data-change="several"]').setInputFiles([FX('pose-back.jpg'), FX('pose-right.jpg')]);
  await slot('left').locator('img').waitFor();
  await settle();
  assert.equal(await slot('back').locator('img').count(), 1);
  assert.equal(await slot('right').locator('img').count(), 0, 'several go to the empty slots in order');
  assert.equal(await layer.locator('#psdate').inputValue(), '2026-10-18', 'earliest capture date');
  // the right-pose picture landed in "left": move it
  await slot('left').locator('[data-act="mv"]').click();
  await slot('left').locator('[data-act="mvTo"][data-v="right"]').click();
  await settle();
  assert.equal(await slot('left').locator('img').count(), 0);
  assert.equal(await slot('right').locator('img').count(), 1, 'moved to Right');
  // delete with confirm, then add it again
  await slot('back').locator('[data-act="del"]').click();
  await layer.locator('.btn.danger').click();
  await settle();
  assert.equal(await slot('back').locator('img').count(), 0, 'deleted after confirm');
  await pick('back', 'pose-back.jpg');
  await shot('photo-session');
  await pick('left', 'pose-left.jpg');
  assert.equal(await layer.locator('.pslot img').count(), 4);
  const saved = /** @type {any[]} */ (await rows('photos'));
  assert.equal(saved.length, 4);
  assert.ok(saved.every((p) => p.date === '2026-10-18' && p.blob > 0 && p.session === saved[0].session));
  assert.equal(saved.find((p) => p.pose === 'front').shot.source, 'exif');
  assert.equal(saved.find((p) => p.pose === 'back').shot.source, 'upload');

  // Done → SMALL celebration first (not blocking), then the BIG monthly-set one
  await layer.locator('.sticky-b[data-close]').click();
  const small = page.locator('#cel .toastc');
  await small.waitFor({ timeout: 4000 });
  assert.equal(await page.locator('#cel .tapbtn').count(), 0, 'the session ends with the small one');
  await page.waitForTimeout(300);
  await shot('photo-celebration');
  const seen = [];
  for (let i = 0; i < 60; i++) {
    const s = await page.evaluate(() => {
      const c = document.getElementById('cel');
      return c?.querySelector('.lvup')?.textContent ?? c?.querySelector('.toastc .t1')?.textContent ?? '';
    });
    if (s && seen[seen.length - 1] !== s) seen.push(s);
    if (/MONTHLY SET/i.test(s)) break;
    await page.waitForTimeout(150);
  }
  assert.ok(
    seen.some((s) => /MONTHLY SET/i.test(s)),
    `big monthly-set celebration follows (${seen.join(' → ')})`,
  );
  assert.ok(!/MONTHLY SET/i.test(seen[0]), 'small one comes first');
  await clearCel();
  console.log(`  ✔ photo session: 4 slots, EXIF date, add several, move, delete; small → big (${seen.join(' → ')})`);
  assert.match(await page.locator('.pmonth').innerText(), /Done for October/);
  await go('home');
  assert.equal(await page.locator('.quest[data-go="progress/body"] .qbox.done').count(), 1, 'quest done today');

  // A second, older session (EXIF 1 Sep) → timeline order + before/after by date
  await go('progress/body');
  await page.locator('[data-act="psNew"]').click();
  await pick('front', 'pose-front-sep.jpg');
  assert.equal(await layer.locator('#psdate').inputValue(), '2026-09-01');
  await layer.locator('.sticky-b[data-close]').click();
  await settle();
  await clearCel();
  await page.locator('[data-act="psTimeline"]').click();
  await layer.locator('.ptimeline').waitFor();
  const order = async () => (await layer.locator('.ptimeline .psession .xb').allInnerTexts()).join(' | ');
  assert.match(await order(), /1 Sept? 2026.*\|.*18 Oct 2026/, 'chronological');
  await page.waitForTimeout(700); // let the sheet finish sliding in
  await shot('photo-timeline');
  // Compare (Front): before = 1 Sep, now = 18 Oct
  await page.keyboard.press('Escape');
  await settle();
  await page.locator('[data-act="psCompare"]').click();
  await layer.locator('.cmp').waitFor();
  const caps = async () => (await layer.locator('.cmp figcaption').allInnerTexts()).join(' | ');
  assert.match(await caps(), /Before · 1 Sep.*\|.*Now · 18 Oct/);
  await page.waitForTimeout(700); // let the sheet finish sliding in
  await shot('photo-compare');
  await layer.locator('.pseg [data-v="back"]').click();
  await settle();
  assert.match(await caps(), /^Before \| Now · 18 Oct/, 'one photo: it is "Now", before empty');
  assert.match(await layer.innerText(), /No earlier photo of this pose yet/);
  await page.keyboard.press('Escape');
  await settle();

  // Edit the September session's date (taken 19 Oct, say) → timeline + before/after re-sort
  await page.locator('[data-act="psTimeline"]').click();
  await layer.locator('.ptimeline .psession').first().click();
  await layer.locator('#psdate').fill(today);
  await layer.locator('#psdate').dispatchEvent('change');
  await settle();
  assert.match(await layer.innerText(), /Date set by you/);
  await page.keyboard.press('Escape'); // session
  await settle();
  await clearCel();
  assert.match(await order(), /^18 Oct 2026[^|]*\| (?!1 Sep)\d+ Oct 2026/, 're-sorted after the edit');
  assert.equal(await layer.locator('.ptimeline li:last-child .chip.warm').count(), 1, '"Date set by you"');
  await page.keyboard.press('Escape'); // timeline
  await settle();
  await page.locator('[data-act="psCompare"]').click();
  await layer.locator('.cmp').waitFor();
  assert.match(await caps(), /Before · 18 Oct.*\|.*Now · /, 'edited date moves it to "Now"');
  await page.keyboard.press('Escape');
  await settle();
  console.log('  ✔ timeline, pose compare, editable date re-sorts both');

  // 1.3.2: Progress › Body lists every session (newest first) with the count, not only the latest
  await go('progress/body');
  await page.locator('.psessions').waitFor();
  assert.equal(await page.locator('.psessions .psession').count(), 2, 'both sessions listed');
  assert.match(await page.locator('#page').innerText(), /2 sessions/);
  assert.equal((await page.locator('.psessions .psession img').count()) >= 2, true, 'with their photos');
  await page.locator('.psessions').scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  await shot('photo-sessions');
  console.log('  ✔ 1.3.2 Body: session count + all sessions');

  // 2 → 3 migration: an old-style photo row (no session) survives a reload as a Front session
  await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction(['photos', 'kv'], 'readwrite');
          tx.objectStore('photos').put({
            id: 'old1',
            date: '2026-08-10',
            blob: new Blob([new Uint8Array(500)], { type: 'image/jpeg' }),
          });
          const kv = tx.objectStore('kv');
          const m = kv.get('meta');
          m.onsuccess = () => kv.put({ id: 'meta', value: { ...(m.result?.value ?? {}), dataVersion: 2 } });
          tx.oncomplete = () => (r.result.close(), res(null));
        };
      }),
  );
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await settle();
  await clearCel();
  const old = /** @type {any[]} */ (await rows('photos')).find((p) => p.id === 'old1');
  assert.deepEqual(
    { s: old.session, p: old.pose, d: old.date, b: old.blob },
    { s: 'ps_old1', p: 'front', d: '2026-08-10', b: 500 },
    'migrated, never lost',
  );
  assert.equal(/** @type {any[]} */ (await rows('photos')).length, 6);
  console.log('  ✔ migration 2 → 3 keeps old photos (Front slot, original date)');

  // C1: two weigh-ins the same day → the card shows the latest at once (no reload)
  await go('progress/body');
  for (const w of ['60', '61.5']) {
    await page.locator('[data-act="add"]').click();
    await layer.locator('#m_weight').fill(w);
    await layer.locator('[data-act="save"]').click();
    await settle();
  }
  await clearCel();
  assert.match(await page.locator('.weightcard').innerText(), /61\.5/, 'latest same-day weight');

  // C2 (source build only, needs the app's own store module): a partial workout
  if (await page.evaluate(() => !!document.querySelector('script[src*="src/main.js"]'))) {
    await page.evaluate(async () => {
      const st = await import('/src/core/store.js');
      const now = Date.now();
      st.put('sessions', {
        id: 'partial-e2e',
        name: 'Partial e2e',
        startedAt: now - 600e3,
        endedAt: now,
        durationSec: 600,
        items: [],
        setsDone: 2,
        setsPlanned: 12,
        volume: 3960,
        prs: [],
        kcal: 40,
        xp: 20,
        partial: true,
      });
    });
    await go('progress/calendar');
    await page.locator('#page .cd').first().waitFor();
    const cal = await page.locator('#page').innerText();
    assert.match(cal, /Workouts\n\d+ \+\d+ partial/, 'calendar counts the partial one separately');
    assert.ok((await page.locator('.cd.part, .cd.on').count()) > 0);
    await go('summary/partial-e2e');
    await settle();
    const sum = await page.locator('#page').innerText();
    assert.doesNotMatch(sum, /complete/i, 'not "… complete"');
    assert.match(sum, /3,960/, 'volume with thousands separator');
    await clearCel();
  }

  // C5: Reset all data → the welcome shows at once; C4: empty weight card → add-weight action
  await go('profile');
  await page.locator('[data-act="reset"]').click();
  await layer.locator('.btn.danger').click();
  await page.getByRole('heading', { name: /Vidrichka/ }).waitFor({ timeout: 4000 });
  assert.equal(await layer.locator('.onboard').count(), 1, 'onboarding without a reload');
  await layer.locator('input').first().fill('Maria');
  await page.getByRole('button', { name: "Let's go" }).click();
  await settle();
  await settle();
  await clearCel();
  await go('progress/body');
  await page.locator('.weightcard').click();
  await layer.locator('.wempty').waitFor();
  assert.match(await layer.innerText(), /No weight yet/);
  await page.waitForTimeout(700); // let the sheet finish sliding in
  await shot('weight-empty');
  await layer.locator('[data-act="addw"]').click();
  await layer.locator('#m_weight').waitFor();
  await page.keyboard.press('Escape');
  await settle();
  console.log('  ✔ C1 latest weight, C2 partial, C4 empty weight card, C5 reset → welcome at once');
  await page.removeLocatorHandler(layer.locator('.dprompt'));
}

/**
 * 1.3: "Say it" voice logging against a mocked voice server: hidden until the server is
 * configured; 1.3.1: sentence → saved at once with an Undo snackbar (no confirm sheet), the
 * meal named in the sentence wins, fiber/salt are kept; errors show in the sheet.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function voice13(page, { go, settle, shot, clearCel, layer, rows }) {
  await page.addLocatorHandler(layer.locator('.dprompt'), async (l) => {
    await l
      .locator('[data-close]')
      .first()
      .evaluate((b) => /** @type {HTMLElement} */ (b).click());
  });
  const URL = 'https://voice.test';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  /** @type {any[]} */
  const sent = [];
  let status = 200;
  await page.route(`${URL}/**`, async (route) => {
    const req = route.request();
    if (req.url().endsWith('/health'))
      return route.fulfill({ headers: cors, body: JSON.stringify({ ok: true, configured: true, version: 'mock' }) });
    const b = JSON.parse(req.postData() ?? '{}');
    sent.push({ ...b, ct: req.headers()['content-type'] });
    if (status !== 200) return route.fulfill({ status, headers: cors, body: JSON.stringify({ error: 'rate-limit' }) });
    const food = (/** @type {any} */ o) => ({ type: 'food', meal: 'breakfast', date: b.today, time: b.time, ...o });
    if (/закуска/.test(b.text)) {
      const named = (/** @type {any} */ o) => ({
        ...o,
        meal: 'breakfast',
        meal_named: true,
        date: b.today,
        time: null,
      });
      return route.fulfill({
        headers: cors,
        body: JSON.stringify({
          entries: [
            named({
              type: 'food',
              name: 'кебапчета',
              amount: '2 бр.',
              grams: 120,
              kcal: 336,
              protein: 20.4,
              carbs: 2.4,
              fat: 26.4,
              fiber: 0,
              salt: 1.8,
            }),
            named({
              type: 'food',
              name: 'лютеница',
              amount: '½ буркан',
              grams: 130,
              kcal: 169,
              protein: 3.1,
              carbs: 13,
              fat: 11.7,
              fiber: 4,
              salt: 1.56,
            }),
            named({ type: 'water', amount_ml: 330 }),
          ],
          model: 'mock',
        }),
      });
    }
    return route.fulfill({
      headers: cors,
      body: JSON.stringify({
        entries: [
          food({ name: 'Oats', amount: '1 bowl', grams: 60, kcal: 230, protein: 8, carbs: 40, fat: 4 }),
          food({ name: 'Banana', amount: '1 medium', grams: 120, kcal: 105, protein: 1.3, carbs: 27, fat: 0.4 }),
          { type: 'water', amount_ml: 500, meal: 'breakfast', date: b.today, time: null },
        ],
        model: 'mock',
      }),
    });
  });
  const voiceRows = async () =>
    /** @type {any[]} */ (await rows('food'))
      .filter((r) => r.source === 'voice')
      .sort((a, b) => a.ts - b.ts || a.name.localeCompare(b.name));
  const glasses = async () => {
    const d = await page.evaluate(() => {
      const n = new Date();
      return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
    });
    return /** @type {any[]} */ (await rows('food')).find((r) => r.id === `water_${d}`)?.glasses ?? 0;
  };

  // Server unreachable → no button
  await go('home');
  assert.equal(await page.locator('[data-act="voice"]').count(), 0, 'no "Say it" without a reachable voice server');
  // Configured (localhost override) → buttons on Home and Food › Add
  await page.evaluate((u) => localStorage.setItem('vf-voice-url', u), URL);
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await go('home');
  const btn = page.locator('#page [data-act="voice"]');
  await btn.waitFor({ timeout: 8000 });
  assert.match(await btn.innerText(), /Say it/);
  await clearCel();
  const w0 = await glasses(),
    r0 = (await voiceRows()).length;

  await btn.click();
  await layer.locator('#vtext').waitFor();
  assert.ok(await layer.locator('[data-act="parse"]').isDisabled(), 'nothing to read yet');
  await layer.locator('#vtext').fill('I had a bowl of oats with a banana and two glasses of water');
  assert.match(await layer.locator('#vcount').innerText(), /^59\/500$/);
  await page.waitForTimeout(700);
  await shot('voice-sheet');
  await layer.locator('[data-act="parse"]').click();
  // 1.3.1: no confirm step — saved at once, the sheet closes; 1.3.2: a short toast lists what
  // was added (adds and edits have no Undo any more – only deletions do)
  await layer.locator('#vtext').waitFor({ state: 'detached' });
  await page.locator('.toast').waitFor();
  assert.equal(sent.length, 1);
  assert.deepEqual(Object.keys(sent[0]).sort(), ['ct', 'lang', 'text', 'time', 'today', 'tz']);
  assert.match(sent[0].ct, /^text\/plain/, 'simple request (no CORS preflight)');
  assert.equal(sent[0].tz, 'Europe/Sofia');
  await settle();
  const snackTxt = await page.locator('.toast').innerText();
  assert.match(snackTxt, /Added to breakfast: Oats 60 g, Banana 120 g, \+2 glasses of water/);
  assert.equal(await page.locator('.toast button, .undopill').count(), 0, 'no Undo for an add');
  const byName = (/** @type {any[]} */ l) => [...l].sort((a, b) => a.name.localeCompare(b.name));
  let saved = byName((await voiceRows()).slice(r0));
  assert.equal(saved.length, 2);
  assert.deepEqual(
    saved.map((r) => [r.name, r.grams, r.kcal, r.meal]),
    [
      ['Banana', 120, 105, 'breakfast'],
      ['Oats', 60, 230, 'breakfast'],
    ],
  );
  assert.equal(await glasses(), w0 + 2, 'two glasses of water added');
  const r0b = (await voiceRows()).length,
    w0b = await glasses();
  await clearCel();

  // The meal named in the sentence wins over the screen's meal (Food › Add dinner), in Bulgarian
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  await go('food/add/dinner');
  await page.locator('#page [data-act="voice"]').click();
  await layer.locator('#vtext').fill('запиши в закуска две кебапчета, половин буркан лютеница и една сода');
  await layer.locator('[data-act="parse"]').click();
  await page.locator('.toast').waitFor();
  await settle();
  saved = byName((await voiceRows()).slice(r0b));
  assert.deepEqual(
    saved.map((r) => [r.name, r.grams, r.meal, r.fib, r.salt]),
    [
      ['кебапчета', 120, 'breakfast', 0, 1.8],
      ['лютеница', 130, 'breakfast', 4, 1.56],
    ],
    'named meal (breakfast), not the screen meal (dinner); fiber and salt saved',
  );
  assert.equal(await glasses(), w0b + 1, 'the сода (sparkling water) counts as water');
  assert.match(
    await page.locator('.toast').innerText(),
    /Добавено в закуска: кебапчета 120 г, лютеница 130 г, \+1 чаша вода/,
  );
  await page.waitForTimeout(1500); // let the micro animation finish
  await shot('voice-named-meal', false, true);
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  const r1 = (await voiceRows()).length;
  await clearCel();

  // Errors stay in the sheet (rate limit); Food › Add has the button too
  status = 429;
  await go('food/add/lunch');
  await page.locator('#page [data-act="voice"]').click();
  await layer.locator('#vtext').fill('a coffee');
  await layer.locator('[data-act="parse"]').click();
  await layer.locator('.verr').waitFor();
  assert.match(await layer.locator('.verr').innerText(), /Too many tries/);
  await page.keyboard.press('Escape');
  await settle();
  assert.equal((await voiceRows()).length, r1, 'an error saves nothing');

  // Server unreachable again → buttons hidden
  await page.evaluate(() => localStorage.removeItem('vf-voice-url'));
  await page.unroute(`${URL}/**`);
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await go('home');
  await settle();
  assert.equal(await page.locator('[data-act="voice"]').count(), 0, 'hidden again without a server');
  console.log(
    '  ✔ 1.3 voice: hidden until configured, saved at once with a toast, named meal wins, errors in the sheet',
  );
  await page.removeLocatorHandler(layer.locator('.dprompt'));
}

/**
 * 1.3.1 (in Bulgarian): fiber & salt in the manual sheet and the daily totals, editing an item
 * (grams + move to another meal) with Undo, delete → "Recently deleted" → restore, "Save as
 * combination" from the meal sheet (name pre-selected), combination chips in Add food
 * (tap selects, tap again adds, Undo).
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function v131(page, { go, settle, shot, clearCel, layer, rows }) {
  await page.addLocatorHandler(layer.locator('.dprompt'), async (l) => {
    await l
      .locator('[data-close]')
      .first()
      .evaluate((b) => /** @type {HTMLElement} */ (b).click());
  });
  await page.route('**/*openfoodfacts.org/**', (r) =>
    r.fulfill({ json: { count: 0, products: [] }, headers: { 'access-control-allow-origin': '*' } }),
  );
  const today = await page.evaluate(() => {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  });
  const dayFood = async () =>
    /** @type {any[]} */ (await rows('food')).filter((r) => r.date === today && !String(r.id).startsWith('water_'));
  const banica = async () => (await dayFood()).find((r) => r.name === 'Баница');
  const closeAll = async () => {
    for (let i = 0; i < 4 && (await layer.locator('.panel').count()); i++) {
      await page.keyboard.press('Escape');
      await settle();
    }
  };
  /** The name field is focused with its whole default name selected. */
  const nameSelected = () =>
    page.evaluate(() => {
      const i = /** @type {HTMLInputElement} */ (document.getElementById('mealname'));
      return (
        !!i &&
        document.activeElement === i &&
        i.value.length > 0 &&
        i.selectionStart === 0 &&
        i.selectionEnd === i.value.length
      );
    });
  await clearCel();
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();

  // 1) Manual food: optional "Фибри / 100 г" and "Сол / 100 г" right below Мазнини
  await go('food/add/breakfast');
  await page.locator('[data-act="manual"]').first().click();
  await layer.locator('#mname').fill('Баница');
  const labels = await layer.locator('.grid2 .field > span').allInnerTexts();
  assert.deepEqual(labels.slice(3, 6), ['Мазнини / 100 г', 'Фибри / 100 г', 'Сол / 100 г']);
  assert.equal(await layer.locator('#msalt').getAttribute('placeholder'), 'по желание');
  await layer.locator('#mkcal').fill('300');
  await layer.locator('#mp').fill('8');
  await layer.locator('#mc').fill('30');
  await layer.locator('#mf').fill('16');
  await layer.locator('#mfib').fill('1,5');
  await layer.locator('#msalt').fill('1,2');
  await page.waitForTimeout(300);
  await shot('manual-fiber-salt');
  await layer.locator('[data-act="save"]').click();
  // 1.4.0: the first manual food explains the anonymous sharing once (Profile wording)
  await layer.locator('.datanotice').waitFor({ timeout: 4000 });
  assert.match(await layer.innerText(), /Помогни да подобрим приложението/);
  assert.match(await layer.innerText(), /Не изпращай/);
  await layer.locator('[data-close]').last().click();
  await layer.locator('#grams').waitFor();
  assert.match(await layer.locator('.extra').innerText(), /Фибри/i, 'grams sheet shows fiber/salt');
  await layer.locator('[data-act="done"]').click();
  await settle();
  assert.match(await page.locator('.toast').innerText(), /Добавено: Баница · 100 г/);
  assert.equal(await page.locator('.toast button, .undopill').count(), 0, '1.3.2: an add has no Undo');
  let b = await banica();
  assert.deepEqual([b.grams, b.kcal, b.fib, b.salt, b.meal], [100, 300, 1.5, 1.2, 'breakfast']);
  await page.locator('.cat').first().click();
  await layer.locator('[data-act="pick"]').first().click();
  await layer.locator('[data-act="done"]').click();
  await settle();
  await page.locator('.topbar .btn[data-act="finish"]').click();
  await layer.locator('#mealname').waitFor();
  await page.waitForTimeout(500);
  assert.ok(await nameSelected(), 'combination name is pre-selected (typing replaces it)');
  await layer.locator('[data-close]').first().click();
  await settle();
  await closeAll();
  await go('food');
  const sum = async (/** @type {string} */ k) =>
    String(Math.round((await dayFood()).reduce((a, r) => a + (r[k] ?? 0), 0) * 10) / 10).replace('.', ',');
  const fs = await page.locator('.fibsalt').innerText();
  const want = new RegExp(`Фибри\\s+${await sum('fib')} г[\\s\\S]*Сол\\s+${await sum('salt')} г`);
  assert.match(fs, want, 'daily fiber/salt totals');
  console.log('  ✔ 1.3.1 fiber & salt: manual fields (optional), saved, daily totals');

  // 2) Meal edit: tap an item → grams (macros follow) + move to another meal → Undo
  await page.locator('.meal[data-m="breakfast"]').click();
  await layer.locator('.mealitems').waitFor();
  assert.ok(await layer.locator('[data-go="food/add/breakfast"]').count(), '+ Add to breakfast stays');
  await layer.locator('.itembtn', { hasText: 'Баница' }).click();
  await layer.locator('#egrams').waitFor();
  await layer.locator('#egrams').fill('150');
  await layer.locator('#egrams').dispatchEvent('change');
  await settle();
  assert.match(await layer.locator('.kcalbig').innerText(), /^450/);
  await layer.locator('.mealseg [data-v="lunch"]').click();
  await settle();
  await page.waitForTimeout(300);
  await shot('meal-edit');
  await layer.locator('.itemedit [data-act="save"]').click();
  await settle();
  b = await banica();
  assert.deepEqual([b.grams, b.kcal, b.p, b.salt, b.meal], [150, 450, 12, 1.8, 'lunch']);
  assert.match(await page.locator('.toast').innerText(), /Баница: 150 г → Обяд/);
  assert.equal(await page.locator('.toast button, .undopill').count(), 0, '1.3.2: an edit has no Undo');
  await closeAll();
  // …and the Food page behind the sheet is already up to date (1.3.2: no reload needed)
  assert.match(await page.locator('#page .meal[data-m="lunch"]').innerText(), /Баница/);
  // Move it back the same way
  await page.locator('.meal[data-m="lunch"]').click();
  await layer.locator('.itembtn', { hasText: 'Баница' }).click();
  await layer.locator('#egrams').fill('100');
  await layer.locator('#egrams').dispatchEvent('change');
  await layer.locator('.mealseg [data-v="breakfast"]').click();
  await settle();
  await layer.locator('.itemedit [data-act="save"]').click();
  await settle();
  await closeAll();
  b = await banica();
  assert.deepEqual([b.grams, b.kcal, b.salt, b.meal], [100, 300, 1.2, 'breakfast'], 'edited back');
  console.log('  ✔ 1.3.1 meal edit: grams + move (1.3.2: toast only, page refreshed)');

  // 3) Delete → small „Отмени“ pill above the sheet → Undo; the page behind refreshes at once
  const box = (/** @type {import('playwright-core').Locator} */ l) => l.boundingBox();
  const overlaps = (/** @type {any} */ a, /** @type {any} */ c) =>
    a.x < c.x + c.width && c.x < a.x + a.width && a.y < c.y + c.height && c.y < a.y + a.height;
  /** The pill must not sit on any button you can tap (behind an open sheet only the sheet's). */
  const pillClear = async () => {
    const p = await box(page.locator('.undopill'));
    const sel = (await layer.locator('.panel').count())
      ? '#layer .panel button:visible'
      : '#page button:visible, #nav button:visible';
    for (const btn of await page.locator(sel).all()) {
      const q = await box(btn);
      if (q && q.width && overlaps(p, q)) return `covers ${await btn.evaluate((e) => e.outerHTML.slice(0, 120))}`;
    }
    return '';
  };
  await page.locator('.meal[data-m="breakfast"]').click();
  await layer.locator('.mealitems').waitFor();
  await layer.locator('.lrow', { hasText: 'Баница' }).locator('[data-act="del"]').click();
  await settle();
  assert.equal(await banica(), undefined);
  const pill = page.locator('.undopill');
  assert.equal((await pill.innerText()).trim(), 'Отмени');
  assert.match(String(await pill.getAttribute('aria-label')), /Изтрито: Баница/);
  assert.equal(await page.locator('.toast.snack').count(), 0, 'no old snackbar');
  const pb = await box(pill),
    panel = await box(layer.locator('.panel').last());
  assert.ok(pb && panel && pb.y + pb.height <= panel.y + 1, 'the pill sits above the sheet');
  assert.equal(await pillClear(), '', 'the pill covers no button');
  assert.match(await page.locator('.trashlink').innerText(), /\(1\)/, 'the page behind already counts it');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  await shot('undo-pill-meal-sheet', false, true);
  await pill.click();
  await settle();
  b = await banica();
  assert.deepEqual([b.grams, b.fib, b.meal], [100, 1.5, 'breakfast'], 'Undo puts it back');
  assert.match(await layer.locator('.mealitems').innerText(), /Баница/, 'the open sheet shows it again');
  assert.match(await page.locator('#page .meal[data-m="breakfast"]').innerText(), /Баница/, 'and the page');
  assert.doesNotMatch(await page.locator('.trashlink').innerText(), /\(\d+\)/, 'bin count back to 0');
  // The pill hides by itself after 4 s
  await layer.locator('.lrow', { hasText: 'Баница' }).locator('[data-act="del"]').click();
  await pill.waitFor();
  await closeAll();
  await page.waitForTimeout(400);
  const pd = await box(pill),
    nav = await box(page.locator('#nav'));
  assert.ok(pd && nav && pd.y + pd.height <= nav.y, 'without a sheet: just above the nav');
  assert.equal(await pillClear(), '', 'on the Food page the pill covers no button');
  await page.evaluate(() => document.querySelectorAll('.toast').forEach((e) => e.remove()));
  await shot('undo-pill-food-diary', false, true);
  await pill.waitFor({ state: 'detached', timeout: 5000 });
  console.log('  ✔ 1.3.2 delete: Undo pill above the sheet / nav, covers no button, page refreshes, hides after 4 s');

  // Toasts and the pill do not follow you to another page (1.3.2)
  await page.evaluate(() => {
    const el = document.createElement('div');
    el.className = 'toast';
    el.dataset.born = String(Date.now() - 5000);
    el.textContent = 'old';
    document.body.append(el);
  });
  await go('progress');
  assert.equal(await page.locator('.toast, .undopill').count(), 0, 'cleared on navigation');

  // "Наскоро изтрити" from Food keeps the Food tab highlighted; from Profile, Profile
  await go('food');
  await page.locator('.trashlink').click();
  await page.locator('.trashlist').waitFor();
  assert.match(page.url(), /#\/food\/trash$/);
  assert.equal(await page.locator('#nav .t.on').getAttribute('data-go'), 'food', 'Food tab stays on');
  const trow = page.locator('.trow', { hasText: 'Баница' });
  assert.match(await trow.innerText(), /Храна[\s\S]*7 дни/);
  await page.waitForTimeout(300);
  await shot('recently-deleted');
  await trow.locator('[data-act="restore"]').click();
  await settle();
  b = await banica();
  assert.deepEqual([b.grams, b.fib, b.meal], [100, 1.5, 'breakfast'], 'restored as it was');
  await go('profile');
  await page.locator('[data-go="trash"]').click();
  await page.locator('.trash').waitFor();
  assert.equal(await page.locator('#nav .t.on').getAttribute('data-go'), 'profile', 'Profile tab from Profile');
  console.log('  ✔ 1.3.1 Recently deleted (diary + profile), restore; 1.3.2 right tab, toasts cleared on navigation');

  // 4) "Запази като комбинация" in the meal sheet, name pre-selected, required and unique
  await go('food');
  await page.locator('.meal[data-m="breakfast"]').click();
  await layer.locator('.savecombo').click();
  await layer.locator('#mealname').waitFor();
  await page.waitForTimeout(500);
  assert.ok(await nameSelected(), 'default name selected');
  await shot('save-as-combo');
  await layer.locator('#mealname').fill('');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.equal(await layer.locator('#nameerr').innerText(), 'Дай име на комбинацията.', 'an empty name is refused');
  assert.ok(await layer.locator('#mealname').count(), 'the dialog stays open');
  await layer.locator('#mealname').fill('Закуска с баница');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await page.locator('.toast').innerText(), /Закуска с баница/);
  await closeAll();
  const combo = /** @type {any[]} */ (await rows('meals')).find((m) => m.name === 'Закуска с баница');
  assert.ok(combo && combo.items.some((/** @type {any} */ i) => i.name === 'Баница' && i.fib === 1.5));
  await page.locator('.meal[data-m="breakfast"]').click();
  await layer.locator('.savecombo').click();
  await layer.locator('#mealname').fill(' закуска  с БАНИЦА ');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.equal(await layer.locator('#nameerr').innerText(), 'Вече имаш комбинация с това име.', 'no duplicates');
  await closeAll();
  assert.equal((await rows('meals')).length, 1, 'nothing saved twice');
  console.log('  ✔ 1.3.1 save as combination; 1.3.2 the name is required and unique');

  // 4b) Rename a combination in "Редовни хранения"
  await go('food/meals');
  await page.locator('[data-act="rename"]').first().click();
  await layer.locator('#mealname').waitFor();
  await page.waitForTimeout(400);
  assert.ok(await nameSelected(), 'current name selected');
  await page.keyboard.type('Баница сутрин');
  await page.waitForTimeout(200);
  await shot('combo-rename');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.match(await page.locator('.toast').innerText(), /Преименувано: Баница сутрин/);
  assert.match(await page.locator('#page').innerText(), /Баница сутрин/, 'the list shows the new name at once');
  assert.equal((await rows('meals')).find((m) => m.id === combo.id)?.name, 'Баница сутрин');
  console.log('  ✔ 1.3.2 combination rename');

  // 5) Combination chips: first tap selects, second adds to the meal (a toast, no Undo)
  await go('food');
  await go('food/add/snack');
  const chip = page.locator('.chips.combos .chip', { hasText: 'Баница сутрин' });
  const snack0 = (await dayFood()).filter((r) => r.meal === 'snack').length;
  await chip.click();
  await settle();
  assert.equal(await chip.getAttribute('aria-pressed'), 'true');
  assert.match(
    await page.locator('.combohint').innerText(),
    /Баница 100 г[\s\S]*Докосни пак, за да добавиш към междинното хранене/,
  );
  assert.equal((await dayFood()).filter((r) => r.meal === 'snack').length, snack0, 'first tap only selects');
  await page.waitForTimeout(300);
  await shot('combo-chips');
  await chip.click();
  await page.waitForURL(/#\/food$/);
  await settle();
  const snack1 = (await dayFood()).filter((r) => r.meal === 'snack');
  assert.equal(snack1.length, snack0 + combo.items.length, 'second tap adds the whole combination');
  assert.match(
    await page.locator('.toast').innerText(),
    /Добавено в междинно/,
    'the toast survives its own navigation',
  );
  assert.equal(await page.locator('.undopill').count(), 0, 'no Undo for an add');
  console.log('  ✔ 1.3.1 combination chips: select, add (1.3.2: toast only)');

  // 6) Set weight: 0–500 kg, also with the + button
  await go('workouts');
  await page.locator('[data-act="start"]').first().click();
  await page.locator('.step input[data-change="w"]').first().waitFor();
  const wIn = page.locator('.step input[data-change="w"]').first();
  await wIn.fill('9999');
  await wIn.dispatchEvent('change');
  await settle();
  assert.equal(await wIn.inputValue(), '500', 'typed weight capped at 500');
  assert.match(await page.locator('.toast').innerText(), /Най-много 500 кг за серия/);
  await page.locator('.sb[data-act="w"][data-d="1"]').first().click();
  await settle();
  assert.equal(await wIn.inputValue(), '500', '+ stops at 500');
  await wIn.fill('42,5');
  await wIn.dispatchEvent('change');
  await settle();
  assert.equal(await wIn.inputValue(), '42,5', 'Bulgarian decimal comma');
  assert.match(await page.locator('.step small').first().innerText(), /кг/);
  console.log('  ✔ 1.3.2 set weight limited to 0–500 kg, numbers in the Bulgarian format');
  await go('home');

  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  await page.removeLocatorHandler(layer.locator('.dprompt'));
}

/**
 * 1.3.2: "What's new" after an update from 1.3.1 – in Bulgarian, only the 1.3.2 items.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
async function v132(page, { go, settle, clearCel, layer }) {
  await clearCel();
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  // Pretend this install last saw 1.3.1, then open the app again
  await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ id: 'seenWhatsNew', value: '1.3.1' });
          tx.oncomplete = () => (r.result.close(), res(null));
        };
      }),
  );
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await layer.locator('.whatsnew').waitFor({ timeout: 6000 });
  const txt = await layer.innerText();
  assert.match(txt, /Какво ново в 1\.4\.1/);
  assert.match(txt, /илюстрации и описания на техниката/, 'the 1.4.1 item');
  assert.match(txt, /Отмени/, 'the 1.3.2 pill item');
  assert.match(txt, /преименуваш/, 'the 1.3.2 rename item');
  assert.match(txt, /Запиши/, 'the 1.3.3 recording item');
  assert.doesNotMatch(txt, /What's new|Undo|Rename|Record/, 'no English');
  assert.match(txt, /Обратна връзка/, 'the 1.3.4 feedback item');
  assert.equal(await layer.locator('.whatsnew > div').count(), 20, 'the 1.4.1, 1.4.0, 1.3.4, 1.3.3 and 1.3.2 items');
  await layer.locator('[data-close]').first().click();
  await settle();
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log("  ✔ What's new in Bulgarian after an update from 1.3.1 (1.3.4 + 1.3.3 + 1.3.2 items)");
}

/**
 * 1.3.3 (in Bulgarian): in-app recording („Запиши“, mocked MediaRecorder + microphone and a
 * mocked /transcribe) with timer, level meter, „Разпознаване…“, the text in the box for
 * review, the 30 s auto-stop and the errors; Android Chrome keeps „Диктувай“. Then the
 * tester fixes: the Undo pill does not survive a tab switch, gendered combination names and
 * the shorter over-100 text; and the 1.3.3 What's new.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 * @param {string} name profile
 */
async function v133(page, { go, settle, shot, clearCel, layer, rows }, name) {
  const URL = 'https://voice.test';
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
  /** @type {any[]} */
  const stt = [];
  let sttReply = /** @type {any} */ ({ text: 'За обяд изядох 150 г сьомга с ориз и салата от домати.', duration: 4.2 });
  let sttDelay = 900;
  await page.route(`${URL}/**`, async (route) => {
    const req = route.request();
    const u = new globalThis.URL(req.url());
    if (u.pathname === '/health')
      return route.fulfill({
        headers: cors,
        body: JSON.stringify({ ok: true, configured: true, transcribe: true, version: 'mock' }),
      });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/transcribe') {
      stt.push({
        lang: u.searchParams.get('lang'),
        ct: req.headers()['content-type'],
        size: req.postDataBuffer()?.length,
      });
      await new Promise((r) => setTimeout(r, sttDelay));
      if (sttReply === 'abort') return route.abort();
      return route.fulfill({ headers: cors, body: JSON.stringify(sttReply) });
    }
    const b = JSON.parse(req.postData() ?? '{}');
    const lunch = /обяд/.test(b.text);
    const e = (/** @type {any} */ o) => ({
      type: 'food',
      meal: lunch ? 'lunch' : 'breakfast',
      meal_named: lunch,
      date: b.today,
      time: lunch ? null : b.time,
      ...o,
    });
    return route.fulfill({
      headers: cors,
      body: JSON.stringify({
        entries: [
          e({ name: 'сьомга', amount: '150 г', grams: 150, kcal: 312, protein: 30, carbs: 0, fat: 21 }),
          e({ name: 'ориз', amount: '1 порция', grams: 150, kcal: 195, protein: 4, carbs: 42, fat: 0.5 }),
        ],
        model: 'mock',
      }),
    });
  });
  // A fake microphone (a quiet tone, so the level meter moves) and a fake MediaRecorder.
  await page.addInitScript(
    (types) => {
      const w = /** @type {any} */ (window);
      w.__mic = { stopped: 0, opts: null, deny: false };
      if (localStorage.getItem('e2e-no-sr')) {
        delete w.SpeechRecognition;
        delete w.webkitSpeechRecognition;
      }
      // On the prototype: WebKit may hand out a fresh navigator.mediaDevices later.
      const md = globalThis.MediaDevices?.prototype ?? navigator.mediaDevices;
      md.getUserMedia = async () => {
        if (w.__mic.deny) throw new DOMException('denied', 'NotAllowedError');
        const ac = new AudioContext();
        const osc = ac.createOscillator();
        const gain = ac.createGain();
        gain.gain.value = 0.3;
        const dst = ac.createMediaStreamDestination();
        osc.connect(gain).connect(dst);
        osc.start();
        // Count releases (the same track objects every time, also on WebKit).
        const tracks = dst.stream.getTracks();
        for (const tr of tracks) {
          const stop = tr.stop.bind(tr);
          tr.stop = () => (w.__mic.stopped++, stop());
        }
        dst.stream.getTracks = () => tracks;
        return dst.stream;
      };
      w.MediaRecorder = class {
        static isTypeSupported(/** @type {string} */ t) {
          return types.includes(t);
        }
        constructor(/** @type {any} */ _s, /** @type {any} */ o) {
          w.__mic.opts = o;
          this.mimeType = o?.mimeType ?? '';
          this.state = 'inactive';
        }
        start() {
          this.state = 'recording';
        }
        stop() {
          this.state = 'inactive';
          /** @type {any} */ (this).ondataavailable?.({
            data: new Blob([new Uint8Array(6000)], { type: this.mimeType }),
          });
          setTimeout(() => /** @type {any} */ (this).onstop?.(), 0);
        }
      };
    },
    name === 'iphone' ? ['audio/mp4'] : ['audio/webm;codecs=opus', 'audio/webm'],
  );
  await page.evaluate((u) => localStorage.setItem('vf-voice-url', u), URL);
  await clearCel();
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  const open = async () => {
    // 1.3.4: let the post-voice tour finish first, as a person would
    await page.waitForFunction(() => !document.documentElement.classList.contains('vtouring'), null, {
      timeout: 8000,
    });
    await page.reload();
    await page.locator('#nav .t').first().waitFor();
    await layer
      .locator('.whatsnew')
      .waitFor({ timeout: 1500 })
      .then(() => layer.locator('[data-close]').first().click())
      .catch(() => {});
    await go('home');
    await clearCel();
    await page.locator('#page [data-act="voice"]').click({ timeout: 8000 });
    await layer.locator('.voice').waitFor();
  };
  const recBtn = layer.locator('[data-act="record"]');
  /** Wait for the recording state (fails with the sheet's error text, if any). */
  const recording = async () => {
    await layer.locator('.vrec, .verr').first().waitFor();
    if (!(await layer.locator('.vrec').count()))
      assert.fail(`not recording: ${await layer.locator('.verr').innerText()}`);
  };

  if (name === 'android') {
    // Android Chrome keeps the browser's own speech recognition
    await open();
    assert.equal(await layer.locator('[data-act="listen"]').count(), 1, 'Диктувай on Android Chrome');
    assert.equal(await recBtn.count(), 0, 'no recorder there');
    await page.keyboard.press('Escape');
    await settle();
    // An Android browser without working speech recognition gets the recorder
    await page.evaluate(() => localStorage.setItem('e2e-no-sr', '1'));
  }
  await open();
  assert.equal(await layer.locator('[data-act="listen"]').count(), 0, 'no browser dictation button');
  assert.equal((await recBtn.innerText()).trim(), 'Запиши');
  assert.match(await layer.locator('.voice').innerText(), /Докосни „Запиши“/);
  await recBtn.click();
  await recording();
  assert.equal((await recBtn.innerText()).trim(), 'Спри');
  assert.equal(await recBtn.getAttribute('aria-pressed'), 'true');
  const opts = await page.evaluate(() => /** @type {any} */ (window).__mic.opts);
  assert.equal(opts.audioBitsPerSecond, 32000, '32 kbps');
  assert.equal(opts.mimeType, name === 'iphone' ? 'audio/mp4' : 'audio/webm;codecs=opus', 'mp4 first, else webm/opus');
  await page.waitForTimeout(2300);
  assert.match(await layer.locator('.vtimer').innerText(), /^0:0[1-9] \/ 0:30$/, 'timer runs');
  assert.ok(await layer.locator('.vlevel[role="meter"]').count(), 'level meter');
  await shot('voice-recording');
  await recBtn.click();
  await layer.locator('[data-act="record"]', { hasText: 'Разпознаване…' }).waitFor({ timeout: 3000 });
  assert.ok(await recBtn.isDisabled(), 'busy while recognising');
  assert.ok((await page.evaluate(() => /** @type {any} */ (window).__mic.stopped)) >= 1, 'mic released at once');
  await shot('voice-recognising');
  await layer.locator('[data-act="record"]', { hasText: 'Запиши' }).waitFor({ timeout: 5000 });
  assert.equal(
    await layer.locator('#vtext').inputValue(),
    'За обяд изядох 150 г сьомга с ориз и салата от домати.',
    'the text lands in the box for review',
  );
  assert.deepEqual(stt.at(-1), {
    lang: 'bg',
    ct: name === 'iphone' ? 'audio/mp4' : 'audio/webm',
    size: name === 'iphone' ? undefined : 6000, // WebKit does not expose a Blob body to the route
  });
  assert.ok(!(await layer.locator('[data-act="parse"]').isDisabled()), '„Разчети“ is ready');
  await page.waitForTimeout(300);
  await shot('voice-transcribed');
  // „Разчети“ → saved into lunch as before
  await layer.locator('[data-act="parse"]').click();
  await layer.locator('.voice').waitFor({ state: 'detached', timeout: 8000 });
  await page.locator('.toast', { hasText: 'Добавено в обяд' }).waitFor({ timeout: 4000 });
  console.log('  ✔ 1.3.3 Запиши: timer, level, Разпознаване…, mic released, text for review → Разчети');

  // 30 s auto-stop
  await open();
  sttDelay = 50;
  await recBtn.click();
  await recording();
  await page.clock.runFor(31_000);
  await layer.locator('.vrec').waitFor({ state: 'detached', timeout: 5000 });
  await layer.locator('[data-act="record"]', { hasText: 'Запиши' }).waitFor({ timeout: 5000 });
  assert.match(await layer.locator('#vtext').inputValue(), /сьомга/, 'stopped by itself at 30 s and recognised');
  // Errors: microphone denied, nothing heard, no connection
  await layer.locator('#vtext').fill('');
  await page.evaluate(() => /** @type {any} */ (window.__mic.deny = true));
  await recBtn.click();
  await layer.locator('.verr').waitFor();
  assert.match(await layer.locator('.verr').innerText(), /Нямам достъп до микрофона/);
  await shot('voice-mic-denied');
  await page.evaluate(() => /** @type {any} */ (window.__mic.deny = false));
  sttReply = { text: '', duration: 1 };
  await recBtn.click();
  await recording();
  await recBtn.click();
  await layer.locator('.verr', { hasText: 'Не чух нищо' }).waitFor({ timeout: 5000 });
  sttReply = 'abort';
  await recBtn.click();
  await recording();
  await recBtn.click();
  await layer.locator('.verr', { hasText: 'Няма връзка' }).waitFor({ timeout: 5000 });
  assert.equal(await layer.locator('#vtext').inputValue(), '', 'nothing put in the box on errors');
  await page.keyboard.press('Escape');
  await settle();
  console.log('  ✔ 1.3.3 auto-stop at 30 s; errors: mic denied, nothing heard, offline');
  await page.unroute(`${URL}/**`);
  await page.evaluate(() => (localStorage.removeItem('vf-voice-url'), localStorage.removeItem('e2e-no-sr')));

  // (a) The Undo pill does not follow a tab switch and does not come back on Food
  await go('food');
  await page.locator('.meal[data-m="lunch"]').click();
  await layer.locator('.mealitems').waitFor();
  await layer.locator('.lrow', { hasText: 'ориз' }).first().locator('[data-act="del"]').click();
  await page.locator('.undopill').waitFor();
  await page.keyboard.press('Escape');
  await page.locator('#nav [data-go="home"]').click(); // straight away (within a second)
  await page.waitForTimeout(250);
  assert.equal(await page.locator('.undopill').count(), 0, 'gone after the tab switch');
  await page.locator('#nav [data-go="food"]').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('.undopill').count(), 0, 'not back on Food');
  console.log('  ✔ 1.3.3 Undo pill gone on tab switch, not back on Food');

  // (b) Suggested combination names agree with the meal
  for (const [m, want] of [
    ['lunch', 'Обичайният ти обяд'],
    ['breakfast', 'Обичайната ти закуска'],
  ]) {
    if (!(await page.locator(`.meal[data-m="${m}"] .savecombo, .meal[data-m="${m}"]`).count())) continue;
    await page.locator(`.meal[data-m="${m}"]`).click();
    await layer.locator('.mealitems').waitFor();
    if (!(await layer.locator('.savecombo').count())) {
      await page.keyboard.press('Escape');
      continue;
    }
    await layer.locator('.savecombo').click();
    await layer.locator('#mealname').waitFor();
    assert.equal(await layer.locator('#mealname').inputValue(), want);
    if (m === 'lunch') await shot('combo-name-lunch');
    for (let i = 0; i < 3 && (await layer.locator('.panel').count()); i++) {
      await page.keyboard.press('Escape');
      await settle();
    }
  }
  // (c) Shorter over-100 text
  await go('food/add/dinner');
  await page.locator('[data-act="manual"]').first().click();
  await layer.locator('#mname').fill('Тест');
  await layer.locator('#mkcal').fill('100');
  await layer.locator('#mp').fill('101');
  await layer.locator('[data-act="save"]').click();
  await settle();
  assert.equal((await layer.locator('#e_p').innerText()).trim(), 'Най-много 100 г на 100 г продукт.');
  for (let i = 0; i < 3 && (await layer.locator('.panel').count()); i++) {
    await page.keyboard.press('Escape');
    await settle();
  }
  console.log('  ✔ 1.3.3 combination names by gender, „Най-много 100 г на 100 г продукт.“');

  // What's new in 1.3.3 after an update from 1.3.2 (voice deployed → the recording item)
  await page.evaluate(
    () =>
      new Promise((res, rej) => {
        const r = indexedDB.open('vidrichka-fitness');
        r.onerror = () => rej(r.error);
        r.onsuccess = () => {
          const tx = r.result.transaction('kv', 'readwrite');
          tx.objectStore('kv').put({ id: 'seenWhatsNew', value: '1.3.2' });
          tx.oncomplete = () => (r.result.close(), res(null));
        };
      }),
  );
  await page.reload();
  await page.locator('#nav .t').first().waitFor();
  await layer.locator('.whatsnew').waitFor({ timeout: 6000 });
  const txt = await layer.innerText();
  assert.match(txt, /Какво ново в 1\.4\.1/);
  assert.match(txt, /илюстрации и описания на техниката/, 'the 1.4.1 item');
  assert.match(txt, /Запиши/);
  assert.match(txt, /Обичайният ти обяд/);
  assert.equal(await layer.locator('.whatsnew > div').count(), 17, 'the 1.4.1, 1.4.0, 1.3.4 and 1.3.3 items');
  await layer.locator('[data-close]').first().click();
  await settle();
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  void rows;
  console.log("  ✔ What's new in Bulgarian after an update from 1.3.2 (1.3.4 + 1.3.3 items)");
}

/**
 * 1.3.4 (in Bulgarian): What's new + the one-time anonymous-data notice; manual foods sent
 * to /foods with only the allowed fields (none when switched off in Profile); Home meal rows
 * open the meal sheet; the steps card (+1000/+2000, set total, goal → celebration) and the
 * Profile goal; the sleep card; the post-voice tour (1 thing: water glasses fill; 2: quick
 * stops, a tap skips; 5: "Записах 5 неща"; reduced motion); Progress › Графики with 30
 * seeded days and the insight cards; the Profile feedback sheet (dictation, a screenshot,
 * mocked /feedback, thank-you toast).
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 * @param {string} name profile
 */
async function v134(page, { go, settle, shot, clearCel, layer, rows, dayField }, name) {
  const idb = (/** @type {string} */ store, /** @type {any[]} */ put, /** @type {string[]} */ del = []) =>
    page.evaluate(
      ([store, put, del]) =>
        new Promise((res, rej) => {
          const r = indexedDB.open('vidrichka-fitness');
          r.onerror = () => rej(r.error);
          r.onsuccess = () => {
            const tx = r.result.transaction(/** @type {string} */ (store), 'readwrite');
            /** @type {any[]} */ (put).forEach((x) => tx.objectStore(/** @type {string} */ (store)).put(x));
            /** @type {string[]} */ (del).forEach((k) => tx.objectStore(/** @type {string} */ (store)).delete(k));
            tx.oncomplete = () => (r.result.close(), res(null));
          };
        }),
      /** @type {const} */ ([store, put, del]),
    );
  const today = () =>
    page.evaluate(() => {
      const d = new Date();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    });
  const reopen = async () => {
    await page.reload();
    await page.locator('#nav .t').first().waitFor();
    await settle();
  };
  const PUSH = 'https://push.test';
  const cors = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
  /** @type {any[]} */
  const foods = [];
  /** @type {any[]} */
  const feedback = [];
  await page.route(`${PUSH}/**`, async (route) => {
    const req = route.request();
    const u = new globalThis.URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/foods') {
      foods.push({ body: JSON.parse(req.postData() ?? '{}'), headers: req.headers() });
      return route.fulfill({ status: 204, headers: cors });
    }
    if (u.pathname === '/feedback') {
      feedback.push({ body: JSON.parse(req.postData() ?? '{}'), headers: req.headers() });
      return route.fulfill({ status: 201, headers: cors, body: JSON.stringify({ ok: true, id: feedback.length }) });
    }
    return route.fulfill({ status: 404, headers: cors, body: '{}' });
  });
  const VOICE = 'https://voice.test';
  /** @type {(b: any) => any[]} */
  let reply = () => [];
  await page.route(`${VOICE}/**`, async (route) => {
    const req = route.request();
    const u = new globalThis.URL(req.url());
    if (u.pathname === '/health')
      return route.fulfill({
        headers: cors,
        body: JSON.stringify({ ok: true, configured: true, transcribe: true, version: 'mock' }),
      });
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (u.pathname === '/transcribe')
      return route.fulfill({
        headers: cors,
        body: JSON.stringify({ text: 'Искам графика и за пулса.', duration: 2 }),
      });
    const b = JSON.parse(req.postData() ?? '{}');
    return route.fulfill({ headers: cors, body: JSON.stringify({ entries: reply(b) }) });
  });
  await page.evaluate(
    ([p, v]) => (localStorage.setItem('vf-push-url', p), localStorage.setItem('vf-voice-url', v)),
    [PUSH, VOICE],
  );
  await clearCel();
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();

  // 1) What's new in 1.3.4 after an update from 1.3.3, then the anonymous-data notice once
  await idb('kv', [{ id: 'seenWhatsNew', value: '1.3.3' }], ['dataNotice']);
  await reopen();
  await layer.locator('.whatsnew').waitFor({ timeout: 6000 });
  const txt = await layer.innerText();
  assert.match(txt, /Какво ново в 1\.4\.1/);
  assert.match(txt, /илюстрации и описания на техниката/, 'the 1.4.1 item');
  assert.match(txt, /крачки/i);
  assert.match(txt, /Обратна връзка/);
  assert.doesNotMatch(txt, /Обичайният ти обяд/, 'no 1.3.3 items after 1.3.3');
  assert.equal(await layer.locator('.whatsnew > div').count(), 15, 'the 1.4.1 item, eight 1.4.0 and six 1.3.4 items');
  await page.waitForTimeout(700);
  await shot('whats-new-134');
  await layer.locator('[data-close]').first().click();
  // 1.4.0: no notice after the update – it waits for the first manual food (below)
  await settle();
  assert.equal(await page.locator('.datanotice').count(), 0, 'no notice at start-up');
  console.log("  ✔ 1.3.4 What's new, no data notice at start-up");

  // 2) Manual food → POST /foods with only the allowed fields; nothing when switched off
  await page.route('**/*openfoodfacts.org/**', (r) =>
    r.fulfill({ json: { count: 0, products: [] }, headers: { 'access-control-allow-origin': '*' } }),
  );
  let first = true;
  const manual = async (/** @type {string} */ n, /** @type {string} */ meal) => {
    await go(`food/add/${meal}`);
    await page.locator('[data-act="manual"]').first().click();
    await layer.locator('#mname').fill(n);
    await layer.locator('#mkcal').fill('165');
    await layer.locator('#mp').fill('10');
    await layer.locator('#mc').fill('20');
    await layer.locator('#mf').fill('5');
    await layer.locator('#mfib').fill('3');
    await layer.locator('#msalt').fill('0,8');
    await layer.locator('[data-act="save"]').click();
    if (first) {
      // the one-time notice, shown before anything is sent
      await layer.locator('.datanotice').waitFor({ timeout: 4000 });
      assert.match(await layer.innerText(), /се изпращат анонимно/);
      assert.equal(foods.length, 0, 'nothing sent before the notice is closed');
      await page.waitForTimeout(400);
      await shot('data-notice');
      await layer.locator('[data-close]').last().click();
      first = false;
    }
    await layer.locator('#grams').waitFor();
    await layer.locator('[data-act="done"]').click();
    await settle();
    await page.waitForTimeout(400);
  };
  await manual('Домашна баничка', 'breakfast');
  assert.equal(foods.length, 1, 'one /foods request');
  assert.deepEqual(foods[0].body, {
    name: 'Домашна баничка',
    kcal: 165,
    protein: 10,
    carbs: 20,
    fat: 5,
    fiber: 3,
    salt: 0.8,
    lang: 'bg',
  });
  assert.match(foods[0].headers['content-type'], /^text\/plain/, 'a simple request');
  assert.equal(foods[0].headers.cookie, undefined, 'no cookies');
  await go('profile');
  const sw = page.locator('#sharefoods [data-act="tg"]');
  assert.equal(await sw.getAttribute('aria-checked'), 'true', 'on by default');
  assert.match(await page.locator('#sharefoods').innerText(), /Помогни да подобрим приложението/);
  await sw.click();
  await settle();
  assert.equal(await sw.getAttribute('aria-checked'), 'false');
  await page.locator('#sharefoods').scrollIntoViewIfNeeded();
  await shot('data-switch-profile');
  await manual('Мусака на мама', 'lunch');
  assert.equal(foods.length, 1, 'switched off → nothing sent');
  await go('profile');
  await page.locator('#sharefoods [data-act="tg"]').click();
  await settle();
  console.log('  ✔ 1.3.4 manual foods shared anonymously (only name + per-100 g values), switch stops it');

  // 3) Home: a filled meal opens the Food meal sheet, an empty one opens Add food
  await go('home');
  const filled = page.locator('.homemeals .meal[data-m="breakfast"]');
  assert.equal(await filled.getAttribute('data-act'), 'dayMeal');
  await filled.scrollIntoViewIfNeeded();
  await filled.click();
  await layer.locator('.mealitems').waitFor();
  assert.match(await layer.innerText(), /Домашна баничка/);
  assert.match(await layer.innerText(), /Запази като комбинация/i);
  await page.waitForTimeout(600);
  await shot('home-meal-sheet');
  await page.keyboard.press('Escape');
  await settle();
  const empty = page.locator('.homemeals .meal[data-go^="food/add/"]').first();
  if (await empty.count()) {
    await empty.click();
    await settle();
    assert.match(await page.evaluate(() => location.hash), /#\/food\/add\//, 'an empty meal opens Add food');
  }
  console.log('  ✔ 1.3.4 Home meal rows open the meal sheet');

  // 4) Steps: +2000, set the total, reach the goal → celebration; Profile goal stepper
  await go('home');
  const card = page.locator('.stepscard');
  await card.scrollIntoViewIfNeeded();
  const s0 = (await dayField('steps')) ?? 0;
  await card.locator('[data-act="stepsAdd"][data-n="2000"]').click();
  await settle();
  assert.equal(await dayField('steps'), s0 + 2000);
  await card.locator('[data-act="stepsSheet"]').click();
  await layer.locator('#stepsin').fill('6500');
  await layer.locator('[data-act="set"]').click();
  await settle();
  assert.equal(await dayField('steps'), 6500, 'set the day total');
  assert.match(await page.locator('.stepscard').innerText(), /6\s?500/);
  await page.locator('.stepscard').scrollIntoViewIfNeeded();
  await shot('steps-card');
  await page.locator('.stepscard [data-act="stepsAdd"][data-n="2000"]').click();
  await page.locator('#cel > *').first().waitFor({ timeout: 4000 });
  assert.match(await page.locator('#cel').innerText(), /крачки/i, 'goal celebration');
  await clearCel();
  assert.ok(page.locator('.stepscard.done'), 'goal met');
  await page.locator('.stepscard [data-act="stepsAdd"][data-n="1000"]').click();
  await page.waitForTimeout(600);
  assert.equal(await page.locator('#cel > *').count(), 0, 'the goal celebrates once a day');
  await go('profile');
  const goal = page.locator('#stepgoal');
  await goal.scrollIntoViewIfNeeded();
  assert.equal(await goal.locator('input').inputValue(), '8000', 'default goal');
  await goal.locator('[data-d="1"]').click();
  await settle();
  assert.equal(await page.locator('#stepgoal input').inputValue(), '8500');
  await page.locator('#stepgoal').scrollIntoViewIfNeeded();
  await shot('steps-goal-profile');
  await page.locator('#stepgoal [data-d="-1"]').click();
  await settle();
  console.log('  ✔ 1.3.4 steps card, goal celebration once, Profile goal');

  // 5) Sleep card: hours (½ h) + quality
  await go('home');
  await page.locator('.sleepcard').scrollIntoViewIfNeeded();
  await page.locator('.sleepcard').click();
  await layer.locator('[data-act="h"][data-d="1"]').click();
  await layer.locator('[data-act="rate"][data-v="4"]').click();
  await settle();
  // 1.4.0: the sheet starts at the suggested 7,5 h, so +½ h gives 8
  assert.equal(await dayField('sleepH'), 8);
  assert.equal(await dayField('sleepQ'), 4);
  assert.equal(await layer.locator('[data-act="clear"]').count(), 1, 'a saved entry can be deleted');
  await layer.locator('[data-act="done"]').click();
  await settle();
  assert.match(await page.locator('.sleepcard').innerText(), /\b8\b/);
  await page.locator('.sleepcard').scrollIntoViewIfNeeded();
  await shot('sleep-card');
  console.log('  ✔ 1.3.4 sleep card');

  // 6) Voice tour
  await reopen();
  const glasses = async () => {
    const d = await today();
    return /** @type {any[]} */ (await rows('food')).find((r) => r.id === `water_${d}`)?.glasses ?? 0;
  };
  const say = async (/** @type {string} */ text) => {
    await go('home');
    await clearCel();
    await page.locator('#page [data-act="voice"]').first().click({ timeout: 8000 });
    await layer.locator('#vtext').fill(text);
    await layer.locator('[data-act="parse"]').click();
    await layer.locator('#vtext').waitFor({ state: 'detached' });
  };
  const touring = () => page.evaluate(() => document.documentElement.classList.contains('vtouring'));
  const base = (/** @type {any} */ b) => ({ meal: 'snack', date: b.today, time: b.time });
  // one thing: water → Food, the new glasses fill one by one, then one small celebration
  reply = (b) => [{ type: 'water', amount_ml: 500, ...base(b) }];
  let w0 = await glasses();
  await say('изпих две чаши вода');
  await page.locator('.food .water.vtour').waitFor({ timeout: 4000 });
  await page.locator('.food .water .glass.vpop').waitFor({ timeout: 3000 });
  assert.match(await page.evaluate(() => location.hash), /#\/food/);
  await page.waitForTimeout(150);
  await shot('voice-anim-water', false, true);
  await page.waitForFunction(() => !document.documentElement.classList.contains('vtouring'), null, {
    timeout: 8000,
  });
  await page.locator('#cel > *').first().waitFor({ timeout: 3000 });
  await clearCel();
  assert.equal(await glasses(), w0 + 2);
  // two things: quick stops; a tap skips to the end (still saved, the toast stays)
  reply = (b) => [
    { type: 'water', amount_ml: 250, ...base(b) },
    { type: 'steps', value: 1500, total: false, ...base(b) },
  ];
  w0 = await glasses();
  const st0 = (await dayField('steps')) ?? 0;
  await say('чаша вода и 1500 крачки');
  await page.waitForFunction(() => document.documentElement.classList.contains('vtouring'), null, {
    timeout: 4000,
  });
  await page.evaluate(() => dispatchEvent(new PointerEvent('pointerdown')));
  await page.waitForFunction(() => !document.documentElement.classList.contains('vtouring'), null, {
    timeout: 1500,
  });
  assert.equal(await glasses(), w0 + 1);
  assert.equal(await dayField('steps'), st0 + 1500);
  assert.equal((await page.locator('.undopill, .toast').count()) > 0, true, 'the toast/Undo pill stays');
  await clearCel();
  // five things: no tour, "Записах 5 неща" + one celebration
  reply = (b) => [
    { type: 'water', amount_ml: 250, ...base(b) },
    { type: 'steps', value: 5000, total: true, ...base(b) },
    { type: 'sleep', value: 7, quality: null, ...base(b) },
    { type: 'mood', value: 4, ...base(b) },
    { type: 'energy', value: 5, ...base(b) },
  ];
  await say('чаша вода, общо 5000 крачки, спах 7 часа, настроение 4, енергия 5');
  await page.locator('.toast').waitFor();
  assert.match(await page.locator('.toast').innerText(), /Записах 5 неща/);
  await page.locator('#cel > *').first().waitFor({ timeout: 4000 });
  await page.waitForTimeout(300);
  await shot('voice-anim-summary', false, true);
  await clearCel();
  assert.equal(await dayField('steps'), 5000, '"общо" sets the total');
  assert.equal(await dayField('sleepH'), 7);
  assert.equal(await dayField('mood'), 4);
  assert.equal(await dayField('energy'), 5);
  // reduced motion: no glass-by-glass fill, a short stop
  await page.emulateMedia({ reducedMotion: 'reduce' });
  reply = (b) => [{ type: 'water', amount_ml: 500, ...base(b) }];
  await say('две чаши вода');
  const t0 = Date.now();
  await page.waitForFunction(() => !document.documentElement.classList.contains('vtouring'), null, {
    timeout: 3000,
  });
  assert.ok(Date.now() - t0 < 2500, 'reduced motion: a short stop');
  assert.equal(await page.locator('.glass.vpop').count(), 0);
  void touring;
  await page.emulateMedia({ reducedMotion: 'no-preference' });
  await clearCel();
  console.log('  ✔ 1.3.4 voice tour: water fill, quick stops + tap to skip, 5-thing summary, reduced motion');

  // 7) Progress › Графики with 30 seeded days → charts + insight cards
  const keys = await page.evaluate(() =>
    Array.from({ length: 30 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - i - 1);
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }),
  );
  const oldDays = /** @type {any[]} */ (await rows('days'));
  await idb(
    'days',
    keys.map((id, i) => {
      const good = i % 2 === 0;
      return {
        ...(oldDays.find((r) => r.id === id) ?? {}),
        id,
        steps: good ? 9200 + i * 10 : 4100 + i * 10,
        sleepH: good ? 8 : 6,
        mood: good ? 4 : 3,
        energy: good ? 4 : 2,
      };
    }),
  );
  await idb('food', [
    ...keys.map((date, i) => ({ id: `water_${date}`, type: 'water', date, glasses: i % 2 === 0 ? 8 : 5 })),
    ...keys.map((date, i) => ({
      id: `seed134_${i}`,
      date,
      meal: 'lunch',
      name: 'Обяд',
      emoji: '🍲',
      grams: 400,
      kcal: 1500 + (i % 5) * 80,
      p: 70 + (i % 4) * 6,
      c: 160,
      f: 55,
      fib: 18 + (i % 3) * 3,
      salt: 4 + (i % 3) * 0.6,
      time: '12:30',
      ts: Date.parse(`${date}T12:30:00`),
    })),
  ]);
  await idb(
    'sessions',
    keys
      .filter((_, i) => i % 3 === 0)
      .map((date, i) => ({
        id: `seed134s_${i}`,
        name: 'Цяло тяло',
        startedAt: Date.parse(`${date}T18:00:00`),
        endedAt: Date.parse(`${date}T18:40:00`),
        durationSec: 2400,
        items: [],
        setsDone: 12,
        setsPlanned: 12,
        volume: 3200 + i * 150,
        prs: [],
        kcal: 180,
        xp: 60,
      })),
  );
  await reopen();
  await clearCel();
  await go('progress/trends');
  for (const c of ['.ch-steps', '.ch-mood', '.ch-sleep', '.ch-water', '.ch-food', '.ch-work'])
    assert.equal((await page.locator(`${c} svg`).count()) > 0, true, `${c} chart`);
  const ins = page.locator('.insight[data-insight]');
  assert.ok((await ins.count()) >= 1 && (await ins.count()) <= 2, 'one or two insight cards');
  assert.equal(await page.locator('.insight[data-insight="sleepEnergy"]').count(), 1, 'sleep ↔ energy');
  assert.match(await page.locator('.ch-steps').innerText(), /8\s?000/, 'the goal line');
  await page.evaluate(() => scrollTo(0, 0));
  await shot('insights');
  // the whole Графики tab in one picture (the fixed tab bar hidden so it is not drawn mid-page)
  await page.addStyleTag({ content: '#nav{display:none!important}' }).then(async (h) => {
    await shot('progress-charts', true);
    await h.evaluate((e) => e.remove());
  });
  for (const r of ['month', '3m', 'week']) {
    await page.locator(`[data-act="trange"][data-v="${r}"]`).click();
    await settle();
    assert.equal(await page.locator(`[data-act="trange"][data-v="${r}"]`).getAttribute('aria-selected'), 'true');
    assert.ok((await page.locator('#page svg').count()) >= 6);
  }
  console.log('  ✔ 1.3.4 Progress › Графики (week / month / 3 months) + insight cards');

  // 8) Feedback: only in Profile; dictation lands in the box, a screenshot, send → thanks
  await go('home');
  assert.equal(await page.locator('[data-act="feedback"]').count(), 0, 'no feedback entry on Home');
  await go('profile');
  await page.locator('#feedbackrow').scrollIntoViewIfNeeded();
  await page.locator('#feedbackrow').click();
  await layer.locator('.fbsheet').waitFor();
  const rec = layer.locator('[data-act="record"]');
  if (await rec.count()) {
    await rec.click();
    await layer.locator('.vrec').waitFor({ timeout: 4000 });
    await page.waitForTimeout(1200);
    await rec.click();
    await page.waitForFunction(
      () => /** @type {HTMLTextAreaElement|null} */ (document.getElementById('fbtext'))?.value.includes('пулса'),
      null,
      { timeout: 6000 },
    );
  } else await layer.locator('#fbtext').fill('Искам графика и за пулса.');
  await layer.locator('#fbtext').fill('Искам графика и за пулса. И тъмна тема за графиките.');
  const fs = await import('node:fs/promises');
  await layer
    .locator('input[type="file"]')
    .setInputFiles({ name: 'shot.png', mimeType: 'image/png', buffer: await fs.readFile('screenshots/home-BG.png') });
  await layer.locator('.fbimg img').first().waitFor({ timeout: 8000 });
  await page.waitForTimeout(500);
  await shot('feedback-sheet');
  await layer.locator('[data-act="send"]').click();
  await layer.locator('.fbthanks').waitFor({ timeout: 8000 });
  assert.match(await layer.locator('.fbthanks').innerText(), /Благодар/);
  assert.equal(feedback.length, 1);
  const fb = feedback[0].body;
  assert.deepEqual(Object.keys(fb).sort(), ['images', 'lang', 'text', 'version']);
  assert.match(fb.text, /пулса/);
  assert.equal(fb.lang, 'bg');
  assert.match(fb.version, /^1\.(3\.4|4\.\d)/);
  assert.equal(fb.images.length, 1);
  assert.equal(fb.images[0].mime, 'image/jpeg');
  const bytes = Buffer.from(fb.images[0].data, 'base64');
  assert.ok(bytes.length <= 300000, `image ≤ 300 KB (${bytes.length})`);
  assert.deepEqual([...bytes.subarray(0, 3)], [0xff, 0xd8, 0xff], 'a JPEG');
  assert.equal(feedback[0].headers.cookie, undefined);
  // 1.4.0: a thank-you screen instead of a toast, then Done closes the sheet
  await layer.locator('.fbthanks').waitFor({ timeout: 4000 });
  await layer.locator('.fbthanks [data-act="close"]').click();
  await settle();
  assert.equal(await layer.locator('.fbsheet').count(), 0, 'the sheet closes');

  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  await page.evaluate(() => (localStorage.removeItem('vf-push-url'), localStorage.removeItem('vf-voice-url')));
  void name;
  console.log('  ✔ 1.3.4 feedback from Profile (dictation, screenshot ≤ 300 KB JPEG, thanks)');
}

/**
 * 1.4.0 day history: a past calendar day opens the shared day cards, edits land on THAT date
 * (not today), water − never goes below 0, and future days are not tappable or editable.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 */
/** Close every open sheet (Escape, a few times). @param {any} page @param {any} layer @param {() => Promise<void>} settle */
async function closeAllSheets(page, layer, settle) {
  for (let i = 0; i < 5 && (await layer.locator('.panel').count()); i++) {
    await page.keyboard.press('Escape');
    await settle();
  }
}

async function v140(page, { go, settle, shot, layer, rows }) {
  const key = await page.evaluate(() => {
    const d = new Date();
    d.setDate(d.getDate() - 2);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  });
  const dayRow = async () => {
    await page.waitForTimeout(150);
    return /** @type {any[]} */ (await rows('days')).find((x) => x.id === key) ?? {};
  };
  const before = (await dayRow()).steps ?? 0;
  await go('progress/calendar');
  await page.locator('.cal').waitFor();
  for (const el of await page.locator('.cal .future').all())
    assert.equal(await el.evaluate((e) => e.tagName), 'SPAN', 'future days are not buttons');
  await page.locator(`.cal [data-go="day/${key}"]`).click();
  await page.locator('.dayview').waitFor();
  for (const sel of ['.stepscard', '.sleepcard', '.homemeals', '.dayworkouts'])
    assert.equal(await page.locator(`.dayview ${sel}`).count(), 1, `${sel} on the day view`);
  await page.locator('.dayview [data-act="stepsAdd"][data-n="1000"]').click();
  await settle();
  assert.equal((await dayRow()).steps, before + 1000, 'steps added to the past day');
  // water: − (left) … glasses … + (right); − is disabled at 0
  const w0 = await page.locator('.dayview .glasses .glass.on').count();
  if (w0 === 0) assert.ok(await page.locator('.dayview .waterminus').isDisabled(), '− disabled at 0');
  await page.locator('.dayview .waterplus').click();
  await settle();
  await page.locator('.dayview .waterminus').click();
  await settle();
  assert.equal(await page.locator('.dayview .glasses .glass.on').count(), w0, '+ then − returns to the start');
  if (w0 === 0) assert.ok(await page.locator('.dayview .waterminus').isDisabled(), 'never below 0');
  const order = await page
    .locator('.dayview .water > button, .dayview .water > .glasses')
    .evaluateAll((els) => els.map((e) => e.className.split(' ').find((c) => /water(minus|plus)|glasses/.test(c))));
  assert.deepEqual(order.filter(Boolean), ['waterminus', 'glasses', 'waterplus'], 'minus, glasses, plus');
  await page.evaluate(() => scrollTo(0, 0));
  await shot('day-view');

  // Sleep from a screenshot (tester bug): 7 h 20 min is saved as read (not the 7.5 h default),
  // shown as "7 ч 20 мин", the date field is wide enough, and a quality can be picked.
  await page.evaluate(() => localStorage.setItem('vf-voice-url', 'https://voice.test'));
  await page.route(/^https:\/\/voice\.test\/vision/, (route) =>
    route.request().method() === 'OPTIONS'
      ? route.fulfill({
          status: 204,
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          },
        })
      : route.fulfill({
          headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' },
          body: JSON.stringify({ days: [{ date: key, hours: 7 + 20 / 60, quality: null }], via: 'mock' }),
        }),
  );
  await page.locator('.dayview [data-act="sleepShot"]').click();
  const fsp = await import('node:fs/promises');
  await layer
    .locator('input[type="file"]')
    .setInputFiles({ name: 's.png', mimeType: 'image/png', buffer: await fsp.readFile('assets/icons/icon-192.png') });
  await layer.locator('.shotrow, .verr').first().waitFor({ timeout: 8000 });
  assert.equal(await layer.locator('.verr').count(), 0, `screenshot read: ${await layer.innerText()}`);
  assert.equal(await layer.locator('[data-change="hh"]').inputValue(), '7');
  assert.equal(await layer.locator('[data-change="mm"]').inputValue(), '20');
  const dw = (await layer.locator('.shotrow input[type="date"]').boundingBox())?.width ?? 0;
  assert.ok(dw >= 150, `date field readable (${dw}px)`);
  await layer.locator('.shotq [data-v="4"]').click();
  await shot('sleep-shot');
  await layer.locator('[data-act="save"]').click();
  await settle();
  const sl = await dayRow();
  assert.ok(Math.abs(sl.sleepH - (7 + 20 / 60)) < 0.01, `7 h 20 min saved (${sl.sleepH})`);
  assert.equal(sl.sleepQ, 4);
  assert.match(await page.locator('.dayview .sleepcard').innerText(), /7 (ч|h) 20 (мин|min)/);
  // round 3: a night without bed/wake times has no "– → –" in Progress › Sleep
  await go('progress/sleep');
  await page.locator('.sbars').waitFor();
  assert.doesNotMatch(await page.locator('.content').innerText(), /– → –/);
  await go('day/2099-01-01');
  assert.equal(await page.locator('.dayview .stepscard').count(), 0, 'no cards for a future day');
  assert.equal(await layer.locator('.panel').count(), 0);
  console.log(
    '  ✔ 1.4.0 day history: past day opens, edits land on that date, water −/+, sleep screenshot 7 ч 20 мин, no future days',
  );

  // Online food search never hangs on "Търся…": local results at once, then a clear
  // "not available" + retry; a barcode-style product keeps one brand and shows "–" for
  // what it does not list.
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  // round 3: weight step in Bulgarian format
  assert.match(await page.locator('[data-act="wstep"][data-v="2.5"]').innerText(), /^2,5$/);
  // 1.4.0 round 3: the search goes through the Worker's /off-search (one request per search,
  // debounced), never straight to OFF (whose search endpoints have no usable CORS)
  /** @type {string[]} */
  const offCalls = [];
  const countOff = (/** @type {any} */ r) => /openfoodfacts\.org|\/off-search/.test(r.url()) && offCalls.push(r.url());
  page.on('request', countOff);
  await page.unroute('**/*openfoodfacts.org/**');
  await page.route('**/*openfoodfacts.org/**', (r) => r.abort());
  await page.route(/^https:\/\/voice\.test\/off-search/, (r) => r.abort());
  await go('food/add/lunch');
  await page.locator('#fq').pressSequentially('банан', { delay: 40 });
  assert.ok((await page.locator('#results .lrow').count()) > 0, 'local results show at once');
  await page.locator('#offres .offfail').waitFor({ timeout: 12000 });
  assert.equal(await page.locator('#offres .offbusy').count(), 0, 'the spinner is gone');
  assert.equal(offCalls.length, 1, `one request per search: ${offCalls.join(', ')}`);
  assert.match(offCalls[0], /^https:\/\/voice\.test\/off-search\?q=%D0%B1%D0%B0%D0%BD%D0%B0%D0%BD&lang=bg$/);
  await page.unroute(/^https:\/\/voice\.test\/off-search/);
  await page.route(/^https:\/\/voice\.test\/off-search/, (r) =>
    r.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        count: 1,
        products: [
          {
            code: '3017620422003',
            product_name: 'Nutella банан',
            brands: 'Nutella,Ferrero',
            nutriments: { 'energy-kcal_100g': 539, proteins_100g: 6.3, fat_100g: 30.9 },
          },
        ],
      },
    }),
  );
  await page.locator('#offres [data-act="retryOff"]').click();
  await page.locator('#offres .lrow').first().waitFor({ timeout: 12000 });
  const offName = await page.locator('#offres .lrow').first().innerText();
  assert.match(offName, /Nutella банан/);
  assert.doesNotMatch(offName, /Nutella банан · Nutella/, 'brand not repeated');
  await page.locator('#offres .lrow').first().click();
  const g = await layer.locator('.panel').last().innerText();
  assert.match(g, /В –/, 'unknown carbs show "–"');
  assert.match(g, /Фибри –/, 'unknown fibre shows "–"');
  // final fix (b): the missing values are named, counted as 0, and the user is taken to them
  assert.match(
    await layer.locator('.panel .missnote').last().innerText(),
    /Липсват стойности за въглехидрати, фибри, сол – броят се като 0\. Попълни ги\./,
  );
  await layer.locator('.panel .missnote [data-act="fix"]').last().click();
  await settle();
  assert.match(await layer.locator('.panel').last().innerText(), /Попълни стойностите/);
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'mc', 'focus on the first missing value');
  assert.equal(await layer.locator('#mc.missing').count(), 1, 'the missing field is marked');
  assert.equal(await layer.locator('#mkcal').inputValue(), '539', 'known values are prefilled');
  await layer.locator('#mc').fill('57,5');
  await layer.locator('[data-act="save"]').last().click();
  await settle();
  const g2 = await layer.locator('.panel').last().innerText();
  assert.match(g2, /В \d+ г/, 'carbs now counted');
  assert.equal(await layer.locator('.panel .missnote').count(), 0, 'notice gone after filling in');
  await layer.locator('.panel [data-act="done"]').last().click();
  await settle();
  await page.waitForTimeout(300);
  const fixedFood = /** @type {any[]} */ (await rows('foods')).find((f) => f.id === 'off_3017620422003');
  assert.equal(fixedFood?.c, 57.5, 'the corrected value is saved with that food');
  const logged = /** @type {any[]} */ (await rows('food')).filter((r) => r.foodId === 'off_3017620422003');
  assert.ok(logged.length && logged.every((r) => !r.missing && r.c > 0), 'diary row uses the filled-in carbs');
  // final fix (c): impossible values are filtered out; nothing reliable → "enter it yourself"
  await page.unroute(/^https:\/\/voice\.test\/off-search/);
  await page.route(/^https:\/\/voice\.test\/off-search/, (r) =>
    r.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        count: 1,
        products: [
          {
            code: '111',
            product_name: 'Нутела крем',
            nutriments: { 'energy-kcal_100g': 5, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 },
          },
        ],
      },
    }),
  );
  await page.locator('#fq').fill('');
  await page.locator('#fq').pressSequentially('нутела крем', { delay: 30 });
  await page.locator('#results .noreliable').waitFor({ timeout: 12000 });
  assert.match(
    await page.locator('#results .noreliable').innerText(),
    /Няма надежден резултат за тази храна\. Въведи я сам\./,
  );
  assert.equal(await page.locator('#offres .lrow').count(), 0, 'the 5 kcal product is not shown');
  assert.equal(await page.locator('#results [data-act="manual"]').count(), 1, 'one "enter it yourself" button');
  await page.locator('#results .noreliable [data-act="manual"]').click();
  await settle();
  assert.equal(await layer.locator('#mname').inputValue(), 'нутела крем', 'the searched name is prefilled');
  assert.equal(await layer.locator('#mkcal').inputValue(), '', 'an empty form');
  await page.keyboard.press('Escape');
  await settle();
  // barcode: an implausible product = not found + the same message; a product with a missing
  // macro opens with the notice (typed code: no camera in the test browser)
  await page.route(/world\.openfoodfacts\.org\/api\/v2\/product\/(\d+)/, (r) => {
    const code = /product\/(\d+)/.exec(r.request().url())?.[1];
    const nutr =
      code === '5000000000001'
        ? { 'energy-kcal_100g': 5, proteins_100g: 6.3, carbohydrates_100g: 57.5, fat_100g: 30.9 }
        : { 'energy-kcal_100g': 120, proteins_100g: 20, fat_100g: 4, salt_100g: 0.2, fiber_100g: 0 };
    return r.fulfill({
      headers: { 'access-control-allow-origin': '*' },
      json: {
        status: 1,
        product: {
          code,
          product_name: code === '5000000000001' ? 'Крем лешник' : 'Протеинов пудинг',
          nutriments: nutr,
        },
      },
    });
  });
  await page.locator('#fq').fill('');
  await settle();
  await page.locator('[data-act="scan"]').first().click();
  await settle();
  await layer.locator('#bcode').fill('5000000000001');
  await layer.locator('[data-act="lookup"]').click();
  await page.locator('#scanstatus', { hasText: 'Няма надежден резултат' }).waitFor({ timeout: 12000 });
  assert.match(await layer.locator('.panel [data-act="manual"]').last().innerText(), /Въведи храната сам/);
  await layer.locator('.panel [data-act="manual"]').last().click();
  await settle();
  assert.equal(await layer.locator('#mname').inputValue(), 'Крем лешник', 'the product name is prefilled');
  await page.keyboard.press('Escape');
  await settle();
  await page.locator('[data-act="scan"]').first().click();
  await settle();
  await layer.locator('#bcode').fill('5000000000002');
  await layer.locator('[data-act="lookup"]').click();
  await layer.locator('.panel .missnote').waitFor({ timeout: 12000 });
  assert.match(
    await layer.locator('.panel .missnote').innerText(),
    /Липсва стойност за въглехидрати – брои се като 0\. Попълни я\./,
  );
  await layer.locator('.panel [data-act="done"]').last().click();
  await settle();
  await page.waitForTimeout(300);
  const pud = /** @type {any[]} */ (await rows('food')).find((r) => r.foodId === 'off_5000000000002');
  assert.ok(pud && pud.c === 0 && pud.missing?.includes('c'), 'saved without the fix: counted as 0, still marked');
  // …and can be filled in afterwards from the diary item
  await go('food');
  await page.locator('.meal[data-m="lunch"]').click();
  await layer.locator('.itembtn', { hasText: 'Протеинов пудинг' }).click();
  await layer.locator('.itemedit .missnote').waitFor();
  await layer.locator('.itemedit .missnote [data-act="fix"]').click();
  await settle();
  assert.equal(await page.evaluate(() => document.activeElement?.id), 'mc');
  await layer.locator('#mc').fill('3');
  await layer.locator('[data-act="save"]').last().click();
  await settle();
  assert.equal(await layer.locator('.itemedit .missnote').count(), 0, 'notice gone in the item sheet');
  await page.waitForTimeout(300);
  const pud2 = /** @type {any[]} */ (await rows('food')).find((r) => r.id === pud.id);
  assert.ok(pud2 && !pud2.missing && pud2.c > 0, `the diary row now counts the carbs (${pud2?.c})`);
  await closeAllSheets(page, layer, settle);
  await page.unroute(/world\.openfoodfacts\.org\/api\/v2\/product\/(\d+)/);
  assert.ok(
    !offCalls.some((u) => u.includes('openfoodfacts.org') && !u.includes('/api/v2/product/')),
    'search never straight to OFF (barcode lookups use its product API)',
  );
  page.off('request', countOff);
  await page.unroute('**/*openfoodfacts.org/**');
  await page.unroute(/^https:\/\/voice\.test\/off-search/);
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log(
    '  ✔ 1.4.0 online search via the Worker (1 request), ends ("not available" + retry), brand once, unknown "–", step „2,5“; missing values named + filled in (grams sheet and diary item), impossible OFF values filtered (search + barcode → „Въведи я сам“)',
  );
}

/**
 * 1.4.1 verified technique: library thumbnails, the exercise page and the in-workout sheet show the
 * two-frame drawing with numbered markers + legend, the sections, mistakes as mistake → fix and the
 * sources; readable on a phone (no sideways scroll, ≥ 14 px text) in light and dark; with a built
 * app (service worker) the drawings of a not yet opened exercise also load offline.
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 * @param {string} name
 * @param {import('playwright-core').BrowserContext} ctx
 */
async function v141(page, { go, settle, shot, layer, clearCel }, name, ctx) {
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  const noSideScroll = async (/** @type {string} */ what) =>
    assert.ok(
      await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),
      `${what}: no sideways scroll`,
    );
  const heads = [
    'Изходна позиция',
    'Изпълнение',
    'Дишане',
    'Ключови точки',
    'Чести грешки → как да ги избегнеш',
    'Подробно за мускулите',
    'Източници',
  ];
  /** Checks one technique view (page or sheet) inside `root`. */
  const checkTech = async (/** @type {import('playwright-core').Locator} */ root, /** @type {string} */ what) => {
    await root.locator('.tsvg svg.vf').nth(1).waitFor({ timeout: 8000 });
    assert.equal(await root.locator('.tsvg.wait').count(), 0, `${what}: both drawings loaded`);
    assert.equal(await root.locator('figure.tfig').count(), 2, `${what}: 2 frames`);
    for (const f of await root.locator('figure.tfig').all()) {
      const markers = await f.locator('svg .c-cot').count();
      assert.ok(markers >= 1, `${what}: numbered markers`);
      assert.equal(await f.locator('.tleg li').count(), markers, `${what}: legend = markers`);
    }
    assert.deepEqual(await root.locator('.tech h3').allTextContents(), heads, `${what}: sections`);
    const mis = await root.locator('.tmist li').count();
    assert.ok(mis >= 3, `${what}: mistakes`);
    assert.equal(await root.locator('.tmist .mis').count(), mis);
    assert.equal(await root.locator('.tmist .fix').count(), mis, `${what}: every mistake has a fix`);
    const links = await root
      .locator('.tsrc a')
      .evaluateAll((as) => as.map((a) => [a.getAttribute('href'), a.getAttribute('rel')]));
    assert.ok(
      links.length >= 1 && links.every(([u, r]) => /^https:\/\//.test(u ?? '') && /noopener/.test(r ?? '')),
      `${what}: source links`,
    );
    const px = await root
      .locator('.tech .tlist li, .tleg li span, .tmist p')
      .evaluateAll((els) => Math.min(...els.map((e) => parseFloat(getComputedStyle(e).fontSize))));
    assert.ok(px >= 14, `${what}: readable text (${px}px)`);
    const w = await root
      .locator('.tsvg')
      .first()
      .evaluate((e) => e.getBoundingClientRect().width);
    assert.ok(w >= 280, `${what}: drawing uses the phone width (${w}px)`);
    await noSideScroll(what);
  };

  for (const theme of ['light', 'dark']) {
    await go('profile');
    await page.locator(`[data-act="theme"][data-v="${theme}"]`).click();
    await settle();
    assert.equal(await page.evaluate(() => document.documentElement.classList.contains('dark')), theme === 'dark');
    // library list: a thumbnail of the new drawing for every exercise
    await go('library');
    await page.locator('.exthumb svg.vf').first().waitFor();
    assert.equal(await page.locator('.exthumb svg.vf').count(), 20, 'library: 20 thumbnails');
    await noSideScroll('library');
    await page.evaluate(() => scrollTo(0, 0));
    await shot(`tech-library-${theme}`);
    // exercise page
    await page.locator('[data-go="exercise/back_squat"]').click();
    await settle();
    await checkTech(page.locator('.content'), `page (${theme})`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.waitForTimeout(200);
    await shot(`tech-page-${theme}`);
    await shot(`tech-page-${theme}-full`, true);
    // in a workout: the sheet over the set
    await go('home');
    await clearCel();
    if (!(await page.locator('.wtop').count())) {
      await page.locator('.wcard [data-act="start"]').first().click();
      await page.locator('.wtop').waitFor();
    }
    await page.locator('[data-act="howTo"]').first().click();
    await layer.locator('.panel .tfig').first().waitFor();
    await checkTech(layer.locator('.panel').last(), `sheet (${theme})`);
    await page.waitForTimeout(300);
    await shot(`tech-sheet-${theme}`);
    await layer.locator('.panel').last().locator('.tsec').nth(4).scrollIntoViewIfNeeded();
    await page.waitForTimeout(200);
    await shot(`tech-sheet-${theme}-mistakes`);
    await layer.locator('[data-close]').last().click();
    await settle();
    assert.equal(await layer.locator('.panel').count(), 0, 'sheet closes, the set stays');
    assert.equal(await page.locator('.wtop').count(), 1);
  }

  // Offline drawings (only a built app precaches them; the source dev server does not)
  if (name === 'android' && DIR !== '.') {
    await ctx.setOffline(true);
    await go('exercise/lateral_raise');
    await checkTech(page.locator('.content'), 'offline page');
    await go('exercise/dead_bug');
    await page.locator('.content .tsvg svg.vf').nth(1).waitFor({ timeout: 8000 });
    await ctx.setOffline(false);
    console.log('  ✔ 1.4.1 drawings of not yet opened exercises load offline');
  }
  await go('profile');
  await page.locator('[data-act="theme"][data-v="light"]').click();
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log(
    '  ✔ 1.4.1 technique: 20 thumbnails, page + workout sheet with 2 frames, markers = legend, 7 sections, mistake → fix, sources; phone-readable in light and dark',
  );
}

/**
 * 1.4.1 tester round: "Подробно за мускулите" collapsed by default, the full build id in the Profile
 * footer and on the What's new page, and the bottom nav pinned to the bottom of the screen while
 * long pages (exercise page, food, progress) scroll – also while the page is pinch-zoomed.
 * (The update bar over Край is covered by tests/e2e/sw.mjs, which needs a real worker update.)
 * @param {import('playwright-core').Page} page
 * @param {any} h helpers from run()
 * @param {string} name
 * @param {import('playwright-core').BrowserContext} ctx
 */
async function v141tester(page, { go, settle, shot }, name, ctx) {
  await go('profile');
  await page.locator('.lang [data-v="bg"]').click();
  await settle();
  // build id: 1.4.1-<hash> / 1.4.1-beta-<hash> from a build, the plain version from the sources
  const idRe = DIR === '.' ? /^Билд: 1\.4\.1$/ : /^Билд: 1\.4\.1(-beta)?-[0-9a-f]{7,}$/;
  const meta = await page.evaluate(
    () => document.querySelector('meta[name="vf-build"]')?.getAttribute('content') ?? '1.4.1',
  );
  const foot = page.locator('#pbuild');
  await foot.scrollIntoViewIfNeeded();
  assert.ok(await foot.isVisible(), 'Profile footer shows the build id');
  assert.match((await foot.textContent())?.trim() ?? '', idRe);
  assert.equal((await foot.textContent())?.trim(), `Билд: ${meta}`);
  await go('whatsnew');
  assert.match(
    (await page.locator('.content').first().textContent()) ?? '',
    new RegExp(meta.replace(/\./g, '\\.')),
    "What's new shows the build id",
  );
  assert.ok(await page.locator('#buildid').isVisible());

  // muscles: collapsed by default, opens on tap
  await go('exercise/back_squat');
  await page.locator('.content .tsvg svg.vf').nth(1).waitFor({ timeout: 8000 });
  const det = page.locator('.content details.tmore');
  assert.equal(await det.count(), 1);
  assert.equal(await det.getAttribute('open'), null, 'Подробно за мускулите is collapsed');
  assert.equal(await det.locator('summary h3').textContent(), 'Подробно за мускулите');
  assert.ok(!(await det.locator('.tmus').isVisible()), 'muscle list hidden while collapsed');
  await det.locator('summary').click();
  await page.waitForTimeout(150);
  assert.ok(await det.locator('.tmus').isVisible(), 'muscle list shows after a tap');
  assert.doesNotMatch(
    (await page.locator('.content').textContent()) ?? '',
    /илюстрацията|нарисуван|няма отделна страница|показва вариант|bracing|butt wink/i,
  );

  // bottom nav stays at the bottom of the viewport while long pages scroll
  const navAt = () =>
    page.evaluate(() => {
      const nav = /** @type {HTMLElement} */ (document.querySelector('#nav .nav'));
      const r = nav.getBoundingClientRect();
      const v = /** @type {VisualViewport} */ (visualViewport);
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      const page = document.getElementById('page');
      const last = [...(page?.querySelectorAll('.content > *') ?? [])]
        .filter((e) => e.getBoundingClientRect().height > 0)
        .pop();
      return {
        top: r.top,
        bottom: r.bottom,
        height: r.height,
        ih: innerHeight,
        vTop: v.offsetTop,
        vBottom: v.offsetTop + v.height,
        scale: v.scale,
        onTop: !!hit && nav.contains(hit),
        y: scrollY,
        max: document.documentElement.scrollHeight - innerHeight,
        lastBottom: last ? last.getBoundingClientRect().bottom : 0,
      };
    });
  const scrollDown = async () => {
    for (let i = 0; i < 12; i++) {
      if (name === 'android') await page.mouse.wheel(0, 400);
      else await page.evaluate(() => scrollBy(0, 400)); // mobile WebKit has no wheel events
      await page.waitForTimeout(60);
    }
    await page.waitForTimeout(250);
  };
  for (const route of ['exercise/back_squat', 'food', 'progress']) {
    await go(route);
    await page.waitForTimeout(route.startsWith('exercise') ? 500 : 250);
    await page.mouse.move(200, 300);
    const a = await navAt();
    assert.ok(Math.abs(a.bottom - a.ih) <= 1 && a.onTop, `${route}: nav at the bottom before scrolling`);
    await page.evaluate(() => scrollTo(0, 300));
    await page.waitForTimeout(200);
    const m = await navAt();
    assert.ok(Math.abs(m.bottom - m.ih) <= 1 && m.onTop, `${route}: nav pinned mid-page (${JSON.stringify(m)})`);
    await scrollDown();
    const b = await navAt();
    assert.ok(Math.abs(b.bottom - b.ih) <= 1 && b.onTop, `${route}: nav pinned at the end (${JSON.stringify(b)})`);
    if (route.startsWith('exercise'))
      assert.ok(b.max > 1000 && b.y > 1000, `${route}: a long page really scrolled (${b.y})`);
    // the last card ends above the nav, so nothing is hidden behind it
    assert.ok(b.lastBottom <= b.top + 1, `${route}: content clears the nav (${b.lastBottom} vs ${b.top})`);
    await shot(`nav-${route.replace('/', '-')}-end`);
  }
  // pinch-zoomed (only Chromium can set the zoom from a test): the nav stays on the visible part
  if (name === 'android') {
    await go('exercise/back_squat');
    await page.waitForTimeout(400);
    const a0height = (await navAt()).height;
    const cdp = await ctx.newCDPSession(page);
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 2 });
    for (const y of [0, 900, 1800]) {
      await page.evaluate((y) => scrollTo(0, y), y);
      await page.waitForTimeout(300);
      const z = await navAt();
      assert.ok(z.scale > 1.9, 'zoomed');
      assert.ok(
        Math.abs(z.bottom - z.vBottom) <= 2,
        `zoomed: nav at the bottom of the visible part (${JSON.stringify(z)})`,
      );
      assert.ok(Math.abs(z.height * z.scale - a0height) <= 3, 'zoomed: nav keeps its normal size');
    }
    await shot('nav-zoomed');
    await cdp.send('Emulation.setPageScaleFactor', { pageScaleFactor: 1 });
    await page.waitForTimeout(300);
    const back = await navAt();
    assert.ok(Math.abs(back.bottom - back.ih) <= 1 && back.onTop, 'nav back in place after zooming out');
    assert.equal(await page.evaluate(() => document.getElementById('nav')?.classList.contains('pinned')), false);
    await cdp.detach();
  }
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log(
    `  ✔ 1.4.1 tester: build id ${meta} in Profile + What's new, muscles collapsed, nav pinned on exercise/food/progress${name === 'android' ? ' (also pinch-zoomed)' : ''}`,
  );
}
