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

/** Whole days between two dates (b - a). @param {Date|number} a @param {Date|number} b */
export const daysBetween = (a, b) =>
  Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 864e5);

/** @param {Date|number} d */
function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
