# vidrichka-push

This is the Web Push reminder server for Vidrichka Fitness. It is a Cloudflare Worker with a D1 database. A cron runs every minute and sends each device its daily-rhythm reminders at the right local time, even when the app is closed. It is the only way reminders reach an iPhone.

There are no dependencies. Encryption follows RFC 8291 (`aes128gcm`) and VAPID follows RFC 8292 (ES256 JWT), both done with WebCrypto.

## What it stores (no health data)

| table     | contents                                                                                                                  |
| --------- | ------------------------------------------------------------------------------------------------------------------------- |
| `devices` | random device id, push endpoint and keys, IANA time zone, reminder times and switches, notification texts                 |
| `daily`   | per device and local day: when she was up, protein done or skipped, check-ins done, goodnight done (flags and times only) |
| `sent`    | which reminder kinds were already sent that day (dedupe)                                                                  |

The notification texts are rendered on the phone in the user's language and grammatical gender (Bulgarian `{ f, m }` strings). The app sends them again on `POST /settings` whenever the language, gender, names or times change, so the server needs no translations or gender logic.

Rows older than 3 days are cleaned up every hour. A device is deleted on `/unsubscribe` or when the push service answers 404 or 410.

## API

All `POST` bodies are JSON. They can be sent as `text/plain` so that no CORS preflight is needed, and they are limited to 8 KB. The `Origin` must be `https://iceto3.github.io` or `localhost`. Device ids are 22–64 base64url characters.

| method & path       | body                                                                                                                                            | result                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| `POST /subscribe`   | `{id, subscription, tz, settings, texts}`                                                                                                       | 204                        |
| `POST /settings`    | `{id, tz?, settings?, texts?}`                                                                                                                  | 204, or 404 if unknown     |
| `POST /event`       | `{id, type, at?, which?}`: `awake`, `protein-done`, `protein-skipped`, `water-logged`, `checkin-done` (`which`: `am` or `pm`), `goodnight-done` | 204                        |
| `POST /unsubscribe` | `{id}`                                                                                                                                          | 204                        |
| `GET /health`       | none                                                                                                                                            | `{ok, db, vapid, time, …}` |

The push payload is `{v, title, body, tag, route, silent, loud, actions, day, kind, group, at}`.

## Collected data (1.3.4)

`POST /foods` `{name, lang, kcal, protein, carbs, fat, fiber, salt}` (per 100 g, ≤1 KB) → 204. Identical foods are counted (`n`) instead of duplicated; at most 20 000 rows.
`POST /feedback` `{text, version, lang, images: [{mime, data (base64)}]}` (≤3 JPEG/PNG/WebP images of ≤300 KB, ≤1.4 MB in total) → 201 `{ok, id}`.
Both: the same origin allowlist, no IP, device id or cookies stored, and per-isolate rate limits (30 foods and 5 feedbacks a minute, 200 feedbacks a day).

| table             | contents                                                         |
| ----------------- | ---------------------------------------------------------------- |
| `foods_shared`    | name, language, per-100 g kcal/protein/carbs/fat/fiber/salt, `n` |
| `feedback`        | text, app version, language, created time                        |
| `feedback_images` | feedback id, index, mime, image bytes (BLOB)                     |

Read them (from `server/`, with `CLOUDFLARE_API_TOKEN` set):

```sh
# shared foods, most common first
npx wrangler d1 execute vidrichka-push-db --remote --command "SELECT name, lang, kcal, protein, carbs, fat, fiber, salt, n FROM foods_shared ORDER BY n DESC"
# feedback with its screenshots → /workspace/feedback/NNNN/message.txt + shot-N.jpg
node tools/read-feedback.mjs --out /workspace/feedback          # all
node tools/read-feedback.mjs --out /workspace/feedback --after 12  # only newer than id 12
```

## Schedule logic (`src/schedule.js`)

All times are local to the device's time zone and are DST-safe. A time that falls in a spring-forward gap moves forward. An ambiguous autumn time takes the later instant. A slot is due from its time for up to 30 minutes. Only the latest due slot of each group is sent, and at most once per day per device.

- 07:30 silent nudge, skipped once she is up. 08:15 loud alarm, skipped once she is up.
- Protein at +10, +20 and +30 minutes after "up". These stop after `protein-done` or `protein-skipped`.
- Water reminders at their times. Check-ins at their times, skipped once done. Bedtime nudge (silent), skipped after goodnight. A bedtime before 04:00 counts as the previous evening.

## Setup (one time)

You need a Cloudflare API token with **Account › Workers Scripts › Edit**, **Account › D1 › Edit** and access to the account's workers.dev subdomain.

```sh
cd server
npx wrangler d1 create vidrichka-push-db            # copy the database_id into wrangler.toml
npx wrangler d1 migrations apply vidrichka-push-db --remote
# VAPID private key (JWK JSON); the public key is in wrangler.toml and src/features/daily/push-config.js
npx wrangler secret put VAPID_PRIVATE_KEY < private-jwk.json
npx wrangler deploy
curl https://vidrichka-push.<subdomain>.workers.dev/health
```

Then set `PUSH_URL` in `src/features/daily/push-config.js` to the Worker URL, and push the app.

## Development

```sh
npm test                                 # unit + API tests (node:test, no deps)
npx wrangler d1 migrations apply vidrichka-push-db --local
npx wrangler dev --local --test-scheduled  # needs .dev.vars with VAPID_PRIVATE_KEY
curl "http://localhost:8787/__scheduled?cron=*+*+*+*+*"   # run the cron once
npm run e2e                              # real push to headless Chrome via the local worker
```
