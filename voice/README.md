# vidrichka-voice

A stateless Cloudflare Worker. It turns a dictated or typed sentence into food and water entries for Vidrichka Fitness with xAI and stores nothing (no D1 or KV).

- `GET /health` returns `{ ok, version, configured }`.
- `POST /parse` takes the body `{ text, today: 'YYYY-MM-DD', time: 'HH:MM', tz, lang: 'bg'|'en' }`, sent as `text/plain` JSON. It returns `{ entries, model, usage }`. Each entry is either `{type:'food', name, meal, meal_named, amount, grams, kcal, protein, carbs, fat, fiber, salt, date, time}` or `{type:'water', amount_ml, meal, meal_named, date, time}` (`fiber`/`salt` in grams for the portion, `null` if unknown; `meal_named` is true when the sentence named the meal).

## Protection

- **Origin:** `ALLOWED_ORIGINS` (`https://iceto3.github.io`) plus localhost. Requests from any other origin get 403, and CORS headers are sent only to allowed origins.
- **Methods:** only `OPTIONS`, `GET /health` and `POST /parse` are accepted. Anything else gets 404 or 405.
- **Input:** text up to `MAX_TEXT` (500) characters and a body up to 4 KB. The xAI `max_tokens` is `MAX_TOKENS` (1200 since 1.3.1, also the hard cap), with temperature 0 and a strict JSON schema.
- **Rate limit:** 8 requests a minute per IP with the free Workers Rate Limiting binding (`LIMITER`), plus a per-isolate fallback.
- **Privacy:** user text is never logged. The key is only a Worker secret.

## Deploy

The API token needs the account permission **Workers Scripts: Edit**.

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
