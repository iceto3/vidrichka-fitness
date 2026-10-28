# Extending Vidrichka Fitness

Every addition is a small, local change. After editing, run `npm run check`.

## Add an exercise

1. Add an entry to `src/data/exercises.js`. It needs `id`, `name: {en, bg}`, `equipment`, `place: ['gym'|'home']`, `weighted`, `primary`/`secondary` muscles, `rest` (seconds), `met`, `fig`, `steps: [{en,bg}×3]` and `tips: [{en,bg}]`. Optionally add `unit: 'perLeg'|'sec'`.
2. Pick an existing `fig` from `src/features/library/figures.js`, or add a new 3-frame figure there.
3. Unit tests check that names are bilingual and that plans only use known exercises.

## Add a food or food category

Add rows to `ROWS` in `src/data/foods.js` (per 100 g: `kcal, p, c, f`, plus `name: {en,bg}`). Categories live in `FOOD_CATEGORIES`.

## Add a translation key or language

- **Key:** add it to `src/data/i18n/en.js` **and** `bg.js`. The tests fail if a key or a `{placeholder}` is missing, or if code uses a literal `t('key')` that doesn't exist.
- **Language:** create `src/data/i18n/<code>.js` with all English keys, then add it to `LANGUAGES` in `src/data/i18n/index.js`. It is loaded lazily.

## Add a badge or quest

Badges and quests are registered entries. See `src/features/motivation/badges.js` and `quests.js`:

```js
register('badges', { id: 'kg_50000', label: 'badge.kg_50000', icon: '50K', color: '#F59E0B', earned: (s) => s.totalKg >= 50000 });
```

Then add a `badge.kg_50000` translation in both languages. The rewards engine awards the badge and its XP automatically.

## Add a screen or feature

1. Create `src/features/<name>/` containing `index.js`, `views/<screen>.js` and `<name>.css`.
2. In `index.js`, register a route (and optionally a tab):
   ```js
   register('routes', { pattern: 'stretch', load: async () => (await import('./views/stretch.js')).default() });
   register('tabs', { id: 'stretch', icon: 'star', label: 'nav.stretch', path: 'stretch', order: 35 });
   ```
3. A view returns `{ render(), actions: { name: (el, ev) => … } }`. Use `data-act="name"` in the markup.
4. Import the feature's `index.js` in `src/features/index.js`, and its CSS in `src/app.css`.
5. Other features talk to it only through its `api.js` and bus events.

## Add a day field (1.4.0)

1. Store it in the day record and add it to `dayFromIndex` in `src/features/day/logic.js` (with a zero/empty default).
2. Add a date-taking writer in `src/features/day/api.js` that starts with `assertEditable(date)` and validates the value.
3. Render it in `src/features/day/views/cards.js` – the same card is used on Home (today) and in the calendar day view (any past day).
4. If it is charted, add it to `dailyRows` in `src/features/progress/trends.js`. Unit-test the logic in `tests/unit/v140-day.test.js`.

## Add a per-channel value (live / beta)

Add it to **both** entries of `CHANNELS` in `src/core/channel.js` and read it from there. Never hard-code a server URL, storage name or cache name elsewhere.

## Add a "What's new" note

Add an entry at the top of `NOTES` in `src/features/whatsnew/notes.js` and its keys in `bg.js` and `en.js`. Use the `needs` flag (`'voice'`, `'push'`) for items that only work with a server.

## Change the data model

- **New store:** append an upgrade step to `SCHEMA` in `src/core/db.js` and add the store name to `STORES`.
- **New field or shape change:** append a pure migration to `MIGRATIONS` in `src/core/migrations.js`. `DATA_VERSION` bumps itself. Add a unit test with an old snapshot.

## Release

1. Bump `version` in `package.json` and add a CHANGELOG entry.
2. Run `npm run check` and `npm run test:e2e:dist`.
3. Big versions: build on a branch, `npm run build:beta` and deploy `dist-beta/` to the Cloudflare Pages project `vidrichka-beta` (`npx wrangler pages deploy dist-beta --project-name vidrichka-beta --branch main`), with the `-beta` Workers (`wrangler.beta.toml` in `server/` and `voice/`). Test the beta first.
4. Merge to `main`; the workflow deploys to GitHub Pages. The service worker version changes automatically, and users see "Update ready".
