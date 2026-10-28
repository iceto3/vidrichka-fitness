/**
 * 1.4.2 Sleep from bedtime and wake-up time (pure, unit tested).
 *
 * A night is keyed by the morning it ends (`day` = D, as everywhere in the app); its
 * evening is E = D − 1. The bedtime picker only gives a clock time, so its date follows
 * one rule: 12:00–23:59 → the evening E, 00:00–11:59 → after midnight, i.e. D. A small
 * "ден назад / ден напред" override moves the bedtime by one day (−1 … +1) for the rare
 * night that breaks the rule. The wake-up is the next occurrence of its clock time after
 * the bedtime, so hours across midnight just work.
 *
 * Old entries (hours only, 1.3.4–1.4.1) are not rewritten: `editorTimes` derives times
 * for the editor (wake-up = the recorded wake-up or 07:00, bedtime = wake-up − hours) and
 * only an edit stores the new fields.
 * @module features/daily/sleeptimes
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';
import { HOUR, MIN, at } from './logic.js';

/** Hour from which a bedtime counts as the evening before (12:00). */
export const EVENING_FROM_H = 12;
/** Editor defaults when nothing is known: 23:30 → 07:00 (7 h 30 min). */
export const DEFAULT_BED = '23:30';
export const DEFAULT_WAKE = '07:00';

/** `HH:MM` → minutes after midnight, or NaN. @param {string} t */
export const minutesOf = (t) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(t ?? '').trim());
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return NaN;
  return Number(m[1]) * 60 + Number(m[2]);
};

/** Local `HH:MM` of a timestamp. @param {number} ts */
export const hhmm = (ts) => {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/** Shift a day key by n days. @param {string} day @param {number} n */
const plus = (day, n) => dayKey(addDays(parseDay(day), n));

/**
 * Day key of the bedtime for the night ending on the morning `day` (rule + override).
 * @param {string} day Morning (D). @param {string} bed `HH:MM`. @param {number} [shift] -1, 0 or +1.
 */
export function bedDay(day, bed, shift = 0) {
  const s = Math.max(-1, Math.min(1, Math.round(Number(shift) || 0)));
  const ruled = minutesOf(bed) >= EVENING_FROM_H * 60 ? plus(day, -1) : day;
  return plus(ruled, s);
}

/** Bedtime timestamp. @param {string} day @param {string} bed @param {number} [shift] */
export const bedTs = (day, bed, shift = 0) => at(bedDay(day, bed, shift), bed);

/**
 * Next occurrence of the wake-up clock time strictly after the bedtime.
 * @param {number} bed Timestamp. @param {string} wake `HH:MM`
 */
export function wakeTs(bed, wake) {
  const k = dayKey(bed);
  let ts = at(k, wake);
  for (let i = 1; ts <= bed && i <= 2; i++) ts = at(k, wake, i); // DST-safe: re-anchor per day
  return ts;
}

/** Hours between two timestamps, to the minute. @param {number} bed @param {number} wake */
export const durationH = (bed, wake) => Math.round((wake - bed) / MIN) / 60;

/**
 * The night from the editor's values: timestamps, hours and the dates to show.
 * @param {string} day @param {{bed: string, wake: string, shift?: number}} v
 */
export function nightFrom(day, v) {
  const bed = bedTs(day, v.bed, v.shift ?? 0),
    wake = wakeTs(bed, v.wake);
  return { bed, wake, hours: durationH(bed, wake), bedDay: dayKey(bed), wakeDay: dayKey(wake) };
}

/** Override that reproduces a stored bedtime with the rule (-1 … +1, 0 when off by more). @param {string} day @param {number} ts */
export function shiftOf(day, ts) {
  const ruled = bedDay(day, hhmm(ts), 0),
    diff = Math.round((parseDay(dayKey(ts)).getTime() - parseDay(ruled).getTime()) / (24 * HOUR));
  return Math.abs(diff) <= 1 ? diff : 0;
}

/**
 * Values for the editor of the night ending on `day`.
 * - `times`: saved with 1.4.2 (sleepBed/sleepWake on the morning's record);
 * - `hours`: an older hours-only entry → wake-up = recorded wake-up (or 07:00), bed = wake − hours;
 * - `tracked`: no entry, but goodnight + wake-up were recorded → those times;
 * - `default`: nothing known → 23:30 → 07:00.
 * @param {string} day @param {any} rec The morning's `days` record. @param {any} [eve] The evening's record.
 * @returns {{bed: string, wake: string, shift: number, source: 'times'|'hours'|'tracked'|'default'}}
 */
export function editorTimes(day, rec = {}, eve = {}) {
  const r = rec ?? {},
    e = eve ?? {};
  if (typeof r.sleepBed === 'number' && typeof r.sleepWake === 'number' && r.sleepWake > r.sleepBed)
    return { bed: hhmm(r.sleepBed), wake: hhmm(r.sleepWake), shift: shiftOf(day, r.sleepBed), source: 'times' };
  if (typeof r.sleepH === 'number' && r.sleepH > 0) {
    const wake = typeof r.wake === 'number' && dayKey(r.wake) === day ? r.wake : at(day, DEFAULT_WAKE);
    const bed = wake - Math.round(r.sleepH * 60) * MIN;
    return { bed: hhmm(bed), wake: hhmm(wake), shift: shiftOf(day, bed), source: 'hours' };
  }
  if (typeof e.bed === 'number' && typeof r.wake === 'number' && r.wake > e.bed && r.wake - e.bed <= 16 * HOUR)
    return { bed: hhmm(e.bed), wake: hhmm(r.wake), shift: shiftOf(day, e.bed), source: 'tracked' };
  return { bed: DEFAULT_BED, wake: DEFAULT_WAKE, shift: 0, source: 'default' };
}
