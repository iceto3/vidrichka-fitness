-- 1.3.4: anonymous "help improve the app" data. No IP, device id, grams or dates for foods;
-- feedback keeps only its text, app version, language and the time it was sent.

-- Manually entered foods (name + per-100 g values). Identical entries are counted, not repeated.
CREATE TABLE IF NOT EXISTS foods_shared (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  lang TEXT NOT NULL,
  kcal REAL NOT NULL,
  protein REAL,
  carbs REAL,
  fat REAL,
  fiber REAL,
  salt REAL,
  n INTEGER NOT NULL DEFAULT 1    -- how many times this exact entry was sent
);
CREATE INDEX IF NOT EXISTS foods_shared_name ON foods_shared (lang, name);

-- In-app feedback (Profile › Feedback).
CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  text TEXT NOT NULL,
  version TEXT NOT NULL,
  lang TEXT NOT NULL,
  created_at INTEGER NOT NULL     -- epoch ms
);
-- Up to 3 screenshots per message, JPEG/PNG/WebP, ≤ 300 KB each (resized on the phone).
CREATE TABLE IF NOT EXISTS feedback_images (
  feedback_id INTEGER NOT NULL REFERENCES feedback (id) ON DELETE CASCADE,
  idx INTEGER NOT NULL,
  mime TEXT NOT NULL,
  data BLOB NOT NULL,
  PRIMARY KEY (feedback_id, idx)
);
