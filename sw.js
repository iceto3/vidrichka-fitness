/**
 * Service worker: offline app shell + reminders.
 * - Precache: the build replaces VERSION and PRECACHE with the full file list. Navigations
 *   are network-first with the cached shell as fallback, files are cache-first with a network
 *   fallback, and no request ever ends in a network error (see <shell> below, 1.4.0).
 * - Updates (1.4.0): a new version takes over at once (skipWaiting + clients.claim); the
 *   page shows an "update ready" bar and reloads when the user taps it.
 * - Reminders: best-effort via Periodic Background Sync (installed Chromium only) and
 *   notification clicks that focus/open the app.
 * - Daily rhythm (1.1): the app posts the next days' reminder slots (already localized);
 *   periodic sync shows the due ones, reading/writing the app's IndexedDB `days` store
 *   directly (never upgrading it). Notification actions work without opening the app:
 *   "Yes, I ate" records protein, "+1 glass" logs water. Taps open the right screen.
 * - Web Push (1.2): the push server sends each reminder as a small JSON message, shown
 *   here like a local one. Notification taps and actions also report the event to the
 *   server ("awake", "protein-done", "water-logged") so it stops the follow-ups; when
 *   offline they are queued in the config cache and sent by the app on its next open.
 */
const VERSION = 'dev';
const PRECACHE = ['./', 'manifest.json'];
// 1.4.0: release channel (the build sets 'beta' for the beta URL). A beta keeps its own cache
// names and database (see src/core/channel.js), so it never touches the live app's data.
const CHANNEL = 'live';
const PFX = CHANNEL === 'beta' ? 'vfb-' : 'vf-';
const CACHE = `${PFX}${VERSION}`;
const CONFIG = `${PFX}config`;

// <shell>
// 1.4.0 (critical fix, tester round 3 – the real root cause of ERR_FAILED):
// Cloudflare Pages answers /index.html with a 308 redirect to / (and strips .html everywhere).
// Earlier builds precached 'index.html', so the cache held a *redirected* Response; Chrome
// refuses a redirected response for a navigation (its redirect mode is 'manual') and shows
// ERR_FAILED – on every offline open, on every navigation that fell back to the cache, and on
// every open while an older cache-first worker was in control. Now:
//  - the shell is cached only under './' and every cached or served response is "clean"
//    (a redirected one is copied into a fresh Response, which has no redirect flag);
//  - navigations go network-first with the cached shell after NAV_TIMEOUT ms or a network
//    error, and a small recovery page when both fail – the fetch handler never rejects;
//  - /repair (a static page that unregisters this worker and clears the caches) is never
//    intercepted, so it works even when everything else is broken;
//  - a new version takes over at once (skipWaiting + clients.claim); open pages show an
//    "update ready" bar and reload when the user taps it. The previous version's cache is kept
//    until the next update so an open old page can still load its lazy files.
const NAV_TIMEOUT = 4000;
const SHELL = './';
/** Paths the worker never touches (static self-repair page, the worker itself). */
const BYPASS = /\/(repair(\.html)?\/?|sw\.js)$/;

/** A response without the "redirected" flag (safe for navigations). @param {Response} r */
const clean = (r) =>
  r.redirected ? new Response(r.body, { status: r.status, statusText: r.statusText, headers: r.headers }) : r;

/** Precache one URL; the shell and anything that redirects is stored clean. @param {Cache} c @param {string} u */
async function put(c, u) {
  const r = await fetch(new Request(u, { cache: 'reload', redirect: 'follow' }));
  if (!r.ok) throw new Error(`${u} ${r.status}`);
  await c.put(u, clean(r));
}

self.addEventListener('install', (e) =>
  e.waitUntil(
    (async () => {
      try {
        const c = await caches.open(CACHE);
        // one bad file must not block the whole update: the rest comes from the network on use
        await Promise.allSettled(PRECACHE.filter((u) => u !== 'index.html').map((u) => put(c, u)));
      } catch {
        /* no cache storage (private mode, quota): the network fallback still works */
      }
      await self.skipWaiting();
    })(),
  ),
);

self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      try {
        const cfg = await caches.open(CONFIG);
        const prev = (await (await cfg.match('active'))?.text().catch(() => '')) || '';
        for (const k of await caches.keys())
          if (k.startsWith(PFX) && k !== CACHE && k !== CONFIG && k !== prev) await caches.delete(k);
        if (prev !== CACHE) await cfg.put('active', new Response(CACHE));
      } catch {
        /* ignore: stale caches are harmless now that every miss falls back to the network */
      }
      await self.clients.claim();
    })(),
  ),
);

/** A response that is never a network error. @param {number} status @param {string} [body] */
const plain = (status, body = '') =>
  new Response(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });

/** Recovery page when neither the network nor the cache has the app (shown instead of ERR_FAILED). */
const RECOVER_HTML = `<!doctype html><html lang="bg"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Vidrichka</title><body style="font-family:system-ui,sans-serif;padding:32px 24px;text-align:center;line-height:1.5">
<h1 style="font-size:22px">Видричка не успя да се зареди</h1><p>Провери интернета и опитай пак.<br>Your data is safe on this phone.</p>
<p><button id="r" style="font-size:18px;padding:12px 22px;border-radius:12px">Опитай пак</button></p>
<p><a href="repair" style="font-size:15px">Поправи и презареди</a></p>
<script>document.getElementById('r').onclick=function(){location.reload()};</script></body></html>`;

/** The cached app shell (clean), or undefined. */
async function shell() {
  try {
    const hit = (await (await caches.open(CACHE)).match(SHELL)) ?? (await caches.match(SHELL));
    return hit ? clean(hit) : undefined;
  } catch {
    return undefined;
  }
}

/** Navigation: network first, the cached shell after a timeout or an error. @param {Request} req */
async function navigate(req) {
  const net = fetch(req).then(
    (r) => r,
    () => null,
  );
  /** @type {Response | null | undefined} */
  let res = await Promise.race([net, new Promise((ok) => setTimeout(() => ok(undefined), NAV_TIMEOUT))]);
  // an opaque redirect is fine for a navigation (the browser follows it); a followed one is not
  if (res && (res.ok || res.type === 'opaqueredirect')) return clean(res);
  const cached = await shell();
  if (cached) return cached;
  if (res === undefined) res = await net; // slow network and nothing cached: keep waiting
  return res
    ? clean(res)
    : new Response(RECOVER_HTML, { status: 503, headers: { 'Content-Type': 'text/html; charset=utf-8' } });
}

/** Other same-origin GETs: cache first (this or the previous version), then the network. @param {Request} req */
async function asset(req) {
  try {
    const hit =
      (await (await caches.open(CACHE)).match(req, { ignoreSearch: true })) ??
      (await caches.match(req, { ignoreSearch: true }));
    if (hit) return hit;
  } catch {
    /* fall through to the network */
  }
  try {
    const res = await fetch(req);
    if (res.ok && !res.redirected)
      caches
        .open(CACHE)
        .then((c) => c.put(req, res.clone()))
        .catch(() => {});
    return res;
  } catch {
    return plain(504, 'offline');
  }
}

/** Dev (no build): network first with a cache fallback. @param {Request} req */
async function devFetch(req) {
  try {
    return await fetch(req);
  } catch {
    const hit = await caches
      .match(req.mode === 'navigate' ? SHELL : req, { ignoreSearch: true })
      .catch(() => undefined);
    return hit ? clean(hit) : plain(504, 'offline');
  }
}

self.addEventListener('fetch', (e) => {
  const req = e.request,
    url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Open Food Facts etc. go straight to the network
  if (BYPASS.test(url.pathname)) return; // /repair and sw.js: always the plain network
  const run = VERSION === 'dev' ? devFetch(req) : req.mode === 'navigate' ? navigate(req) : asset(req);
  // last line of defence: whatever went wrong above, answer with the plain network
  e.respondWith(run.catch(() => fetch(req).catch(() => plain(504, 'offline'))));
});
// </shell>

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'VERSION') e.ports?.[0]?.postMessage(VERSION);
  if (e.data?.type === 'reminders') e.waitUntil(saveConfig(e.data));
  if (e.data?.type === 'daily') e.waitUntil(saveConfig({ daily: e.data.daily }));
  if (e.data?.type === 'daily-show') e.waitUntil(Promise.all(e.data.slots.map((/** @type {any} */ s) => showSlot(s))));
  if (e.data?.type === 'daily-close') e.waitUntil(closeTags(e.data.tags));
  if (e.data?.type === 'push') e.waitUntil(saveConfig({ push: e.data.push }));
});

/** @param {any} data */
async function saveConfig(data) {
  const c = await caches.open(CONFIG);
  const old = await (await c.match('config'))?.json().catch(() => ({}));
  await c.put('config', new Response(JSON.stringify({ ...old, ...data })));
}

/** Show the reminder if it is due today and was not shown yet. */
async function maybeRemind() {
  const c = await caches.open(CONFIG);
  const cfg = await (await c.match('config'))?.json().catch(() => null);
  const r = cfg?.reminders;
  if (!r?.enabled) return;
  const now = new Date(),
    today = now.toLocaleDateString('sv'),
    wd = (now.getDay() + 6) % 7;
  const [h, m] = String(r.time).split(':').map(Number);
  if (!r.days.includes(wd) || now.getHours() * 60 + now.getMinutes() < h * 60 + m || cfg.lastShown === today) return;
  const open = (await self.clients.matchAll({ type: 'window' })).some((w) => w.visibilityState === 'visible');
  if (open) return; // the app shows it itself
  await self.registration.showNotification(cfg.title || 'Vidrichka', {
    body: cfg.body || '',
    tag: 'reminder',
    icon: 'assets/icons/icon-192.png',
    badge: 'assets/icons/icon-192.png',
  });
  await saveConfig({ lastShown: today });
}

// ---- Daily rhythm ------------------------------------------------------------------

const DB_NAME = CHANNEL === 'beta' ? 'vidrichka-fitness-beta' : 'vidrichka-fitness';
const ICON = 'assets/icons/icon-192.png';
const today = () => new Date().toLocaleDateString('sv'); // YYYY-MM-DD, local time

// Copy of dueSlots() from src/features/daily/logic.js (this file is not bundled);
// tests/unit/daily.test.js checks both behave the same.
// <due>
function dueSlots(slots, now, recs) {
  const seen = slots.filter((s) => {
    const r = recs[s.day] || {};
    return (
      s.at <= now &&
      now < s.until &&
      !(r.shown && r.shown[s.kind]) &&
      !(s.skipIf || []).some((f) => r[f]) &&
      (s.needs || []).every((f) => r[f])
    );
  });
  const latest = new Map();
  seen.forEach((s) => {
    const k = `${s.day}:${s.group}`,
      cur = latest.get(k);
    if (!cur || cur.at < s.at) latest.set(k, s);
  });
  return { show: [...latest.values()], seen };
}
// </due>

/** Open the app's database as is (never creates or upgrades it). @returns {Promise<IDBDatabase>} */
function openDb() {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME);
    req.onupgradeneeded = () => req.transaction?.abort(); // no data yet: leave creation to the app
    req.onsuccess = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('days')) return (db.close(), rej(new Error('app data not migrated yet')));
      db.onversionchange = () => db.close();
      res(db);
    };
    req.onerror = () => rej(req.error);
    req.onblocked = () => rej(new Error('blocked'));
  });
}

/**
 * Read-modify-write rows in one transaction, then tell open app windows to reload them.
 * @param {string} store @param {string[]} ids @param {(row: any, id: string) => any} fn
 */
async function update(store, ids, fn) {
  const db = await openDb();
  try {
    await new Promise((res, rej) => {
      const tx = db.transaction(store, 'readwrite'),
        os = tx.objectStore(store);
      ids.forEach((id) => {
        const g = os.get(id);
        g.onsuccess = () => os.put({ ...fn(g.result ?? { id }, id), id });
      });
      tx.oncomplete = res;
      tx.onerror = tx.onabort = () => rej(tx.error);
    });
  } finally {
    db.close();
  }
  for (const w of await self.clients.matchAll({ type: 'window', includeUncontrolled: true }))
    w.postMessage({ type: 'db', store, ids });
}

/** @param {string} store @param {string[]} ids */
async function read(store, ids) {
  const db = await openDb();
  try {
    const os = db.transaction(store).objectStore(store);
    return await Promise.all(
      ids.map(
        (id) =>
          new Promise((res) => {
            const g = os.get(id);
            g.onsuccess = () => res(g.result);
            g.onerror = () => res(undefined);
          }),
      ),
    );
  } finally {
    db.close();
  }
}

/** Close shown/scheduled notifications by tag. @param {string[]} tags */
async function closeTags(tags) {
  for (const tag of tags)
    for (const n of await self.registration.getNotifications(/** @type {any} */ ({ tag, includeTriggered: true })))
      n.close();
}

/**
 * Show one reminder slot (title/body/action labels were localized by the app).
 * `silent` and `vibrate` are Android-only — iOS ignores them (and has no action buttons).
 * @param {any} s
 */
function showSlot(s) {
  /** @type {any} */
  const o = {
    body: s.body,
    tag: `vf-${s.group}`,
    data: { day: s.day, kind: s.kind, group: s.group, route: s.route },
    icon: ICON,
    badge: ICON,
    timestamp: s.at,
    actions: s.actions || [],
  };
  if (s.silent) o.silent = true;
  else ((o.renotify = true), (o.vibrate = s.loud ? [600, 200, 600, 200, 600] : [200, 100, 200]));
  if (s.loud) o.requireInteraction = true;
  return self.registration.showNotification(s.title, o);
}

/** Periodic check: show the daily reminders that are due (the open app handles its own). */
async function runDaily() {
  const cfg = await (await (await caches.open(CONFIG)).match('config'))?.json().catch(() => null);
  const slots = cfg?.daily?.slots;
  if (!slots?.length) return;
  if ((await self.clients.matchAll({ type: 'window' })).some((w) => w.visibilityState === 'visible')) return;
  const now = Date.now(),
    days = [...new Set(slots.map((/** @type {any} */ s) => s.day))];
  const rows = await read('days', days);
  const recs = Object.fromEntries(days.map((d, i) => [d, rows[i] || {}]));
  const { show, seen } = dueSlots(slots, now, recs);
  if (!seen.length) return;
  const touched = [...new Set(seen.map((s) => s.day))];
  await update('days', touched, (r, id) => ({
    ...r,
    shown: { ...r.shown, ...Object.fromEntries(seen.filter((s) => s.day === id).map((s) => [s.kind, now])) },
  }));
  for (const s of show) await showSlot(s);
}

/** "+1 glass" on a water reminder: log it without opening the app. */
async function addWater() {
  const id = `water_${today()}`;
  let n = 0;
  await update('food', [id], (r) => ((n = (r.glasses || 0) + 1), { ...r, type: 'water', date: today(), glasses: n }));
  const cfg = await (await (await caches.open(CONFIG)).match('config'))?.json().catch(() => null);
  const txt = String(cfg?.daily?.waterLogged || '+1 💧 {n}/{goal}')
    .replace('{n}', String(n))
    .replace('{goal}', String(cfg?.daily?.waterGoal || 8));
  await self.registration.showNotification(txt, {
    tag: 'vf-water',
    silent: true,
    icon: ICON,
    badge: ICON,
    data: { route: 'food?water' },
  });
}

// --- Web Push (1.2) -----------------------------------------------------------------

const readConfig = async () => (await (await caches.open(CONFIG)).match('config'))?.json().catch(() => null);

/**
 * Report a notification action to the push server; queue it if offline (the app
 * flushes the queue on its next open). @param {string} type
 */
async function postEvent(type) {
  const p = (await readConfig())?.push;
  if (!p?.url || !p.id) return;
  const e = { type, at: Date.now() };
  try {
    const r = await fetch(`${p.url}/event`, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({ id: p.id, ...e }),
    });
    if (r.status >= 500) throw new Error(String(r.status));
  } catch {
    const c = await caches.open(CONFIG);
    const q = (await (await c.match('push-queue'))?.json().catch(() => [])) || [];
    await c.put('push-queue', new Response(JSON.stringify([...q, e].slice(-30))));
  }
}

// A push message is one reminder slot ({title, body, tag, route, silent, loud, actions,
// day, kind, group, at}). It is always shown (browsers require it) and marked as shown
// in the day's record, like a locally planned one.
self.addEventListener('push', (e) => {
  /** @type {any} */
  let m = {};
  try {
    m = e.data ? e.data.json() : {};
  } catch {
    m = { body: e.data?.text() };
  }
  const s = {
    title: m.title || 'Vidrichka',
    body: m.body || '',
    group: m.group || 'push',
    kind: m.kind || 'push',
    day: m.day || today(),
    route: typeof m.route === 'string' ? m.route : '',
    silent: !!m.silent,
    loud: !!m.loud,
    at: m.at || Date.now(),
    actions: Array.isArray(m.actions) ? m.actions.slice(0, 2) : [],
  };
  e.waitUntil(
    Promise.all([
      showSlot(s),
      update('days', [s.day], (r) => ({ ...r, shown: { ...r.shown, [s.kind]: Date.now() } })).catch(() => {}),
    ]),
  );
});

// The browser renewed the subscription: register the new one with the same device id.
self.addEventListener('pushsubscriptionchange', (e) => {
  e.waitUntil(
    (async () => {
      const p = (await readConfig())?.push;
      if (!p?.url || !p.id || !p.key) return;
      const key = Uint8Array.from(atob(p.key.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
      const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
      await fetch(`${p.url}/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({ id: p.id, subscription: sub.toJSON(), ...p.reg }),
      });
    })().catch(() => {}),
  );
});

self.addEventListener(
  'periodicsync',
  (e) => e.tag === 'reminder' && e.waitUntil(Promise.allSettled([maybeRemind(), runDaily()])),
);

self.addEventListener('notificationclick', (e) => {
  const n = e.notification,
    d = n.data || {};
  n.close();
  e.waitUntil(
    (async () => {
      let route = d.route;
      if (e.action === 'water-add') return Promise.all([addWater(), postEvent('water-logged')]);
      if (e.action === 'protein-yes') {
        // 1.2.1: no credit here — the app records it once a breakfast entry is saved.
        await closeTags(['vf-protein']);
        route = 'food/add/breakfast?protein'; // log what she ate (Food › Breakfast)
      } else if (d.group === 'morning') {
        // Tapped the 7:30 (or 8:15) one: she is up – the 8:15 alarm must not fire.
        await Promise.all([
          update('days', [d.day], (r) => ({ ...r, ack: r.ack || Date.now() })).catch(() => {}),
          postEvent('awake'),
        ]);
        await closeTags(['vf-morning']);
      }
      const url = route ? `./#/${route}` : n.tag === 'reminder' ? './#/workouts' : './';
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins[0]) {
        wins[0].postMessage({ type: 'open', path: url.replace('./#/', '') });
        return wins[0].focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
