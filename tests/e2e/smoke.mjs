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
  page.on('pageerror', (e) => errors.push(e.message));
  page.on(
    'console',
    (m) =>
      m.type() === 'error' &&
      !/favicon|ERR_INTERNET_DISCONNECTED|Failed to load resource/.test(m.text()) &&
      errors.push(m.text()),
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
async function v132(page, { go, settle, shot, clearCel, layer }) {
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
  assert.match(txt, /Какво ново в 1\.3\.2/);
  assert.match(txt, /Отмени/, 'the pill item');
  assert.match(txt, /преименуваш/, 'the rename item');
  assert.doesNotMatch(txt, /What's new|Undo|Rename/, 'no English');
  assert.equal(await layer.locator('.whatsnew > div').count(), 3, 'only the 1.3.2 items');
  await page.waitForTimeout(700);
  await shot('whats-new-132');
  await layer.locator('[data-close]').first().click();
  await settle();
  await go('profile');
  await page.locator('.lang [data-v="en"]').click();
  await settle();
  console.log("  ✔ 1.3.2 What's new in Bulgarian after an update from 1.3.1");
}
