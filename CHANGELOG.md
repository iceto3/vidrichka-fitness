# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.4.0] – unreleased (beta)

### Added

- **Day history:** dates in **Прогрес › Календар** open that day (steps, sleep, mood/energy, water, food and the workouts with exercises, sets and volume; zeros when empty). Past days are editable; future days are not. One date-keyed data layer (`src/features/day/`) serves Home and the day view, and streaks, charts, insights and the recap are derived from the stored rows.
- **Steps and sleep from a screenshot** (voice Worker `POST /vision`: Workers AI vision first, xAI as the fallback). Multi-day views give one row per day; nothing is saved before you confirm; the image is never stored.
- **Barcode scanning** straight from the phone with the Open Food Facts API (BarcodeDetector on Android, the bundled ZXing fallback on iPhone), manual barcode entry and manual food when nothing is found.
- **Weight trend chart**, a **monthly recap** reachable from the calendar (also for the month so far), and a **Какво ново** page in Profile with every release and the build hash.
- **Foods:** fiber and salt for every built-in food, 13 multi-source corrections, boiled/grilled, breaded and fried meat and fish, cottage cheese, mixed mince 50/50, 60/40 and 75/25, and a **Ястия и други** tile.
- **Water:** a **−** button on the left of the glasses (never below 0); the glass size is unchanged.
- **Feedback:** a thank-you screen, a „3/3 снимки“ counter, 10 messages a day per phone; optional invisible Turnstile (off until a widget exists).
- **Push:** a **Изпрати пробно известие** button (push server 1.2.0 `POST /test`) and a switch for the loud wake-up alarm (`loudOn`).
- **Beta channel:** `npm run build:beta` builds a separate app (own IndexedDB, storage keys, caches, `-beta` Workers and a БЕТА marker).

### Changed / fixed

- The anonymous-food notice appears once, on the first food entered by hand and before anything is sent, with the Profile wording and a **Не изпращай** button (no dialog at start-up).
- Sleep: night streak counts manual entries, 7,5 h default, labelled quality faces, delete an entry. Steps: **Задай общо** vs **Добави** explained.
- Charts: empty-state text, Bulgarian weekday labels, the workouts title shows the number, the correlations banner says what will appear; heatmap weekday labels and legend; locked badges say how to earn them.
- Home: tapping the otter answers, the streak card explains how weeks count, no backup card on day 1, no check-in right after onboarding, no wake-up prompt over a workout summary, „Готово за днес ✓“.
- Food: online search gives up after 6 s (both endpoints in parallel), a protein over-goal cue, concrete portions instead of „малко“, „паста с пиле“ split into parts, „Храна“ everywhere, „ккал“ in Bulgarian.
- Technique opens as a sheet inside the workout; the Profile footer clears the nav; accessible names on the nav and icon buttons; a longer post-voice tour.
- **Tester round (beta 3):**
  - Service worker – the real cause of `ERR_FAILED`: Cloudflare Pages answers `/index.html` with a 308 redirect to `/`, so the precached `index.html` was a _redirected_ response, which Chrome refuses for a page navigation (offline opens, cache fallbacks and every open under the older worker failed). The shell is now cached only as `./`, every cached/served response is a clean (non-redirected) copy, and an older cache's redirected entry is cleaned when read. A new worker takes over at once (`skipWaiting` + `clients.claim`), the open page shows the „Има нова версия · Обнови“ bar, and the previous version's files stay cached until the next update so an open old page keeps working. The repair script never runs offline.
  - **/repair** is a real static page (`repair.html`) that the worker never intercepts: it unregisters the worker, clears the app's file caches (data stays) and reopens the app. Profile › **Поправи приложението** links to it.
  - Offline: reload, new tabs and hash routes load the cached app; a slow network gets the cached app after 4 s.
  - Profile › Какво ново shows the full build id again (e.g. `Билд: 1.4.0-beta-<hash>`, written into `index.html` by the build).
  - Weight step „1 / 2,5 / 5“ in Bulgarian number format (also the template editor's weight).
  - Online food search goes through the beta voice Worker's new `GET /off-search` (Open Food Facts' search endpoints have no usable CORS from a browser): one request per (debounced) search, answers cached a day at the edge and in memory, 20 per minute per IP. No more console CORS errors.
  - Progress › Sleep › Нощи: no „– → –“ for nights without bed/wake times.
  - Nutella (3017620422003): Open Food Facts reports `fiber_100g: 0`, so „Фибри 0 г“ is the product data, not a missing value (missing values show „–“).
- **Tester round (beta 2):**
  - Service worker: navigations are network-first with the cached app as the offline fallback, every request falls back to the network, it never answers `ERR_FAILED`; a new worker takes over at once when no tab is open and removes only this app's old caches. A small inline script in `index.html` repairs a stuck install (unregister, clear the app caches, reload; at most every 5 minutes), also when a lazy chunk fails to load.
  - Sleep is stored to the minute (it was rounded to ½ h; the vision Worker asks for hours + minutes) and shown as „7 ч 20 мин“ everywhere; the screenshot sheet has hours/minutes fields, an optional 1–5 quality and a full-width date field.
  - Barcode/online foods: the brand is not repeated („Nutella“, not „Nutella · Nutella“); a nutrient the product does not list shows „–“ (and a day without any fibre/salt data shows „–“ instead of 0). Online search runs both endpoints and takes the first answer, local results show at once, and the online part always ends with results, „няма“ or „не е достъпно“ + **Опитай пак**.
  - Food added to a past day gets the meal's usual time (08:00 / 13:00 / 16:00 / 19:00). Manual food: a live hint when kcal differs from 4·П + 4·В + 9·М by more than 20 % and 30 kcal; saving is never blocked. Fibre and salt in the food list rows.
  - Foods: separate извара (Bulgarian whey curd) and котидж values; raw chicken/turkey/pork/lean beef, beef mince 80/20 and grilled salmon; the plain cooked rows are labelled „(на скара)“, raw ones „(сурово/сурова)“, mince as „Кайма смес 60/40 (свинско/телешко, сурова)“ with a note that fat varies. `node tools/export-foods.mjs --since main` writes `docs/foods.csv` and `docs/foods-changes.csv` for the shared sheet.
  - П/В/М and Bulgarian number formats („2 145“, „2,5“) everywhere; sleep chart dates; bigger fibre/salt charts; „Без тренировка този ден.“; the 1.3.3 note names the current „Кажи какво хапна“ screen.
- Data version 5: fiber and salt back-filled on diary rows of built-in foods (add-only, tested).

## [1.3.4] – 2026-10-27

### Added

- **Home meals:** a **Хранения днес** card on Home. A meal with food opens the same meal sheet as the Food tab (edit grams, move, delete, **+ Добави към …**, **Запази като комбинация**); an empty meal opens Add food. The breakfast quest opens the same sheet once breakfast is logged.
- **After „Кажи“ saves, the app shows where things landed.** One thing: it goes there and animates it (water glasses fill one by one, the meal row pops, the steps bar grows), then a small celebration. Two or three: a ~1 s stop at each, then one celebration. More: „Записах 5 неща“ and one celebration. Any tap skips; the toast and **Отмени** pill stay; reduced motion gets short static highlights.
- **Daily steps challenge:** a Home card with a progress bar, **+1000 / +2000** and **Въведи** (add or set the day's total); a goal in Profile (default 8000, 1000–30000 in 500s); a daily quest with XP and one celebration a day when the goal is met. By voice: „запиши 5000 крачки“ (adds) or „общо 9000 крачки“ (sets). Manual entry only – no step counter access.
- **Sleep card:** last night's hours (½ h steps) and quality 1–5 on Home; by voice „спах 7 часа“. Stored in the day record, so it is in the backup.
- **Progress › Графики** (week / month / 3 months, light SVG): steps with the goal line, goal days and best streak; mood and energy; sleep; water vs goal; kcal and protein vs goal plus fiber (25 g reference) and salt (≤5 g); workouts per week vs the weekly goal and volume. Weight, measurements and photos are unchanged.
- **Insight cards** once there are 14+ days of data, at least 5 days in each compared group and a meaningful difference: sleep ≥7 h vs energy, workout days vs mood, step-goal days vs water. Gender-aware Bulgarian.
- **Anonymous manual-food collection (on by default):** when you save a food you typed in by hand, only its name, per-100 g kcal, protein, carbs, fat, fiber, salt and the app language go to the push Worker's `POST /foods`. No IP, device id, grams, dates, photos or cookies. A one-time notice explains it; **Профил › Помогни да подобрим приложението** turns it off at once. Offline it fails silently.
- **Обратна връзка (Profile only):** dictate (the **Запиши** flow, text lands in the box for review) or type what to change or add, attach up to 3 screenshots (resized to 1080 px JPEG, ≤300 KB each) and send. Thank-you toast.
- Voice server 1.2.0: steps, sleep, weight, mood and energy entries („сода“ is still sparkling water, 0 kcal).
- Push server 1.1.0: `POST /foods` and `POST /feedback` (D1 tables `foods_shared`, `feedback`, `feedback_images`; migration `0002_collect.sql`, additive only), with the origin allowlist, size limits and per-minute/day rate limits. `server/tools/read-feedback.mjs` downloads feedback with its images.
- A **Какво ново в 1.3.4** note.

## [1.3.3] – 2026-10-27

### Added

- **Dictation right in the app.** Where the browser's own speech recognition does not work well (everywhere except Chrome on Android, so also Safari and the home-screen app on iPhone), **Кажи** has a **Запиши** button: tap to start, tap again to stop (automatic stop at 30 s), with a timer, a sound level meter and **Разпознаване…** while the text is recognised. The text lands in the box for review; **Разчети** then logs it as before.
- Recording uses MediaRecorder at 32 kbps mono (audio/mp4, else webm/opus) and releases the microphone as soon as it stops. Clear Bulgarian messages for a blocked microphone, no sound and no connection.
- Voice server 1.1.0: `POST /transcribe` (Workers AI `@cf/openai/whisper-large-v3-turbo`, Bulgarian or English, VAD on) returning `{text, duration}`. Same allowed origins, `audio/*` only, at most 1 MB and 35 s, 6 a minute per IP. Audio is never stored or logged.
- A **Какво ново в 1.3.3** note.

### Fixed

- The **Отмени** pill disappears when you switch tabs and does not come back when you return to Food (it only follows the one navigation made by the deleting tap itself, e.g. deleting a plan in its editor).
- The suggested combination name agrees with the meal: „Обичайната ти закуска“, „Обичайният ти обяд“, „Обичайната ти вечеря“, „Обичайното ти междинно хранене“.
- Shorter validation text: „Най-много 100 г на 100 г продукт.“

## [1.3.2] – 2026-10-25

### Changed

- **Undo is a small „Отмени“ pill**, only after a deletion. It sits bottom-right above the nav (or above an open sheet), moves up so it never covers a button, shows a 4-second countdown ring and can be swiped away. Adds and edits (food, moves, combinations, voice logging) now show only a short toast with no button.
- Toasts and the pill are cleared when you go to another page.
- **Combinations need a name** (an empty name is no longer silently replaced) and names must be unique (case and spaces ignored). Combinations can be **renamed** in **Редовни хранения**.
- **Units are consistent** in the Bulgarian UI: г, кг, см, т everywhere (food lists, steppers, workouts, progress, charts), with Bulgarian number formatting.
- Wording: „Докосни пак, за да добавиш към междинното хранене“ (and закуската / обяда / вечерята), „Стойността не може да е над 100 г в 100 г продукт.“
- The voice server tells the AI to use correct standard Bulgarian food names (e.g. „сьомга“, never „салмона“).
- A **Какво ново в 1.3.2** note (in the app language).

### Fixed

- After an edit, a deletion, Undo or a restore, every view (the page behind an open sheet included) re-renders at once; no reload needed.
- **Наскоро изтрити** opened from the Food diary keeps the Food tab highlighted.
- Set weight is limited to 0–500 kg, for typed values and the **+** button.
- „спрямо преди 4 седмици“ compares with the newest entry that is at least 28 days older, not with an earlier entry from the same day.
- Progress › Body lists every photo session (newest first) with the session count, not only the latest one.

## [1.3.1] – 2026-10-25

### Added

- **Fiber and salt.**
  - The manual food sheet has **Фибри / 100 г** and **Сол / 100 г** below Мазнини. Both are optional; empty means unknown.
  - Open Food Facts fills them from `fiber_100g` and `salt_100g` (or `sodium_100g` × 2.5).
  - Voice logging fills them too.
  - They are shown per item (grams sheet, meal sheet) and as daily totals under the macros (— while nothing logged that day has them).
- **Edit a meal item.** Tapping an item in the meal sheet opens an editor: change the grams (kcal and macros follow) and/or move it to another meal, or delete it. **+ Add to _meal_** stays.
- **Undo everywhere.** Every delete and edit shows an **Отмени** snackbar for 8 seconds:
  - food (add, delete, edit, move), water decreases, voice logging, combinations (save, add, delete);
  - workouts, measurements, photos and plans (after their existing confirm).
- **Наскоро изтрити** (Recently deleted), reachable from Profile and the Food diary.
  - Deleted foods, photos, workouts, measurements, combinations and plans are kept for 7 days and can be restored (or deleted forever); after that they are purged at startup.
  - A restored workout recomputes PRs and XP. A restored photo whose slot was filled moves to a free slot or a new session.
  - The bin is not part of backups.
- **Saved combinations as quick chips** in Add food: the first tap selects (and shows what is in it), the second tap adds it to the meal, with Undo.
- **Запази като комбинация** in the meal sheet. The combination name dialog opens with its default name selected, so typing replaces it.
- A **What's new in 1.3.1** note.

### Changed

- **Voice logging saves at once.** There is no separate confirm/**Запази** step any more: the entries are saved, the sheet closes, and an Undo snackbar lists what was added (e.g. _"Добавено в Закуска: кебапчета 120 г, лютеница 130 г, +1 чаша вода"_).
- **The meal named in the sentence wins.** _"запиши в закуска две кебапчета, половин буркан лютеница и една сода"_ goes to Breakfast from any screen and at any time. With no meal named, a said time or a past day keeps the meal inferred from it; otherwise the screen's meal (Food › Add _meal_) or the current meal by time of day is used.
- **Voice server** (redeployed):
  - The schema adds `meal_named`, `fiber` and `salt` per entry.
  - The prompt asks for names in the app language (Bulgarian for bg, English names translated), always an estimate in grams, typical portions for vague amounts (e.g. half a jar of лютеница ≈ 130 g), splitting clearly separate parts of mixed dishes, and no invented time. In Bulgarian "сода" is sparkling water, so it counts as water.
  - The reply cap is 1,200 tokens (was 700) because each entry now has more fields. A call costs about $0.0025.

### Data

- IndexedDB schema 3 adds the `trash` store; data version 4 adds an empty bin. Existing rows are not rewritten: old foods simply have no fiber/salt (unknown).

## [1.3.0] – 2026-10-25

### Added

- **"Say it" voice logging** for food and water (**Кажи** in Bulgarian).
  - A **Say it** button on Home and a mic button in Food › Add open a sheet with a text box. You dictate with the phone keyboard's mic (iOS and Android) or type, for example _"изядох купа овесени ядки с банан и изпих две чаши вода"_. On Android Chrome a **Dictate** button (the browser's speech recognition) is offered too; on iPhone the keyboard mic is used.
  - The text, plus the phone's local date, time, time zone and app language, goes to a small Cloudflare Worker (`voice/`). The Worker asks xAI (`grok-4.20-0309-non-reasoning`, strict JSON schema, temperature 0) to turn it into food entries (name, meal, amount, grams, kcal, protein, carbs, fat, optional time and date) and water entries (ml). It understands Bulgarian and English, vague amounts ("a bowl", "две чаши") and relative times ("yesterday evening", "сутринта").
  - A **confirm sheet** lists everything. You can change the grams (nutrition scales) or glasses, change the meal, or remove an item. **Nothing is saved until Save.** Saved foods go through the normal food API (quests, XP, the micro animation), and water is added to that day's glasses.
  - Opened from Food › Add _meal_, today's foods go to that meal.
  - The buttons stay hidden while the voice server isn't configured or reachable (like the push switch).
- **Voice server** (`voice/`, the stateless Cloudflare Worker `vidrichka-voice`, free tier, no D1 or KV):
  - It only accepts `POST /parse` from `https://iceto3.github.io` (and localhost for dev), with CORS for that origin only.
  - It caps the text at 500 characters, the body at 4 KB and the reply at 700 tokens.
  - It rate-limits each IP to 8 requests a minute with the free Workers Rate Limiting binding, plus a per-isolate fallback.
  - It never logs the text or the key. The xAI key is a Worker secret (`wrangler secret put`) and is never in the app or the repo.
  - A call costs about $0.0018 (around 1,050 input and 200 output tokens).
- A **What's new in 1.3.0** note. Its voice items appear once the voice server is configured.

### Deployed

- **Push server live:** `https://vidrichka-push.vidrichka.workers.dev`. Its D1 database `vidrichka-push-db` has migration 0001 applied, and the VAPID private key is a Worker secret. **Profile › Reminders › Reminders on this phone** is now shown, and the push items of the 1.2 "What's new" appear for people coming from 1.1.
- **Voice server live:** `https://vidrichka-voice.vidrichka.workers.dev`. The xAI key is a Worker secret, set with `wrangler secret put` from the environment.
- The account's workers.dev subdomain is `vidrichka`.

## [1.2.1] – 2026-10-25

### Added

- **Progress photo sessions** (Progress › Body).
  - Every upload is a dated session with four pose slots: **Front**, **Back**, **Left** and **Right**. A session can have 1–4 photos, and all four slots are always offered.
  - Each slot has **Camera** and **Gallery**. **Add several** fills the empty slots in order, and a photo can be moved to another slot (it swaps) or deleted (asks first).
  - The Body tab shows the latest session's four slots with the date the photos were taken and when they were added.
  - A **Timeline** lists all sessions in chronological order, and each one opens for editing.
- **Photo dates.** The default is the EXIF capture date (`DateTimeOriginal`, read on the phone by a tiny built-in JPEG reader, which reads nothing else). Without EXIF, the file date is used when it is from an earlier day, and otherwise the upload time. A session takes the earliest date of its photos. The date can always be changed, for example for photos taken yesterday and uploaded today. An edited date re-sorts the timeline and the before/after, and counts for the monthly set and streak.
- **Pose-to-pose Before/After.** For each pose, the oldest photo is shown as **Before** and the newest as **Now**, and either side can be picked again. It never shows the same photo on both sides. With only one photo of a pose, that photo is **Now** and **Before** stays empty.
- **Monthly 4-pose set**, from the 1st of each month:
  - a "Monthly progress photos" quest (n/4) until all four poses are done that month (across sessions)
  - 100 bonus XP for each complete month and a monthly streak
  - a reminder at 10:00 on the 1st (Profile › Reminders), which always comes from the phone itself
- **Photo celebrations:**
  - Each session ends with a small celebration: the otter's bounce, wave, wink and sparkles with the Warm hello sound, plus new hop, spin and flash variants and random titles, never the same twice in a row.
  - Completing the monthly set brings the big celebration.
  - The **First photo** badge and any level-up from a session now come after the small celebration as tap-away toasts and no longer block the screen.
- A **What's new in 1.2.1** note. People coming straight from 1.1 also get the 1.2 items and the gender choice.

### Changed

- **Ate it** / **Да, ядох!** (on #morning, the Home protein bar, the in-app prompt and the Android notification button) now only opens the Breakfast logger. The protein quest, its XP and the protein record are counted only once a breakfast entry is actually saved, with the existing 30-minute rules. The reminders keep coming until breakfast is logged or **Skipped**. This changes item 12 of 1.2.0.
- Data version 3: the 2 → 3 migration turns every existing photo into its own session, with the photo in the **Front** slot and its original date and image kept. Nothing else changes and no data is removed. Backups from older versions still restore.
- "What's new" now uses the full version, so a patch release can have its own note.
- Tests: new unit tests (EXIF parsing with JPEG fixtures, date fallbacks, edited dates, before/after, monthly set and streak, migration) and e2e photo flows on Android (Chromium) and iPhone (WebKit). The iPhone e2e now uses a persistent WebKit profile, because private (ephemeral) WebKit contexts cannot store photo Blobs in IndexedDB. The Profile page also no longer fails if the install date is missing from the data.

### Fixed

1. Two weigh-ins on the same day: the weight card showed the older one until a reload. The Body tab now updates as soon as a measurement is saved.
2. A partial workout said "<Workout> complete" on the summary and share card and counted as a workout in the Calendar. Partial workouts are now labelled **Partial**, the share card shows done/planned sets, and the Calendar counts only complete workouts. Partial ones show as "+N partial" and partial-only days get an outlined mark.
3. Workout volume was formatted differently in different places ("3960 kg" next to "5,8 t"). One shared formatter is now used everywhere (summary, share card, history, calendar, recap, partner card). It shows kg with a thousands separator below 10 t ("3 960 kg") and tonnes with one decimal from 10 t ("12,4 t"). The partner share text keeps its own "kg" word, so it uses the separator only.
4. The weight card with no data opened an empty chart. It now shows an empty state with **Add weight**.
5. **Reset all data** showed the welcome only after a reload. It now shows right away.

## [1.2.0] – 2026-10-25

### Added

- **Reminders that arrive when the app is closed (Web Push).** A small push server (`server/`, a Cloudflare Worker with D1 and a once-a-minute cron) sends each daily-rhythm reminder at the right local minute. This is the only way the 7:30 nudge can reach an iPhone. Turn it on once in **Profile › Reminders › Reminders on this phone**; **Turn off** unsubscribes. The server tracks each device's day: the 8:15 alarm is skipped once she is up, protein reminders stop after **Yes, I ate** or **Skipped**, and check-ins and the goodnight nudge stop once done. Daylight-saving changes are handled. Each reminder goes out once per day per device.
- Notification taps and buttons (**+1 glass**, **Yes, I ate**) and in-app answers report to the server, so the follow-ups stop. Offline, they are queued and sent on the next open.
- **Protein breakfast bar on Home:** a live `mm:ss` countdown ("Eat 30 g of protein · 23:41 left") with **Ate it** and **Skipped** buttons. Only the timer text updates each second, so there is no re-render and no flicker. After 30 minutes without an answer, the bar turns dark red and the `00:00` blinks (shown boxed, without blinking, with reduced motion). It stays red, also after a reload, until she answers. **Skipped** stops the reminders with no celebration or quest credit.
- **Log the protein breakfast:** **Ate it** or **Yes, I ate** (on the bar, the morning page or the Android notification button) marks protein done, then opens the Food logger on today's **Breakfast** with the hint "What did you have for your 30 g protein breakfast?". Logging there completes the **Log breakfast** quest. Closing it without adding anything still counts protein as done.
- **Micro animations** on every log: each water **+** drops into a glass with a ripple while mini Vidrichka takes a sip, and each food item pops with a bounce and sparkles by its meal. Each one is shorter than a second, with the soft "Warm hello" sound. It plays in its own click-through layer (no overlay, no re-render, so the + flicker fix stays). Rapid taps restart it instead of queueing. It follows reduced motion and the **Celebration sounds** switch.
- **Grammatical gender for Bulgarian texts.** Onboarding asks "You are: Female / Male", and it can be changed any time in **Profile › Address me as**. People updating from 1.1 get the same choice once in the What's new note, with Female preselected. The setting is stored as `gender` in the settings (missing means female, so no migration is needed). Gendered strings are `{ f, m }` variants that `t()` and `L()` resolve, so the code has no gender checks. An audit of every Bulgarian string found the forms that address the user: the water celebration ("Хидратирана/Хидратиран и щастлива/щастлив"), the level-up line ("Вие двете/двамата"), the 8:15 alarm hint ("докоснала/докоснал") and two exercise steps ("Изправена/Изправен"). Everything else is already neutral, or refers to Vidrichka, who stays feminine. Push notification texts are rendered on the phone and re-sent to the server when the gender changes, so server-sent reminders match too. English is unchanged.
- A one-time **What's new in 1.2** note. The push items only appear once the push server is configured.

### Changed

- While push is on, the phone no longer plans the daily reminders itself (no doubles). With push off, or before the server is set up, the 1.1 local scheduling still works as before.
- iPhone hints: push needs the Home Screen app on iOS 16.4 or newer, and iOS always plays the notification sound.
- The small water toast now only appears when the daily goal is reached. Every other glass gets the micro animation.
- No data or schema changes. The push state is a small `kv` entry, and the new `proteinSkip` day field is optional. The service worker cache is bumped to the 1.2.0 build.
- Privacy: only a random device id, the push subscription, the time zone, the reminder times or switches and the notification texts are sent to the server. No health data is sent.

### Fixed (tester findings on 1.1.0)

1. The workout celebration showed `[object Object]` instead of the plan name. It now shows the plan name in the current language.
2. The celebration, summary, calendar, plans and recap rounded the workout time differently. All of them now use one shared calculation (`durationMin`), and totals add up the per-workout minutes.
3. Opening a past workout from the calendar replayed the summary and celebration. It now opens a read-only detail in **Progress** with the sets of every exercise and a **Delete workout** button (asks first). Deleting recalculates XP, the streak and PRs. Badges stay earned.
4. Daily prompts could pop up during a workout, on the summary or over a celebration. They now wait until she is done. The morning check-in is only offered in the morning (4:00–12:00) and not after a workout today.
5. The reminder time fields were clipped and mixed 12 h and 24 h. They now show one style per language: 24 h in Bulgarian, and the phone's style in English (24 h for en-GB). The Profile row no longer says "Off" while daily reminders are on.
6. Manual food entry silently accepted impossible values. It now shows inline errors for negative numbers and non-numbers, for more than 100 g of a macro or of P + C + F per 100 g, and for kcal above 900. If the kcal don't match the macros, it warns once and offers **Save anyway**. Body measurements outside a sane range (weight 20–300 kg, sizes 10–250 cm, body fat 1–75 %) show an error instead of saving.
7. The "Set done" toast lagged a set behind on fast taps. Its count is now read when it is shown, and repeated toasts update in place.
8. A workout could be finished after a single set for the full XP. A workout now needs at least half of its planned sets (at least 3, or all of them for plans with fewer than 3 sets). Otherwise it is saved as **Partial** and earns only the per-set XP. A partial workout does not count for the weekly streak or goal. Its sets, volume and PRs still count.
9. Charts showed the same date more than once when there were several entries on one day. Entries are now grouped per day: the best lift, or the last body measurement.
10. The outfit picker listed a non-existent "Dumbbell 3" unlock. The unlock list now only names real outfits.
11. Sheets could not be closed with Esc, and the outfit sheet stayed open after a pick. Esc, a tap on the backdrop and the Android back gesture now close every sheet, and picking an outfit closes it.
12. **Ate it** in the morning prompt now ticks the **Protein within 30 min** quest and opens the breakfast logger, like the Home bar does.

## [1.1.0] – 2026-10-24

### Added

- **Morning flow:** a silent 7:30 nudge and a loud 8:15 alarm, which is skipped once the first one was tapped or the morning page opened. The full-screen **Good morning** page records the wake-up time and starts a 30-minute protein countdown that survives reloads.
- **Protein reminders** at +10, +20 and +30 minutes. **Yes, I ate** works from the notification on Android and from a big button on the morning page. It stops the reminders and completes the new daily quest **Protein within 30 min** (+15 XP).
- **Water reminders** at 11:00, 14:00, 17:00 and 20:00, each one editable and switchable, with **+1 glass** right in the notification on Android. Tapping one opens the water log.
- **Check-ins:** 11:00 for how you feel and how you slept (two taps, plus a one-tap fix for last night's bedtime), and 19:30 for energy (one tap).
- **Goodnight ritual:** a moon button on Home in the evening and a silent 22:30 nudge. Vidrichka yawns and curls up under a blanket, bedtime is recorded, and you get a sleep streak and +10 XP. A forgotten bedtime is estimated from your last evening app use and marked "estimated".
- **Progress › Sleep:** hours slept, average sleep, mood and energy, and a list of nights.
- **Celebrations:** small, medium and big animations with sounds, ported from the approved mockup. They are queued so they never stack, follow reduced motion, and have a **Celebration sounds** switch in Profile.
- All daily times are in **Profile › Reminders › Daily rhythm**.
- A one-time **What's new in 1.1** note.

### Fixed

- **Screen flicker when tapping + buttons:** every tap re-created the whole page or sheet, which restarted the sheet's open animation and rebuilt every node. Re-renders now update the existing DOM in place. Nodes, scroll position and focus are kept, and generated SVG ids are deterministic.

### Changed

- Data version 2 adds the `days` store. The migration only adds the store; all existing data is kept.
- The service worker cache is bumped to the 1.1.0 build, and the sounds are precached for offline use.

## [1.0.0] – 2026-10-24

First release.

### Added

- **Home:** greeting, Vidrichka the otter with context-aware messages, weekly streak with freezes, weekly goal ring, today's workout card, daily quests, XP level bar, monthly challenge and a Wrapped prompt.
- **Workouts:** three example plans (Leg Day, Upper Body, Home Full Body) and a plan editor. Active workout with steppers, Done locks a set and starts the rest timer (+15 s, Skip, sound and vibration where supported), skipped sets stay unfinished, an elapsed timer, "last time" hints and progression nudges.
- **Summary:** time, sets, reps, volume, MET calorie estimate, PRs, XP, confetti and a share-card PNG (Web Share with files, or a download).
- **Library:** 20 exercises with three step illustrations, a muscle map, tips, rest time, a YouTube technique search link, and gym/home and muscle filters.
- **Food:** a date picker, calorie ring, macros, water, meals with timestamps, 8 category tiles, quick picks, a BG/EN food database, Open Food Facts search, barcode scanning (BarcodeDetector, a lazy zxing fallback, and manual entry), a grams sheet in 10 g steps, a "Save this as a regular meal?" prompt, saved meals and recents.
- **Progress:** lifts (chart, PRs, badges), body (weight, measurements, progress photos with compare) and a calendar.
- **Motivation:** XP and levels, badges, a monthly challenge, quests, nudges, a monthly Wrapped recap and mascot gear by level.
- **Partner mode:** share a stats card; `?cheer=Name` links show a cheer pop-up.
- **Profile:** language (English/Bulgarian), theme (light/dark/auto), reminders, weekly goal, nutrition goals, rest-timer alerts, weight step, outfit, backup export/import (photos included) and reset.
- **PWA:** manifest with regular and maskable icons, iOS apple-touch icon and splash screens, an offline service worker (cache-versioned, with an update prompt), install help (Android prompt; iPhone Share → Add to Home Screen) and `navigator.storage.persist()` with backup reminders.
- **Tooling:** esbuild code-split build, ESLint, Prettier, tsc JSDoc type checking, node:test unit tests, Playwright smoke tests (Chromium Android and WebKit iPhone), a Lighthouse script and a GitHub Actions workflow.
