/**
 * Pure date helpers (no DOM). Days are keyed as local `YYYY-MM-DD` strings,
 * weeks start on Monday and are keyed by their Monday's day key.
 * @module core/dates
 */

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');

/**
 * Local day key `YYYY-MM-DD`.
 * @param {Date|number|string} [d]
 * @returns {string}
 */
export const dayKey = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/**
 * Parse a day key into a local Date at midnight.
 * @param {string} key
 */
export const parseDay = (key) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d);
};

/**
 * Add days to a date (returns a new Date).
 * @param {Date|number} d
 * @param {number} n
 */
export const addDays = (d, n) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Weekday index with Monday = 0 … Sunday = 6. @param {Date|number} d */
export const weekdayMon = (d) => (new Date(d).getDay() + 6) % 7;

/** Monday 00:00 of the week containing `d`. @param {Date|number} [d] */
export const startOfWeek = (d = new Date()) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return addDays(x, -weekdayMon(x));
};

/** Week key = day key of that week's Monday. @param {Date|number} [d] */
export const weekKey = (d = new Date()) => dayKey(startOfWeek(d));

/** Month key `YYYY-MM`. @param {Date|number} [d] */
export const monthKey = (d = new Date()) => dayKey(d).slice(0, 7);

/** `HH:MM` local time. @param {Date|number} [d] */
export const hhmm = (d = new Date()) => {
  const x = new Date(d);
  return `${pad(x.getHours())}:${pad(x.getMinutes())}`;
};

/**
 * Format seconds as `m:ss` or `h:mm:ss`.
 * @param {number} sec
 */
export const clock = (sec) => {
  const s = Math.max(0, Math.round(sec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${pad(m)}:${pad(s % 60)}` : `${m}:${pad(s % 60)}`;
};

/**
 * Workout minutes, the one rounding used everywhere (summary, share card, celebration,
 * calendar, history, recap): to the nearest minute, but any workout of 1 s or more shows
 * at least 1 min.
 * @param {number} sec
 */
export const durationMin = (sec) => (sec > 0 ? Math.max(1, Math.round(sec / 60)) : 0);

/** Total minutes of several workouts (sum of the per-workout minutes, so the parts add up). @param {{durationSec?: number}[]} list */
export const totalMin = (list) => list.reduce((a, s) => a + durationMin(s.durationSec ?? 0), 0);

/** Whole days between two dates (b - a). @param {Date|number} a @param {Date|number} b */
export const daysBetween = (a, b) => Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);

/** @param {Date|number} d */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/**
 * 1.4.3 (tester round): a typed 24-hour time → "HH:MM", or null. Accepts „7“, „730“, „0730“,
 * „7:30“, „07.30“, „7,30“ and „7 30“; hours 0–23, minutes 0–59.
 * @param {string} s @returns {string|null}
 */
export function parseHM(s) {
  const v = String(s ?? '').trim();
  const r = /^(\d{1,2})\s*[:.,h ]\s*(\d{2})$/.exec(v);
  /** @type {string[]|null} */
  let m = r ? [...r] : null;
  if (!m && /^\d{3,4}$/.test(v)) m = [v, v.slice(0, -2), v.slice(-2)];
  if (!m && /^\d{1,2}$/.test(v)) m = [v, v, '00'];
  if (!m) return null;
  const h = Number(m[1]),
    min = Number(m[2]);
  return h <= 23 && min <= 59 ? `${String(h).padStart(2, '0')}:${String(min).padStart(2, '0')}` : null;
}

/** A typed time is complete (HH:MM or 4 digits), so it can be used while still typing. @param {string} s */
export const hmComplete = (s) => /^\s*(\d{2}\s*[:.,]\s*\d{2}|\d{4})\s*$/.test(String(s ?? ''));

/**
 * "HH:MM" moved by `d` minutes, around the clock (23:50 + 15 → 00:00, 00:00 − 15 → 23:45). When stepping, the
 * time first snaps to the step grid (07:07 + 15 → 07:15, 07:07 − 15 → 07:00).
 * @param {string} hm @param {number} d @returns {string}
 */
export function stepHM(hm, d) {
  const [h, m] = (parseHM(hm) ?? '00:00').split(':').map(Number);
  const cur = h * 60 + m,
    step = Math.abs(d) || 1,
    off = cur % step;
  const next = off ? (d > 0 ? cur - off + step : cur - off) : cur + d;
  const t = ((next % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}
