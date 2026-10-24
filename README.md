# Vidrichka Fitness 🦦

A personal, offline-first fitness app (PWA). It covers workouts with a rest timer, food logging, progress tracking and motivation from Vidrichka the otter. Everything is stored on your device, with no account and no server. The app speaks English and Bulgarian and has light, dark and auto themes. It is phone-first and installable on iPhone and Android.

![Home](screenshots/home.png)

## Quick start

```bash
npm ci            # dev tools only — the app itself has zero runtime dependencies
npm start         # http://localhost:8080 (unbundled ES modules, network-first SW)
npm run build     # production build → dist/
npm run preview   # serve dist/ at http://localhost:8080
```

Node ≥ 20 is required.

## Scripts

| script | what it does |
|---|---|
| `npm run lint` | ESLint (flat config) |
| `npm run format` / `format:check` | Prettier |
| `npm run typecheck` | `tsc` checks the JSDoc types in `src/` (checkJs) |
| `npm test` | unit tests (node:test): calories, streaks/freezes, XP/levels, PRs, migrations/backup validation, EN/BG key completeness, recap, data |
| `npm run test:e2e` | Playwright smoke at 412×915 on Chromium (Android, Pixel 7 UA) and WebKit (iPhone 14); add `-- --shots` to refresh `screenshots/` |
| `npm run test:e2e:dist` | build, then run the smoke tests against `dist/` (including the cache-first offline check) |
| `npm run lighthouse` | Lighthouse (mobile) against `dist/`; reports go to `.lighthouse/` |
| `npm run check` | lint + format check + typecheck + unit tests + build |

The e2e script uses `/usr/bin/google-chrome` (or `CHROME_PATH`) for Chromium. For WebKit it needs Playwright's build: run `npx playwright-core install --with-deps webkit` once.

## Tech

- Vanilla JavaScript ES modules, HTML and CSS. JSDoc types are checked by TypeScript, and there is no framework.
- IndexedDB, behind an in-memory store with schema versioning and data migrations.
- Hash router with lazily loaded views. esbuild produces code-split, content-hashed bundles.
- Service worker: precaches the built app (cache-first) and shows an update prompt for new versions.
- Plus Jakarta Sans is self-hosted, with a Cyrillic fallback (Manrope) for Bulgarian.
- Open Food Facts handles online food search and barcode lookup. Scanning uses `BarcodeDetector`, a lazily loaded zxing fallback, or a manually typed barcode.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/EXTENDING.md](docs/EXTENDING.md).

## Install on your phone

- **iPhone (Safari):** open the site, tap **Share**, then **Add to Home Screen**. The Profile screen shows these steps too.
- **Android (Chrome):** tap **Install** in Profile, or open the browser menu and choose **Install app**.

## Limitations (honest)

- **Reminders:** a web app can't schedule exact alarms.
  - While the app is open, reminders show as in-app notifications or nudges.
  - On installed Android Chrome, Periodic Background Sync may deliver them roughly on time, but the browser decides when it runs.
  - On iPhone, notifications only work in the Home Screen app on iOS 16.4+, after you allow them, and they still need the app to run. Treat reminders as best-effort.
- **Barcode scanning:** needs camera permission and HTTPS.
  - Android Chrome uses the fast native `BarcodeDetector`.
  - iOS Safari has no `BarcodeDetector`, so it uses the zxing fallback. That is slower and needs good light; manual entry always works.
  - Looking a product up needs the internet, and Open Food Facts data quality varies.
- **iOS vibration:** iOS has no vibration API, so the rest timer uses sound. Sound needs the ringer on and is unlocked by your first tap.
- **Storage:** data lives in this browser only. Export a backup now and then; the app reminds you, and photos are included. Persistent storage is requested, but iOS can still clear the data of sites you haven't used for weeks, unless the app is installed to the Home Screen.
- **Calories:** burn is estimated with MET × body weight × time, so treat it as a rough guide.

## Publishing on GitHub Pages

The workflow is in `.github/workflows/deploy.yml`. All URLs are relative, so the app works from `https://<user>.github.io/<repo>/`.

1. Create an empty repository on GitHub (for example `vidrichka-fitness`).
2. `git remote add origin git@github.com:<user>/vidrichka-fitness.git`
3. `git branch -M main && git push -u origin main`
4. In the repository, go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
5. The **CI and deploy** workflow runs lint, typecheck, unit tests, build and the e2e smoke tests, then deploys `dist/`. Your URL appears in the run summary and under Settings → Pages.
6. Open the URL on your phone and install it (see above). Later pushes to `main` redeploy automatically, and the installed app shows "Update ready".
