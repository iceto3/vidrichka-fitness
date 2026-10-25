# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

## [1.2.0] – 2026-10-25

### Added

- **Reminders that arrive when the app is closed (Web Push).** A small push server (`server/`, a Cloudflare Worker with D1 and a once-a-minute cron) sends each daily-rhythm reminder at the right local minute. This is the only way the 7:30 nudge can reach an iPhone. Turn it on once in **Profile › Reminders › Reminders on this phone**; **Turn off** unsubscribes. The server tracks each device's day: the 8:15 alarm is skipped once she is up, protein reminders stop after **Yes, I ate** or **Skipped**, and check-ins and the goodnight nudge stop once done. Daylight-saving changes are handled. Each reminder goes out once per day per device.
- Notification taps and buttons (**+1 glass**, **Yes, I ate**) and in-app answers report to the server, so the follow-ups stop. Offline, they are queued and sent on the next open.
- **Protein breakfast bar on Home:** a live `mm:ss` countdown ("Eat 30 g of protein · 23:41 left") with **Ate it** and **Skipped** buttons. Only the timer text updates each second, so there is no re-render and no flicker. After 30 minutes without an answer, the bar turns dark red and the `00:00` blinks (shown boxed, without blinking, with reduced motion). It stays red, also after a reload, until she answers. **Skipped** stops the reminders with no celebration or quest credit.
- **Log the protein breakfast:** **Ate it** or **Yes, I ate** (on the bar, the morning page or the Android notification button) marks protein done, then opens the Food logger on today's **Breakfast** with the hint "What did you have for your 30 g protein breakfast?". Logging there completes the **Log breakfast** quest. Closing it without adding anything still counts protein as done.
- **Micro animations** on every log: each water **+** drops into a glass with a ripple while mini Vidrichka takes a sip, and each food item pops with a bounce and sparkles by its meal. Each one is shorter than a second, with the soft "Warm hello" sound. It plays in its own click-through layer (no overlay, no re-render, so the + flicker fix stays). Rapid taps restart it instead of queueing. It follows reduced motion and the **Celebration sounds** switch.
- A one-time **What's new in 1.2** note. The push items only appear once the push server is configured.

### Changed

- While push is on, the phone no longer plans the daily reminders itself (no doubles). With push off, or before the server is set up, the 1.1 local scheduling still works as before.
- iPhone hints: push needs the Home Screen app on iOS 16.4 or newer, and iOS always plays the notification sound.
- The small water toast now only appears when the daily goal is reached. Every other glass gets the micro animation.
- No data or schema changes. The push state is a small `kv` entry, and the new `proteinSkip` day field is optional. The service worker cache is bumped to the 1.2.0 build.
- Privacy: only a random device id, the push subscription, the time zone, the reminder times or switches and the notification texts are sent to the server. No health data is sent.

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
