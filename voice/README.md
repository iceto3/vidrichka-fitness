# vidrichka-voice

A stateless Cloudflare Worker. It turns a dictated or typed sentence into food and water entries for Vidrichka Fitness with xAI and stores nothing (no D1 or KV).

- `GET /health` returns `{ ok, version, configured, transcribe }`.
- `POST /transcribe?lang=bg|en` (1.1.0) takes the recorded audio as the raw body (`Content-Type: audio/*`, e.g. `audio/mp4` from iPhone or `audio/webm;codecs=opus` from Android; at most 1 MB and 35 s). It runs Workers AI `@cf/openai/whisper-large-v3-turbo` (with `vad_filter`) and returns `{ text, duration }`.
- `POST /parse` takes the body `{ text, today: 'YYYY-MM-DD', time: 'HH:MM', tz, lang: 'bg'|'en' }`, sent as `text/plain` JSON. It returns `{ entries, model, usage }`. Each entry is either `{type:'food', name, meal, meal_named, amount, grams, kcal, protein, carbs, fat, fiber, salt, date, time}` or `{type:'water', amount_ml, meal, meal_named, date, time}` (`fiber`/`salt` in grams for the portion, `null` if unknown; `meal_named` is true when the sentence named the meal).

## Open Food Facts search (1.4.0, beta Worker)

`GET /off-search?q=<text>&lang=bg|en` → `{products: [...]}` – OFF text search for the app, whose own search endpoints are not usable from a browser (CORS). Cached for a day, 20 requests per minute per IP (`OFF_LIMITER`), allowed origins only, the query is never logged.

## Protection

- **Origin:** `ALLOWED_ORIGINS` (`https://iceto3.github.io`) plus localhost. Requests from any other origin get 403, and CORS headers are sent only to allowed origins.
- **Methods:** only `OPTIONS`, `GET /health` and `POST /parse` are accepted. Anything else gets 404 or 405.
- **Input:** text up to `MAX_TEXT` (500) characters and a body up to 4 KB. The xAI `max_tokens` is `MAX_TOKENS` (1200 since 1.3.1, also the hard cap), with temperature 0 and a strict JSON schema.
- **Rate limit:** 8 requests a minute per IP with the free Workers Rate Limiting binding (`LIMITER`), plus a per-isolate fallback.
- **Transcription:** `audio/*` only (415 otherwise), 1 MB (413), 35 s (413 `too-long`), 6 a minute per IP (`STT_LIMITER`, plus a per-isolate fallback). It uses the free Workers AI allocation (10,000 neurons a day; Whisper turbo is about 47 neurons per audio minute).
- **Privacy:** user text is never logged. Audio is only held in memory for the request, never stored or logged. The key is only a Worker secret.

## Deploy

The API token needs the account permission **Workers Scripts: Edit** (and, for the `AI` binding, Workers AI access).

```sh
cd voice
wrangler deploy                                  # prints https://vidrichka-voice.<subdomain>.workers.dev
printenv XAI_API_KEY | wrangler secret put XAI_API_KEY   # never echo the key
curl https://vidrichka-voice.<subdomain>.workers.dev/health   # {"ok":true,"configured":true,...}
```

Then set `VOICE_URL` in `src/features/voice/config.js` to that URL and push. The buttons appear once `/health` reports `configured: true`.

## Tests

- `npm test` runs the unit tests (xAI is mocked).
- `npm run smoke:live` makes two real, cheap calls (one BG and one EN sentence) with `XAI_API_KEY` from the environment. It never prints the key.

For local dev, `wrangler dev` reads `.dev.vars`, which is git-ignored.
