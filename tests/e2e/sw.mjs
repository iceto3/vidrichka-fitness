/**
 * Real service-worker e2e (1.4.0, tester round 3) in Chromium, on a server that behaves like
 * Cloudflare Pages (/index.html → 308 /, *.html → 308 without the extension, /x → x.html,
 * unknown paths → the SPA index.html). Checks, with the real sw.js of the build:
 *  1. (with --prev) the previous build reproduces the bug: offline reload = ERR_FAILED;
 *  2. (with --prev) upgrading from it: the new worker takes over at once (no worker left
 *     waiting), the page shows the update bar, and offline reload then works;
 *  3. a fresh install: controlled after the first load, offline reload and a new offline tab
 *     load the app shell, no cached response is redirected and 'index.html' is not cached;
 *  4. a slow network: the cached shell after the navigation timeout;
 *  5. (1.4.1) the update bar during a workout never covers Край or the top buttons (phone sizes);
 *  6. /repair is a static page the worker never intercepts; it unregisters and clears caches
 *     and reopens the app; Profile links to it; the build id is shown in full.
 * Usage: node tests/e2e/sw.mjs --dir dist-beta [--prev /path/to/previous/dist-beta]
 */
import { createServer } from 'node:http';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync } from 'node:fs';
import { extname, join, normalize, resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';

const args = process.argv.slice(2);
const opt = (/** @type {string} */ k, /** @type {string} */ d) => (args.includes(k) ? args[args.indexOf(k) + 1] : d);
const DIR = resolve(opt('--dir', 'dist-beta'));
const PREV = opt('--prev', '') && resolve(opt('--prev', ''));
const CHROME = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
const TYPES = /** @type {Record<string, string>} */ ({
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.mp3': 'audio/mpeg',
});

/** Server state the test switches. */
const srv = { root: PREV || DIR, slowHtml: 0 };
const isFile = async (/** @type {string} */ f) => (await stat(f).catch(() => null))?.isFile() ?? false;
const LOG = process.env.SW_E2E_LOG ? [] : null;
/** SW_SHOTS=<dir>: also save screenshots of the update bar cases */
const SHOTS = process.env.SW_SHOTS ?? '';
const server = createServer(async (req, res) => {
  if (LOG) res.on('finish', () => LOG.push(`${res.statusCode} ${req.url}`));
  const url = new URL(req.url ?? '/', 'http://x');
  const p = normalize(decodeURIComponent(url.pathname));
  const send = async (/** @type {string} */ file) => {
    if (extname(file) === '.html' && srv.slowHtml) await new Promise((r) => setTimeout(r, srv.slowHtml));
    res.writeHead(200, {
      'content-type': TYPES[extname(file)] ?? 'application/octet-stream',
      'cache-control': 'public, max-age=0, must-revalidate',
    });
    res.end(await readFile(file));
  };
  try {
    if (p.endsWith('.html')) {
      res.writeHead(308, { location: p.endsWith('/index.html') ? p.slice(0, -10) : p.slice(0, -5) });
      return res.end();
    }
    const f = join(srv.root, p);
    if (!f.startsWith(srv.root)) throw new Error('outside');
    if (p.endsWith('/')) return await send(join(f, 'index.html'));
    if (await isFile(f)) return await send(f);
    if (await isFile(`${f}.html`)) return await send(`${f}.html`);
    if (!extname(p)) return await send(join(srv.root, 'index.html')); // Pages SPA fallback
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
  }
});
await new Promise((r) => server.listen(0, '127.0.0.1', () => r(null)));
const PORT = /** @type {import('node:net').AddressInfo} */ (server.address()).port;
const BASE = `http://localhost:${PORT}/`;
const versionOf = async (/** @type {string} */ dir) =>
  /const VERSION = '([^']+)'/.exec(await readFile(join(dir, 'sw.js'), 'utf8'))?.[1] ?? '';
const NEW = await versionOf(DIR);

const browser = await chromium.launch(CHROME ? { executablePath: CHROME, args: ['--no-sandbox'] } : {});
let passed = 0;
const step = async (/** @type {string} */ name, /** @type {() => Promise<void>} */ fn) => {
  const t0 = Date.now();
  await fn();
  passed++;
  console.log(`ok ${passed} - ${name} (${Date.now() - t0} ms)`);
};

/** @param {import('playwright-core').Page} page */
const appLoaded = (page) =>
  page.waitForFunction(() => document.documentElement.classList.contains('ready'), null, { timeout: 15000 });
/** Wait until the page is controlled by a worker of the given version. @param {import('playwright-core').Page} page @param {string} v */
const controlledBy = async (page, v, ms = 20000) => {
  const end = Date.now() + ms;
  let got = '';
  while (Date.now() < end) {
    got = await page
      .evaluate(
        () =>
          new Promise((ok) => {
            const c = navigator.serviceWorker.controller;
            if (!c) return ok('');
            const ch = new MessageChannel();
            ch.port1.onmessage = (e) => ok(String(e.data));
            c.postMessage({ type: 'VERSION' }, [ch.port2]);
            setTimeout(() => ok(''), 1000);
          }),
      )
      .catch(() => '');
    if (got === v) return;
    await page.waitForTimeout(250);
  }
  throw new Error(`not controlled by ${v} (got "${got}")`);
};
/** @param {import('playwright-core').Page} page */
const regState = (page) =>
  page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { active: !!r?.active, waiting: !!r?.waiting, installing: !!r?.installing };
  });
/** Every cached response: [cache, url, redirected]. @param {import('playwright-core').Page} page */
const cacheDump = (page) =>
  page.evaluate(async () => {
    const out = [];
    for (const k of await caches.keys()) {
      const c = await caches.open(k);
      for (const req of await c.keys()) out.push([k, req.url, !!(await c.match(req))?.redirected]);
    }
    return out;
  });
/** Reload; true when it loaded, the error text when the browser failed. @param {import('playwright-core').Page} page */
const tryReload = async (page) => {
  try {
    await page.reload({ waitUntil: 'load', timeout: 15000 });
    return true;
  } catch (e) {
    return String(/** @type {Error} */ (e).message).split('\n')[0];
  }
};

try {
  if (PREV) {
    const OLD = await versionOf(PREV);
    const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
    const page = await ctx.newPage();
    await step(`previous build ${OLD} reproduces the bug: offline reload ends in ERR_FAILED`, async () => {
      srv.root = PREV;
      await page.goto(BASE);
      await appLoaded(page);
      await controlledBy(page, OLD);
      const dump = await cacheDump(page);
      assert.ok(
        dump.some(([, u, red]) => u.endsWith('/index.html') && red),
        'old cache holds a redirected index.html',
      );
      await ctx.setOffline(true);
      const r = await tryReload(page);
      assert.notEqual(r, true, 'the old worker should fail offline (root cause)');
      assert.match(String(r), /ERR_FAILED|ERR_INTERNET_DISCONNECTED/);
      console.log(`   old build offline: ${r}`);
      await ctx.setOffline(false);
    });
    await step(
      `upgrade ${OLD} → ${NEW}: takes over at once, nothing left waiting, update bar, offline works`,
      async () => {
        srv.root = DIR;
        assert.equal(await tryReload(page), true);
        await appLoaded(page);
        await controlledBy(page, NEW);
        assert.deepEqual(await regState(page), { active: true, waiting: false, installing: false });
        await page.waitForSelector('#updatebar', { timeout: 10000 });
        await Promise.all([page.waitForEvent('load'), page.click('#updatebar button')]);
        await appLoaded(page);
        const dump = await cacheDump(page);
        assert.ok(!dump.some(([, , red]) => red), 'no redirected response left in any cache');
        await ctx.setOffline(true);
        assert.equal(await tryReload(page), true, 'offline reload after the upgrade');
        await appLoaded(page);
        assert.equal(
          await page.evaluate(() => document.querySelector('meta[name="vf-build"]')?.getAttribute('content')),
          NEW,
        );
        await ctx.setOffline(false);
      },
    );
    await ctx.close();
  }

  const ctx = await browser.newContext({ viewport: { width: 412, height: 860 } });
  const page = await ctx.newPage();
  /** @type {string[]} */
  const errors = [];
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await step(
    'fresh install: controlled after the first load, shell cached under ./ only, nothing redirected',
    async () => {
      srv.root = DIR;
      await page.goto(BASE);
      await appLoaded(page);
      await controlledBy(page, NEW);
      const dump = await cacheDump(page);
      const mine = dump.filter(([k]) => k.endsWith(NEW));
      assert.ok(
        mine.some(([, u]) => u === BASE),
        'shell cached as ./',
      );
      assert.ok(!mine.some(([, u]) => /index\.html$|repair/.test(u)), 'no index.html / repair entries');
      assert.ok(!dump.some(([, , red]) => red), 'nothing redirected');
      assert.ok(mine.length > 50, `precached ${mine.length} files`);
    },
  );
  await step('offline: reload, a hash route and a new tab all load the app shell from the cache', async () => {
    await ctx.setOffline(true);
    assert.equal(await tryReload(page), true);
    await appLoaded(page);
    await page.goto(`${BASE}#/profile`);
    await appLoaded(page);
    const p2 = await ctx.newPage();
    await p2.goto(`${BASE}?utm=x#/food`);
    await appLoaded(p2);
    await p2.close();
    await ctx.setOffline(false);
  });
  await step('slow network: the cached shell after the navigation timeout (4 s), not a hang', async () => {
    srv.slowHtml = 12000;
    const t0 = Date.now();
    assert.equal(await tryReload(page), true);
    await appLoaded(page);
    const ms = Date.now() - t0;
    srv.slowHtml = 0;
    assert.ok(ms < 9000, `loaded in ${ms} ms`);
  });
  await step("build id: What's new shows the full version + hash", async () => {
    await page.goto(`${BASE}#/whatsnew`);
    await appLoaded(page);
    const txt = await page.textContent('#buildid', { timeout: 10000 }).catch(() => '');
    assert.ok(txt?.includes(NEW), `build label "${txt}" has ${NEW}`);
  });
  // 1.4.1: a second copy of the build whose sw.js differs by one comment = "a new version is out"
  const NEXT = await mkdtemp(join(tmpdir(), 'vf-next-'));
  await cp(DIR, NEXT, { recursive: true });
  await writeFile(join(NEXT, 'sw.js'), `${await readFile(join(DIR, 'sw.js'), 'utf8')}\n// next\n`);
  /** [viewport, from, to]: each phone size updates in the opposite direction */
  const sizes = /** @type {[{width: number, height: number}, string, string][]} */ ([
    [{ width: 412, height: 860 }, DIR, NEXT],
    [{ width: 390, height: 844 }, NEXT, DIR],
    [{ width: 360, height: 740 }, DIR, NEXT],
  ]);
  for (const [vp, from, to] of sizes) {
    await step(
      `update bar during a workout (${vp.width}×${vp.height}): Край and the top buttons stay clickable`,
      async () => {
        srv.root = from;
        const c2 = await browser.newContext({ viewport: vp, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
        const p = await c2.newPage();
        await p.goto(BASE);
        await appLoaded(p);
        await p.locator('#layer input').first().fill('Maria');
        await p.locator('#layer .btn').last().click();
        await p.waitForTimeout(800);
        await p.evaluate(() => (location.hash = '#/home'));
        await p.locator('.wcard [data-act="start"]').first().click();
        await p.locator('.wtop .finish').waitFor();
        const before = await p.locator('.wtop .finish').boundingBox();
        // the new version appears while the workout runs
        srv.root = to;
        await p.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.update());
        await p.waitForSelector('#updatebar', { timeout: 15000 });
        await p.waitForTimeout(400);
        const bar = /** @type {{x: number, y: number, width: number, height: number}} */ (
          await p.locator('#updatebar').boundingBox()
        );
        /** every top button: hit-testable at its centre and not under the bar */
        const free = async (/** @type {string} */ sel, /** @type {string} */ what) => {
          const els = await p.locator(sel).all();
          assert.ok(els.length, `${what}: found`);
          for (const el of els) {
            const b = /** @type {{x: number, y: number, width: number, height: number}} */ (await el.boundingBox());
            assert.ok(
              b.y >= bar.y + bar.height,
              `${what} (top ${b.y}) is below the bar (bottom ${bar.y + bar.height})`,
            );
            const hit = await el.evaluate((e) => {
              const r = e.getBoundingClientRect();
              const h = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
              return !!h && e.contains(h);
            });
            assert.ok(hit, `${what}: nothing covers it`);
          }
        };
        if (SHOTS) await p.screenshot({ path: join(SHOTS, `update-bar-workout-${vp.width}x${vp.height}.png`) });
        await free('.wtop .finish', 'Край');
        await free('.wtop .iconbtn', 'minimise');
        assert.ok(before && (await p.locator('.wtop .finish').boundingBox())?.y !== undefined);
        // a normal click (no force) on Край opens its dialog
        await p.locator('.wtop .finish').click({ timeout: 3000 });
        await p
          .locator('#layer .panel, #layer [role="dialog"], #layer [role="alertdialog"]')
          .first()
          .waitFor({ timeout: 5000 });
        assert.ok(await p.locator('#updatebar').isVisible(), 'the bar is still there');
        // other screens with top buttons: a page header with back, and the bar's own button works
        await p.keyboard.press('Escape');
        await p.evaluate(() => (location.hash = '#/whatsnew'));
        await p.waitForTimeout(500);
        await free('.content [data-back]', "What's new back");
        await p.evaluate(() => (location.hash = '#/exercise/back_squat'));
        await p.waitForTimeout(500);
        await free('.content [data-back]', 'exercise page back');
        if (SHOTS) await p.screenshot({ path: join(SHOTS, `update-bar-exercise-${vp.width}x${vp.height}.png`) });
        const h1 = await p.locator('.content h1').first().boundingBox();
        assert.ok(h1 && h1.y >= bar.y + bar.height, 'page title is below the bar');
        assert.ok(bar.y >= 0 && bar.y + bar.height <= 120, `bar sits at the top (${bar.y}+${bar.height})`);
        await c2.close();
      },
    );
  }
  await rm(NEXT, { recursive: true, force: true });
  srv.root = DIR;
  await step('Profile links to /repair („Поправи приложението“)', async () => {
    await page.goto(`${BASE}#/profile`);
    await appLoaded(page);
    const href = await page.$eval('#repairrow', (a) => /** @type {HTMLAnchorElement} */ (a).href).catch(() => '');
    assert.equal(href, `${BASE}repair`);
  });
  await step('/repair: static page, never intercepted, unregisters + clears caches, reopens the app', async () => {
    const seen = /** @type {string[]} */ ([]);
    ctx.on('request', (r) => r.url().includes('/repair') && seen.push(`${r.url()} sw=${!!r.serviceWorker()}`));
    const res = await page.goto(`${BASE}repair`);
    assert.equal(res?.status(), 200);
    assert.equal(res?.fromServiceWorker(), false, 'answered by the network, not the worker');
    assert.match((await page.textContent('h1')) ?? '', /Поправи и презареди/);
    await page.waitForFunction(() => document.documentElement.hasAttribute('data-repaired'));
    assert.equal(await page.getAttribute('html', 'data-repaired'), '1');
    const left = await page.evaluate(async () =>
      (await caches.keys()).filter((k) => /^vfb?-/.test(k) && !/config$/.test(k)),
    );
    assert.deepEqual(left, []);
    await page.waitForURL(BASE, { timeout: 10000 });
    await appLoaded(page);
    await controlledBy(page, NEW); // registers again
    // /repair.html redirects (like Pages) and still lands on the repair page
    const r2 = await page.goto(`${BASE}repair.html`);
    assert.equal(r2?.status(), 200);
    assert.equal(new URL(page.url()).pathname, '/repair');
  });
  const cors = errors.filter((e) => /CORS|ERR_FAILED/i.test(e));
  await step('no CORS / ERR_FAILED console errors', async () => assert.deepEqual(cors, []));
  await ctx.close();
  console.log(`# sw e2e: ${passed} passed`);
} catch (e) {
  if (LOG) console.log(LOG.slice(-40).join('\n'), LOG.length);
  console.error('FAIL', e);
  process.exitCode = 1;
} finally {
  await browser.close();
  server.close();
}
