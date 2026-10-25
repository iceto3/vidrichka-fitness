-- Vidrichka push server schema. Stores no health data: only the push subscription, the
-- device's time zone and reminder settings, and minimal per-day flags (timestamps of
-- "awake", "protein done", "check-in done", "goodnight done").
CREATE TABLE IF NOT EXISTS devices (
  id TEXT PRIMARY KEY,            -- random, client-generated (22–64 base64url chars)
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  tz TEXT NOT NULL,               -- IANA zone, e.g. Europe/Sofia
  settings TEXT NOT NULL,         -- JSON (times, toggles, silent flags)
  texts TEXT NOT NULL DEFAULT '{}', -- JSON: localized notification texts by kind
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,              -- device-local YYYY-MM-DD
  ack_at INTEGER,                 -- woke up / tapped the morning notification (epoch ms)
  protein_done INTEGER,
  checkin_am INTEGER,
  checkin_pm INTEGER,
  goodnight INTEGER,
  PRIMARY KEY (device_id, day)
);

-- Once-per-day dedupe: a row is claimed (INSERT OR IGNORE) before a reminder is sent.
CREATE TABLE IF NOT EXISTS sent (
  device_id TEXT NOT NULL,
  day TEXT NOT NULL,
  kind TEXT NOT NULL,
  at INTEGER NOT NULL,
  PRIMARY KEY (device_id, day, kind)
);
