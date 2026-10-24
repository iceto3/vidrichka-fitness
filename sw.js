/**
 * Service worker: offline app shell + reminders.
 * - Precache: the build replaces VERSION and PRECACHE with the full file list (cache
 *   first); in dev the list is minimal and requests go network-first with a cache fallback.
 * - Updates: a new version waits until the page asks it to SKIP_WAITING (update prompt).
 * - Reminders: best-effort via Periodic Background Sync (installed Chromium only) and
 *   notification clicks that focus/open the app.
 * - Daily rhythm (1.1): the app posts the next days' reminder slots (already localized);
 *   periodic sync shows the due ones, reading/writing the app's IndexedDB `days` store
 *   directly (never upgrading it). Notification actions work without opening the app:
 *   "Yes, I ate" records protein, "+1 glass" logs water. Taps open the right screen.
 */
const VERSION = 'dev';
const PRECACHE = ['./', 'index.html', 'manifest.json'];
const CACHE = `vf-${VERSION}`;
const CONFIG = 'vf-config';

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE))));

self.addEventListener('activate', (e) =>
  e.waitUntil(
    (async () => {
      for (const k of await caches.keys())
        if (k.startsWith('vf-') && k !== CACHE && k !== CONFIG) await caches.delete(k);
      await self.clients.claim();
    })(),
  ),
);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'reminders') e.waitUntil(saveConfig(e.data));
  if (e.data?.type === 'daily') e.waitUntil(saveConfig({ daily: e.data.daily }));
  if (e.data?.type === 'daily-show') e.waitUntil(Promise.all(e.data.slots.map((/** @type {any} */ s) => showSlot(s))));
  if (e.data?.type === 'daily-close') e.waitUntil(closeTags(e.data.tags));
});

self.addEventListener('fetch', (e) => {
  const req = e.request,
    url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Open Food Facts etc. go straight to the network
  if (req.mode === 'navigate') {
    const shell = () => caches.match('index.html', { ignoreSearch: true });
    e.respondWith(
      VERSION === 'dev'
        ? fetch(req).catch(async () => (await shell()) ?? Response.error())
        : shell().then((r) => r ?? fetch(req)),
    );
    return;
  }
  e.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const net = () => fetch(req).then((res) => (res.ok && cache.put(req, res.clone()), res));
      if (VERSION === 'dev')
        return net().catch(async () => (await cache.match(req, { ignoreSearch: true })) ?? Response.error()); // dev: network first
      return (await cache.match(req, { ignoreSearch: true })) ?? net(); // build: hashed files, cache first
    })(),
  );
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

const DB_NAME = 'vidrichka-fitness';
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
      if (e.action === 'water-add') return addWater();
      if (e.action === 'protein-yes') {
        await update('days', [d.day], (r) => (r.proteinAt ? r : { ...r, proteinAt: Date.now() }));
        return closeTags(['vf-protein']);
      }
      if (d.group === 'morning') {
        // Tapped the 7:30 (or 8:15) one: she is up – the 8:15 alarm must not fire.
        await update('days', [d.day], (r) => ({ ...r, ack: r.ack || Date.now() })).catch(() => {});
        await closeTags(['vf-morning']);
      }
      const url = d.route ? `./#/${d.route}` : n.tag === 'reminder' ? './#/workouts' : './';
      const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      if (wins[0]) {
        wins[0].postMessage({ type: 'open', path: url.replace('./#/', '') });
        return wins[0].focus();
      }
      return self.clients.openWindow(url);
    })(),
  );
});
