# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
