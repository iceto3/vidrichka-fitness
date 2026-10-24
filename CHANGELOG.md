# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the project uses
[Semantic Versioning](https://semver.org/).

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
