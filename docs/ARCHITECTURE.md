# Architecture

Vidrichka Fitness is a static, offline-first PWA. It is written in vanilla JavaScript ES modules with **no runtime dependencies**. The only exception is the vendored zxing barcode fallback, which loads lazily and only when needed. All data stays on the device in IndexedDB.

```
index.html            app shell (theme pre-paint script, iOS meta, splash screens)
manifest.json         PWA manifest (relative URLs → works from a GitHub Pages subpath)
sw.js                 service worker (dev: network-first; build: cache-first precache)
src/
  main.js             entry: load data → settings → features → router → SW
  app.css             CSS entry (@imports every feature's CSS)
  core/               framework-free building blocks (no UI)
    bus.js            tiny pub/sub event bus
    db.js             IndexedDB open/upgrade (SCHEMA = list of upgrade steps)
    store.js          in-memory cache over IndexedDB, snapshot()/replaceAll()
    migrations.js     data-model versions, validate()/migrate() for backups
    registry.js       extension points: tabs, routes, badges, quests, progressTabs
    router.js         hash router (#/path), lazy view loading, back handling
    i18n.js           t(key, vars), L({en,bg}), date/number formatting
    settings.js       typed settings with DEFAULTS
    theme.js, dates.js
  ui/                 reusable rendering helpers
    dom.js            html`` tagged template (auto-escaping), event delegation
    components.js     ring, stepper, seg, toggle, headers, …
    sheet.js          bottom sheets, dialogs, toasts (rendered into #layer)
    chart.js, icons.js, confetti.js, share.js, feedback.js (beeps/vibration/notifications), nav.js
  data/               static data: exercises, workouts (3 plans), foods, measurements, i18n/{en,bg}
  features/<name>/    one folder per feature
    index.js          registers tabs/routes/badges/quests (lazy view imports)
    api.js            the feature's public functions for other features
    logic.js | *.js   pure, unit-tested maths
    views/*.js        screens: { render, actions, mount?, unmount?, tab?, hideNav? }
    <name>.css        the feature's styles
tests/unit            node:test suites for the pure modules and data/i18n completeness
tests/e2e/smoke.mjs   Playwright flows at 412×915 (Chromium Android, WebKit iPhone 14)
tools/                serve.mjs (dev server), build.mjs (esbuild → dist), lighthouse.mjs, make-icons.mjs
```

## Data flow

1. `store.load()` reads every IndexedDB object store into memory once. Reads are then synchronous (`all`, `get`, `kv`).
2. Writes (`put`, `remove`, `setKv`) update memory immediately, persist asynchronously and emit `store:<name>` on the bus.
3. Views are pure-ish render functions that return HTML strings via `html```. User input is delegated: elements carry `data-act`, `data-change`, `data-input`, `data-go`or`data-back`, and the router calls the matching function from the view's `actions`. An action that returns `false` skips the re-render; otherwise the view re-renders. Re-renders are **in place** (`morph`in`ui/dom.js`): the new HTML is diffed against the live DOM, so unchanged nodes, focus, scroll position and running CSS animations survive a tap. Only navigating to a new page replaces the DOM (`swap`). Keep generated ids deterministic (no random/counter ids in SVG gradients or clip paths), or morph has to replace those nodes.
4. Cross-feature effects go through the bus. Saving a finished session emits `store:sessions` and `store:any`. The motivation rewards engine listens, awards XP and badges, and emits `level:up` / `badge:earned`; these show as toasts and on the summary screen.

## Extension points (registry)

`register(kind, ...items)` in `core/registry.js` accepts:

| kind           | item                                                  | used by                     |
| -------------- | ----------------------------------------------------- | --------------------------- |
| `tabs`         | `{id, icon, label, path, order}`                      | bottom navigation           |
| `routes`       | `{pattern: 'plan/:id', load: async (params) => View}` | router (lazy-loaded chunks) |
| `badges`       | `{id, label, icon, color, earned(stats)}`             | motivation engine, Progress |
| `quests`       | `{id, label, xp, show?(stats), done(stats), go}`      | Home                        |
| `progressTabs` | `{id, label, order, load}`                            | Progress segmented tabs     |

Features never import another feature's views, only its `api.js`. Removing a feature folder and its import in `features/index.js` removes the feature.

## Persistence, versions and backups

- **IndexedDB schema** (`core/db.js`): `SCHEMA` is an array of upgrade functions. The DB version is `SCHEMA.length`, so adding a store means appending a step.
- **Data model** (`core/migrations.js`): `MIGRATIONS` is an array of pure `snapshot → snapshot` steps, and `DATA_VERSION = MIGRATIONS.length + 1`. On start-up, stored data is migrated. Imported backups are validated (`validate`) and migrated the same way, so a backup from an older version still restores.
- **Backup file**: `{app: 'vidrichka-fitness', version, exportedAt, stores: {...}}`, with photos embedded as data URLs.
- `navigator.storage.persist()` is requested, and the app reminds you to back up when the last backup is old.

## Performance

- The router lazy-loads every view as its own chunk. The build uses esbuild code splitting with content-hashed names.
- Initial JS is about 26 kB gzipped, CSS about 8 kB gzipped and the self-hosted fonts are about 32 kB. Bulgarian strings, zxing and every non-home screen load on demand.
- The service worker precaches the built app shell and all chunks (cache-first), so the app works fully offline after the first visit. A new deploy produces a new `VERSION`, and the app shows an "Update ready" bar.

## Platform notes

- **iOS Safari (Home Screen):** apple-touch-icon and splash screens, `viewport-fit=cover` with safe-area insets, `100dvh`, inputs at ≥16 px (no zoom), `touch-action: manipulation` (no double-tap zoom). There is no vibration API on iOS, so sound is used instead; audio is unlocked by a tap. Notifications are only available in the installed app on iOS 16.4+ and are requested from a tap.
- **Android Chrome:** `beforeinstallprompt` install button, vibration, and Periodic Background Sync for reminders where the browser allows it.

## Daily rhythm and celebrations (1.1)

- `features/daily/logic.js` is pure: it plans each day's reminder **slots** (`planDay`), picks the due ones (`dueSlots`, one per group, each shown once via `days.shown`), and computes sleep hours, the bedtime estimate and the protein countdown. Data lives in the `days` store (one row per day key; bedtime belongs to the evening's row until 04:00).
- `features/daily/notify.js` localizes slots and posts the next 7 days to the service worker. `sw.js` keeps a copy of `dueSlots` between `// <due>` markers (a unit test checks they agree), shows due slots on `periodicsync`, and handles notification actions by writing straight to IndexedDB (it opens the DB without a version, so it never upgrades it). It then posts `{type:'db'}` so an open app reloads those rows.
- `features/celebrations` maps app events (`water:added`, `set:done`, `protein:done`, `checkin:done`, `workout:finished`, `quests:all`, `level:up`, `badge:earned`, `streak:week`, `challenge:done`) to small, medium and big scenes. A queue plays them one at a time; scenes respect `prefers-reduced-motion`, and sounds respect the Profile toggle.
