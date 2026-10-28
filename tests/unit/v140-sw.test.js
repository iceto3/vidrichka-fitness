/**
 * 1.4.0 critical fix: the service worker never answers with a network error.
 * sw.js is not a module, so it runs here in a vm with fake caches/fetch/clients.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const BASE = 'https://app.test/vf/';

/** @param {{version?: string, net?: (url: string) => Promise<Response>, cached?: Record<string, Record<string,string>>, clients?: any[]}} o */
function load(o = {}) {
  let src = readFileSync('sw.js', 'utf8');
  if (o.version) src = src.replace("const VERSION = 'dev';", `const VERSION = '${o.version}';`);
  /** @type {Map<string, Map<string, string>>} */
  const store = new Map(Object.entries(o.cached ?? {}).map(([k, v]) => [k, new Map(Object.entries(v))]));
  const key = (/** @type {any} */ r) => new URL(typeof r === 'string' ? r : r.url, BASE).pathname;
  const cacheObj = (/** @type {string} */ name) => {
    if (!store.has(name)) store.set(name, new Map());
    const m = /** @type {Map<string,string>} */ (store.get(name));
    return {
      match: async (/** @type {any} */ r) => (m.has(key(r)) ? new Response(m.get(key(r))) : undefined),
      put: async (/** @type {any} */ r, /** @type {Response} */ res) => void m.set(key(r), await res.text()),
      add: async (/** @type {string} */ u) => {
        const res = await fetchFn(new Request(new URL(u, BASE)));
        if (!res.ok) throw new TypeError('bad');
        m.set(key(u), await res.text());
      },
      addAll: async (/** @type {string[]} */ us) => {
        const all = await Promise.all(us.map((u) => fetchFn(new Request(new URL(u, BASE)))));
        if (all.some((r) => !r.ok)) throw new TypeError('addAll failed');
        await Promise.all(us.map(async (u, i) => m.set(key(u), await all[i].text())));
      },
    };
  };
  const caches = {
    open: async (/** @type {string} */ n) => cacheObj(n),
    keys: async () => [...store.keys()],
    delete: async (/** @type {string} */ n) => store.delete(n),
    match: async (/** @type {any} */ r) => {
      for (const m of store.values()) if (m.has(key(r))) return new Response(m.get(key(r)));
    },
  };
  const net = o.net ?? (async () => Promise.reject(new TypeError('Failed to fetch')));
  const fetchFn = async (/** @type {any} */ r) => net(typeof r === 'string' ? r : r.url);
  /** @type {Record<string, Function>} */
  const on = {};
  const state = { skipped: false, claimed: false };
  const self = {
    addEventListener: (/** @type {string} */ t, /** @type {Function} */ f) => (on[t] = f),
    skipWaiting: async () => void (state.skipped = true),
    clients: { claim: async () => void (state.claimed = true), matchAll: async () => o.clients ?? [] },
    registration: {},
  };
  const ctx = {
    self,
    caches,
    fetch: fetchFn,
    location: new URL(BASE),
    Response,
    Request,
    URL,
    setTimeout,
    Promise,
    console,
  };
  vm.runInNewContext(src, ctx);
  /** Dispatch a fetch; returns what respondWith got (or null when not handled). */
  const fetchEvt = async (/** @type {string} */ path, mode = 'no-cors') => {
    /** @type {Promise<Response> | null} */
    let p = null;
    on.fetch({
      request: { url: new URL(path, BASE).href, method: 'GET', mode },
      respondWith: (/** @type {any} */ x) => (p = x),
    });
    return p ? await p : null;
  };
  const lifecycle = async (/** @type {string} */ t) => {
    /** @type {Promise<any>} */
    let p = Promise.resolve();
    on[t]({ waitUntil: (/** @type {any} */ x) => (p = x) });
    await p;
  };
  return { fetchEvt, lifecycle, store, state };
}

const ok = (/** @type {string} */ body) => async () => new Response(body, { status: 200 });

test('build: a cache miss falls back to the network (and is cached)', async () => {
  const sw = load({ version: '1.4.0-x', net: ok('js!') });
  const res = await sw.fetchEvt('js/c/chunk-A.js');
  assert.equal(await res?.text(), 'js!');
  await new Promise((r) => setTimeout(r, 0));
  assert.equal(sw.store.get('vf-1.4.0-x')?.get('/vf/js/c/chunk-A.js'), 'js!');
});

test('build: cache miss + network error → a 504 response, never a rejected promise', async () => {
  const sw = load({ version: '1.4.0-x' });
  const res = await sw.fetchEvt('js/c/missing.js');
  assert.equal(res?.status, 504);
});

test('build: navigation is network-first; offline it serves the cached shell', async () => {
  const cached = { 'vf-1.4.0-x': { '/vf/index.html': 'cached shell' } };
  const online = load({ version: '1.4.0-x', cached, net: ok('fresh shell') });
  assert.equal(await (await online.fetchEvt('./', 'navigate'))?.text(), 'fresh shell');
  const offline = load({ version: '1.4.0-x', cached });
  assert.equal(await (await offline.fetchEvt('./', 'navigate'))?.text(), 'cached shell');
  const err500 = load({ version: '1.4.0-x', cached, net: async () => new Response('x', { status: 500 }) });
  assert.equal(await (await err500.fetchEvt('./', 'navigate'))?.text(), 'cached shell');
});

test('build: navigation with no network and no cache → recovery page (not ERR_FAILED)', async () => {
  const sw = load({ version: '1.4.0-x' });
  const res = await sw.fetchEvt('./', 'navigate');
  assert.equal(res?.status, 503);
  const body = (await res?.text()) ?? '';
  assert.match(body, /Опитай пак/);
  assert.match(body, /unregister/);
});

test('dev: network first, cache fallback, else 504', async () => {
  const sw = load({ cached: { 'vf-dev': { '/vf/a.js': 'old' } } });
  assert.equal(await (await sw.fetchEvt('a.js'))?.text(), 'old');
  assert.equal((await sw.fetchEvt('b.js'))?.status, 504);
});

test('cross-origin, non-GET and sw.js itself are left to the browser', async () => {
  const sw = load({ version: '1.4.0-x' });
  assert.equal(await sw.fetchEvt('https://world.openfoodfacts.org/api'), null);
  assert.equal(await sw.fetchEvt('sw.js'), null);
});

test('install: one failing file does not fail the install; no open window → skipWaiting', async () => {
  const sw = load({
    version: '1.4.0-x',
    net: async (u) => (u.endsWith('index.html') ? new Response('i') : new Response('', { status: 404 })),
  });
  await sw.lifecycle('install');
  assert.equal(sw.store.get('vf-1.4.0-x')?.get('/vf/index.html'), 'i');
  assert.equal(sw.state.skipped, true);
  const busy = load({ version: '1.4.0-x', net: ok('x'), clients: [{ id: 'w1' }] });
  await busy.lifecycle('install');
  assert.equal(busy.state.skipped, false, 'an open window keeps the update prompt');
});

test('activate: deletes only this app’s old versioned caches, keeps config, claims', async () => {
  const sw = load({
    version: '1.4.0-x',
    cached: { 'vf-1.3.4-old': {}, 'vf-config': {}, 'vf-1.4.0-x': {}, 'other-app': {}, 'vfb-1.4.0-beta': {} },
  });
  await sw.lifecycle('activate');
  assert.deepEqual([...sw.store.keys()].sort(), ['other-app', 'vf-1.4.0-x', 'vf-config', 'vfb-1.4.0-beta']);
  assert.equal(sw.state.claimed, true);
});

test('index.html has the self-healing script; the build sets the beta prefix', () => {
  const html = readFileSync('index.html', 'utf8');
  const heal = html.indexOf('id="heal"'),
    main = html.indexOf('src="src/main.js"');
  assert.ok(heal > 0 && heal < main, 'heal runs before the app module');
  assert.match(html, /var P = 'vf-';/);
  assert.match(html, /unregister\(\)/);
  assert.match(html, /5 \* 60 \* 1000/, 'rate-limited, cannot loop');
  assert.match(readFileSync('tools/build.mjs', 'utf8'), /var P = 'vfb-';/);
});

test('heal: unregisters, deletes only versioned caches, reloads, at most once per 5 min', async () => {
  const html = readFileSync('index.html', 'utf8');
  const js = /** @type {string} */ (html.match(/<script id="heal">([\s\S]*?)<\/script>/)?.[1]);
  const deleted = /** @type {string[]} */ ([]);
  let unreg = 0,
    reloads = 0;
  /** @type {Record<string,string>} */
  const ls = {};
  const win = {
    document: { documentElement: { classList: { contains: () => false } } },
    localStorage: {
      getItem: (/** @type {string} */ k) => ls[k] ?? null,
      setItem: (/** @type {string} */ k, /** @type {string} */ v) => (ls[k] = v),
    },
    navigator: {
      serviceWorker: { controller: {}, getRegistration: async () => ({ unregister: async () => void unreg++ }) },
    },
    caches: {
      keys: async () => ['vf-1.3.4-a', 'vf-config', 'other'],
      delete: async (/** @type {string} */ k) => void deleted.push(k),
    },
    location: { reload: () => void reloads++ },
    addEventListener: () => {},
    setTimeout: () => 0,
    Date,
    Number,
    String,
    Promise,
  };
  /** @type {any} */ (win).self = win;
  /** @type {any} */ (win).window = win;
  vm.runInNewContext(js, win);
  /** @type {any} */ (win).__vfHeal('load');
  await new Promise((r) => setTimeout(r, 10));
  assert.deepEqual([unreg, reloads, deleted], [1, 1, ['vf-1.3.4-a']]);
  /** @type {any} */ (win).__vfHeal('load');
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(reloads, 1, 'no second reload within 5 minutes');
});
