/**
 * Service worker: offline app shell + reminders.
 * - Precache: the build replaces VERSION and PRECACHE with the full file list (cache
 *   first); in dev the list is minimal and requests go network-first with a cache fallback.
 * - Updates: a new version waits until the page asks it to SKIP_WAITING (update prompt).
 * - Reminders: best-effort via Periodic Background Sync (installed Chromium only) and
 *   notification clicks that focus/open the app.
 */
const VERSION = 'dev';
const PRECACHE = ['./', 'index.html', 'manifest.json'];
const CACHE = `vf-${VERSION}`;
const CONFIG = 'vf-config';

self.addEventListener('install', (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE))));

self.addEventListener('activate', (e) =>
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith('vf-') && k !== CACHE && k !== CONFIG) await caches.delete(k);
    await self.clients.claim();
  })()),
);

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
  if (e.data?.type === 'reminders') e.waitUntil(saveConfig(e.data));
});

self.addEventListener('fetch', (e) => {
  const req = e.request, url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== location.origin) return; // Open Food Facts etc. go straight to the network
  if (req.mode === 'navigate') {
    const shell = () => caches.match('index.html', { ignoreSearch: true });
    e.respondWith(VERSION === 'dev' ? fetch(req).catch(async () => (await shell()) ?? Response.error()) : shell().then((r) => r ?? fetch(req)));
    return;
  }
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const net = () => fetch(req).then((res) => (res.ok && cache.put(req, res.clone()), res));
    if (VERSION === 'dev') return net().catch(async () => (await cache.match(req, { ignoreSearch: true })) ?? Response.error()); // dev: network first
    return (await cache.match(req, { ignoreSearch: true })) ?? net(); // build: hashed files, cache first
  })());
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
  const now = new Date(), today = now.toLocaleDateString('sv'), wd = (now.getDay() + 6) % 7;
  const [h, m] = String(r.time).split(':').map(Number);
  if (!r.days.includes(wd) || now.getHours() * 60 + now.getMinutes() < h * 60 + m || cfg.lastShown === today) return;
  const open = (await self.clients.matchAll({ type: 'window' })).some((w) => w.visibilityState === 'visible');
  if (open) return; // the app shows it itself
  await self.registration.showNotification(cfg.title || 'Vidrichka', { body: cfg.body || '', tag: 'reminder', icon: 'assets/icons/icon-192.png', badge: 'assets/icons/icon-192.png' });
  await saveConfig({ lastShown: today });
}

self.addEventListener('periodicsync', (e) => e.tag === 'reminder' && e.waitUntil(maybeRemind()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins[0]) return wins[0].focus();
    return self.clients.openWindow(e.notification.tag === 'reminder' ? './#/workouts' : './');
  })());
});
