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

   **Partial workouts (1.2):** `minSetsForWorkout(planned)` in `features/motivation/xp.js` is half of the planned sets rounded up, at least 3 (or all sets when fewer than 3 are planned). A session below that is saved with `partial: true`. It earns only the per-set XP (no workout bonus), does not count for the weekly streak, goal or week dots, and still counts for volume, sets and PRs. Deleting a session (`deleteSession` in `features/workouts/session.js`) recomputes the PRs and XP awards of later sessions with `recomputeAfterDelete` and removes its own award. Badges stay earned.

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

## Web Push and the protein bar (1.2)

- **Server** (`server/`, Cloudflare Worker + D1, cron every minute): `src/schedule.js` turns a device's settings and today's flags into slots in the device's IANA time zone (DST-safe: a gap time shifts forward, an ambiguous one takes the later instant). `src/app.js` has the HTTP API (`/subscribe`, `/settings`, `/event`, `/unsubscribe`, `/health`) and the cron run. A slot is claimed in the `sent` table before it is sent, so each reminder goes out at most once per day per device. `src/webpush.js` does RFC 8291 `aes128gcm` encryption and RFC 8292 VAPID with WebCrypto, with no dependencies. See [server/README.md](../server/README.md).
- **App:** `features/daily/push.js` subscribes and unsubscribes, syncs settings, texts and time zone, and posts events, with an offline queue in the `vf-config` cache. `push-format.js` is the pure wire format, shared with the tests. While `pushOn()`, `notify.js` plans nothing locally. The service worker shows `push` messages through the same `showSlot`, reports notification taps and actions to `/event`, and re-subscribes on `pushsubscriptionchange`.
- **Protein bar:** `logic.js › proteinBar(rec, now)` is pure and derives `running` / `overdue` / `done` / `skipped` from the stored `proteinStart`, `proteinAt` and `proteinSkip`, so the state survives reloads. Home's `mount` runs a one-second interval. It only sets the `.ptime` text, and it emits `ui:refresh` only when the mode changes.
- **Ate it → breakfast:** `BREAKFAST_LOGGER` (`food/add/breakfast?protein`) reuses the Food add view. The `?protein` flag pins today's date and shows the hint. The service worker opens the same route after the notification's **Yes, I ate**.
- **Micro animations:** `features/celebrations/micro.js` listens to `water:added` and `food:logged` and draws into a fixed `#micro` layer outside `#page` (`pointer-events: none`). There is one live element per kind: a new log replaces it, and the sound is throttled. Nothing in the page re-renders. With reduced motion it shows a still frame.
- **Push config:** `features/daily/push-config.js` holds `PUSH_URL` and the VAPID public key. While `PUSH_URL` is empty, the push card and the push items in What's new are hidden.

## Progress photo sessions (1.2.1)

- **Model:** each `photos` row is one picture: `{id, session, pose: 'front'|'back'|'left'|'right', date, time, ts, edited?, shot, blob}`. A session is the set of rows that share `session`, with up to one photo per pose. `date`/`time` is the **session date**, the same on every row of the session. `shot` is that photo's own default date with its source (`exif`, `file` or `upload`), and `ts` is when it was added. Pure rules are in `features/body/photo-logic.js`: sessions, sorting, the session date, the per-pose before/after, the monthly set and streak, slot assignment, and moves. Storage is in `photos.js` and the UI in `views/photos.js`.
- **Default date:** `features/body/exif.js` is a tiny dependency-free JPEG EXIF reader. It reads only `DateTimeOriginal` (then `DateTimeDigitized`) from the first 256 KB of the original file, before it is shrunk, because the resized JPEG has no EXIF. No other metadata is read or stored, so no location. Without EXIF (for example a HEIC that iOS converted), the file's `lastModified` is used, but only if it falls on an earlier day than today. Otherwise the upload moment is used. Future dates and dates before 1990 are ignored. The session date is the **earliest** capture date of its photos.
- **Edited dates:** the date field in the session sheet sets the date for the whole session and marks it `edited`, and it stays that way when more photos are added. An edited date is fully valid: it re-sorts the timeline and the before/after, and it counts for the monthly set and streak.
- **Before/after:** this is per pose, by session date. The oldest photo is **Before** and the newest is **Now**. Either side can be picked again, but never the same photo on both sides. With a single photo, it is **Now** and **Before** shows an empty placeholder.
- **Monthly set:** the day is **the 1st** (`data/photos.js › PHOTO_DAY`).
  - **Daily quest:** "Monthly progress photos" (25 XP) shows from the 1st until all 4 poses have a photo dated in the current month, across any number of sessions. On the day it is completed it stays visible as done.
  - **Bonus:** completing a month awards `photoset:YYYY-MM` (100 XP, once per month). It also emits `photos:set` (the BIG celebration) and sets `photoSet` on the month's `YYYY-MM-01` day record.
  - **Reminder:** the `photos` daily slot fires at 10:00 on the 1st (Profile › Reminders) and is skipped once `photoSet` is set. It is always planned on the phone itself (`notify.js › LOCAL_ONLY`), also while Web Push is on. The push server is not involved, but its text table has a `photos` entry for completeness.
  - **Streak:** the monthly streak is the number of consecutive complete months. The current month counts once it is complete, so the streak does not "break" on the 2nd.
- **Celebrations:** the session sheet emits `photos:sessionStart` and `photos:sessionEnd`. While a session is open, level-ups, badges and the monthly set are held. On close, a SMALL toast plays first, with a random otter move (`wave`, `hop`, `spin` or `flash`, never the same twice in a row) and a random title. The held badges and level-ups follow as small tap-away toasts that do not block. The monthly-set BIG celebration comes last.
- **Migration 2 → 3:** every existing photo becomes its own session with the photo in the Front slot. It keeps its date and blob, and gets `shot.source: 'upload'`. Rows that already have a session are left unchanged, so re-importing a 1.2.1 backup is a no-op.
