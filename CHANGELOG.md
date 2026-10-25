# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
