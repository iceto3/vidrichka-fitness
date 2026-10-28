# Architecture

Vidrichka Fitness is a static, offline-first PWA. It is written in vanilla JavaScript ES modules with **no runtime dependencies**. The only exception is the vendored zxing barcode fallback, which loads lazily and only when needed. All data stays on the device in IndexedDB.

```
index.html            app shell (theme pre-paint script, iOS meta, splash screens)
manifest.json         PWA manifest (relative URLs → works from a GitHub Pages subpath)
sw.js                 service worker (dev: network-first; build: network-first pages, cache-first precached assets)
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
- **Bottom nav (1.4.1).** `.nav` is `position: fixed; bottom: 0`, centred with `left/right + margin` (no transform), and `#page` keeps `--nav-h` (which includes the bottom safe area) + 16 px free at the end. While the page is pinch-zoomed, `ui/nav-pin.js` moves and scales the bar onto the visual viewport (otherwise it stays at the bottom of the unzoomed page and scrolls away with the content); at normal zoom it sets nothing.
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
- **Service worker and self-repair (1.4.0).** `sw.js` never fails a request: page navigations go to the network first (4 s) and fall back to the precached shell, which is stored **only as `./`** – on Cloudflare Pages `/index.html` is a 308 redirect to `/` and `.html` is stripped, and a cached _redirected_ response makes Chrome fail a navigation with `ERR_FAILED` (the beta-1/2 bug). Every response the worker caches or serves for a navigation is a clean copy (`clean()` drops the redirect flag). Assets are cache-first (this version, then any older cache) with the network as fallback; anything unexpected falls back to `fetch`. `install` precaches file by file (a failing file does not block it) and always calls `skipWaiting()`; `activate` deletes this app's old versioned caches (`vf-`/`vfb-` prefix – GitHub Pages shares the origin) except `*config` and the previous version (kept until the next update so an open old page can load its lazy chunks), then claims clients. The page (`main.js`) shows the update bar when a new worker takes control of an already controlled page and reloads only when tapped. (1.4.1) The bar has its own strip under the notch: while it is shown, `main.js` sets `--updh` on `<html>` to its height and `--sat` (safe area top + `--updh`) moves every header, Край and close button below it; `tests/e2e/sw.mjs` checks Край is clickable during a workout. `/repair` (`repair.html`, copied by the build, never precached) is bypassed by the worker by path: it unregisters the worker, clears the app caches and reopens the app; Profile links to it and the recovery page (network and cache both failed) too. The inline `<script id="heal">` in `index.html` does the same automatically when a script/stylesheet or lazy chunk fails or nothing started 20 s after load under a controller – at most once per 5 minutes and never offline. Tests: `tests/unit/v140-sw.test.js` (vm) and `tests/e2e/sw.mjs` (real Chromium worker on a Pages-like server: previous-build repro, upgrade, offline, slow network, /repair) – run `node tests/e2e/sw.mjs --dir dist-beta --prev <previous dist-beta>`.
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

## Voice logging (1.3)

- **Server** (`voice/`, the stateless Cloudflare Worker `vidrichka-voice`):
  - `src/prompt.js` has the strict system prompt and the JSON schema.
    - The user text is treated as data and never as instructions.
    - Plain water is the only water; other drinks are food.
    - Macros are for the whole portion, and dates are never in the future and at most 7 days back.
  - `src/parse.js` validates the request (`text` ≤ 500 chars, `today`, `time`, `tz`, `lang`) and normalizes the model output. It clamps the numbers, falls back to the meal for the time of day and drops anything malformed.
  - `src/app.js` is the HTTP layer:
    - Origin allow-list and CORS, `GET /health` and `POST /parse` only.
    - The rate limit: the `LIMITER` binding plus a per-isolate fallback.
    - The xAI call with a 20 s timeout and a `max_tokens` cap.
    - It logs only status codes.
  - `src/off.js` (1.4.0, additive): `GET /off-search?q=&lang=` proxies Open Food Facts text search for the app (OFF's search endpoints have no usable CORS from a browser). Legacy `cgi/search.pl` first, the search service as fallback, only the fields the app reads, cached a day (Cache API + a per-isolate memo), `OFF_LIMITER` 20/min per IP, the query is never logged. The app (`food/off.js › search()`) makes one request per debounced search, memoised per session, and goes to OFF directly only when no Worker is configured or it answers 404.
  - Tests mock xAI. `npm run smoke:live` makes two real calls with the key from the environment and never prints it.
- **App** (`features/voice/`):
  - `config.js › VOICE_URL` (on localhost, `localStorage['vf-voice-url']` can override it, which the e2e test uses).
  - `api.js` checks `/health` at start and when the phone comes online. `voiceReady()` gates the buttons on Home and Food › Add. `parseText()` sends a `text/plain` POST (a simple request, so no CORS preflight).
  - `logic.js` is pure. It builds the request body, converts water to glasses, picks the meal (`assignMeals`: a meal named in the sentence wins; else a said time or a past day keeps the server's meal; else the screen's meal or the current one) and builds the rows (with `fib`/`salt` when sent) and the per-day water.
  - `views/voice.js` has the dictation sheet. Since 1.3.1 there is no confirm sheet: `saveEntries()` calls `food/api.js › logRows()` (rows with `source: 'voice'`, one `food:logged`) and `setWater()` at once, then shows an Undo snackbar that lists what was added.

## Food values from Open Food Facts (1.4.0)

- `food/logic.js` is the single, pure, unit-tested place for product values: `fromOff()` reads per-100 g values (an unlisted kcal/П/В/М counts as 0 and is named in `missing`; fibre/salt stay unknown), `implausible()` is the ONE plausibility check (negative, kcal > 900, a value or П+В+М > 100 g, kcal vs 4·П + 4·В + 9·М (+ 7·alcohol) off by > 30 % and > 30 kcal), `missingValues()` says what to ask the user for, `applyFix()` turns the fill-in form into the corrected food.
- `food/off.js › reliable()` applies the check to every barcode lookup (`product()` answers `{unreliable, name}` → treated as not found) and every search result (dropped). Cached OFF copies in the `foods` store pass the same check in the scanner; user-corrected (`fixed`) and custom foods are trusted.
- UI: `views/notice.js › missingNotice()` is the one notice component (grams sheet, diary item, fill-in form); `views/grams.js › fixFood()` opens `manual.js › openFixForm()` over the current sheet and saves through `api.saveFoodFix()` (the food plus its diary rows that still had missing values). No data migration: `missing` / `fixed` are optional fields.

## Undo and "Recently deleted" (1.3.1)

- `ui/sheet.js › snack(text, onUndo)` shows an **Отмени** snackbar for 8 s (one at a time).
- `ui/undo.js`:
  - `deleteWithUndo(kind, rows, meta)` moves rows into the bin (`core/trash.js › trash()`) and offers Undo (= restore).
  - `undoEdit(text, changes)` restores the `before` rows and removes `added` ids, for edits that are not deletes (edit/move, water, voice, combinations).
- `core/trash.js`: the `trash` store holds `{id, kind, ts, label, sub?, emoji?, rows:[{store,row}], extra?}`. `restore()` puts the rows back and runs the kind's `onRestore` hook (workouts recompute PRs/XP and restore the XP ledger; photos move to a free slot or a new session). Entries older than 7 days are purged at start-up (`features/trash › startTrash`). The bin is not exported in backups.
- Fiber/salt are optional food fields `fib` and `salt` (grams per 100 g on foods, per portion on diary rows); missing means unknown, so no migration rewrites old rows.

## Exercise technique (1.4.1)

- Generated data (by `tools/make-technique.mjs` from the verified source set): `data/technique.js` (`TECHNIQUE[id]` = `setup`, `steps`, `breathing`, `keyPoints`, `mistakes: [{mistake, fix}]`, `muscles: [{role, text}]`, `sources: [{text, url?}]`, `frames: [{label, legend}]`; Bulgarian, `**bold**`/`*italic*`, gendered `{f, m}` where needed), `data/figures/<id>.js` (two inline SVG frames) and `data/figure-thumbs.js`.
- `features/library/figure.js` renders the frames (`figureBlock`, filled by `hydrateFigure` after `loadFigure(id)` – a dynamic import, one lazy chunk per exercise, precached by the service worker like every file in `dist/js`) and the sections (`techniqueSections`). Used by the exercise page (`views/detail.js`) and the in-workout sheet (`technique.js`). Thumbnails (`thumb.js`) are only imported by the library list and the active workout, so neither the drawings nor the texts are in the initial bundle.
- SVGs are inline (not `<img>`) so they use the app font and the `.dark` theme (`figure.css`, scoped to `.vf`); captions and legends are HTML for readability on a phone.

## Day history, channels and screenshots (1.4.0)

- **One date-keyed day layer** – `src/features/day/`. `logic.js` is pure (`dayError`, `indexData`, `buildDay`, `foodTotals`, `hasData`, `shotRows`); `api.js` is the only place that writes a day's steps, water, sleep, mood and energy for _any_ date (`setDaySteps(date, n)`, `setDayWater`, `setDaySleep`, `clearDaySleep`, `rateDayField`). Every writer calls `assertEditable(date)` (no future days, nothing before `MIN_DAY`) and then emits `ui:refresh`, so streaks, Progress charts, insights and the monthly recap – all derived from the same stores – update after an edit. The Home cards and the Progress › calendar day view (`views/day.js`) render the same date-parameterized cards (`views/cards.js`); an empty day shows zeros.
- **Screenshot reading** (`views/shot.js`) posts the image to the voice Worker `POST /vision?kind=steps|sleep&today=YYYY-MM-DD` (Workers AI `@cf/meta/llama-4-scout-17b-16e-instruct` first, xAI as the fallback). The image is never stored – not in IndexedDB, not on the server, not in logs. The app shows every day the model read (multi-day views → one row per day, future days dropped) and saves only what the user confirms.
- **Release channels** – `src/core/channel.js`. `npm run build:beta` builds `dist-beta/` with its own IndexedDB name, localStorage/Cache Storage prefix (`vfb-`), service-worker caches, `-beta` server URLs and a БЕТА marker, so a beta can never touch live data. Live builds are unchanged.
- **What's new** – `src/features/whatsnew/notes.js`: `newSince(seen, flags, notes, current)` and `allNotes(flags, current)` never show a release newer than the running version. Profile › Какво ново lists every release and the build hash.
- **Feedback anti-abuse** – 10 messages a day per phone counted in the app (no sender id on the server), the server-wide 200/day cap, and optional Cloudflare Turnstile: OFF while `TURNSTILE_SITEKEY` in `channel.js` is `''` and the push Worker has no `TURNSTILE_SECRET`. Set both to switch it on.
- **Push server 1.2.0** – additive: `settings.loudOn` (default true; false skips the loud alarm in `schedule.js`) and `POST /test` (one test notification, 2 a minute per device; 404 unknown device, 410 gone subscription).
- **Data version 5** – the 4 → 5 migration back-fills fiber and salt on diary rows of built-in foods; nothing else is rewritten.
- **Anonymous-food notice** – `features/improve/notice.js › confirmDataNotice()` runs once, when the first food is entered by hand, before `shareFood` sends anything. It uses the Profile wording and can switch sharing off; nothing is shown at start-up.
- **Beta deploy** – the beta is the Cloudflare Pages project `vidrichka-beta` (https://vidrichka-beta.pages.dev, a separate origin, so its storage and service-worker scope never overlap the live GitHub Pages app). `npm run deploy:beta` builds and uploads `dist-beta/`; the live app on GitHub Pages is only deployed from `main`.

## Creatine, food labels and sleep times (1.4.2)

- **Creatine** – `src/data/creatine.js` maps 49 built-in meat and fish foods to a species reference (raw mg/100 g with its protein) and a state (raw / cooked 0.75 / canned 0.70); mg/100 g = ref × protein ratio × retention (sources and table: `docs/CREATINE.md`). Everything else counts as 0 (unknown). `features/food/creatine.js › dayCreatine()` sums diary rows by `foodId` × grams plus the supplement (`days.creatineG`, written only by `day/api.js › setDayCreatine`, 0–50 g); `buildDay()` exposes it as `creatine`, shown by `day/views/cards.js › creatineCard` in Food. No data migration: old diary rows count as soon as the app updates.
- **Label photo** – the new-food form (`food/views/manual.js`) posts the photo to the voice Worker `POST /vision?kind=label` (same pipeline as screenshots; `voice/src/label.js` re-checks the model's JSON, converts kJ → kcal, sodium → salt, per serving → per 100 g and drops out-of-range values). `food/label.js › labelToForm` pre-fills only plausible values (the app's `implausible()` check) and marks them; nothing is saved until „Запази“. The photo is never stored. `voice/limit.js` counts picture reads per phone: 20 a day (screenshots + labels), on top of the Worker's per-IP rate limit.
- **Sleep times** – `daily/sleeptimes.js` (pure): bedtime 12:00–23:59 belongs to the evening before the edited day, 00:00–11:59 to the day itself, ±1 day override; wake-up is the next occurrence after bedtime. `day/api.js › setDaySleepTimes` stores `sleepBed`/`sleepWake` (timestamps) and `sleepH` (to the minute), refuses > 16 h and wake-ups in the future. Hours-only entries are migrated lazily in the editor (`editorTimes`: wake = the recorded wake-up or 07:00, bed = wake − hours) and rewritten only when saved; `sleepH` stays the source for streaks and charts.
