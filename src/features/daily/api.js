/**
 * Public API of the daily-rhythm feature: wake-up, protein, check-ins, goodnight and
 * sleep history, stored one row per day in the `days` store. Other features import only
 * this file.
 * @module features/daily/api
 */
import { all, get, put } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { addDays, dayKey, parseDay } from '../../core/dates.js';
import { dailySettings } from '../../core/settings.js';
import { award } from '../motivation/api.js';
import { eveningKey, fillBedtime, isEvening, isMorning, nights, proteinOnTime, sleepStreak } from './logic.js';

export { BREAKFAST_LOGGER, proteinBar, proteinState, sleepHours, isEvening, isMorning, eveningKey } from './logic.js';
export { dailyEnabled, syncDaily, checkDaily } from './notify.js';
export { pushOn } from './push.js';

/** XP for tucking Vidrichka in (small, once per evening). */
export const GOODNIGHT_XP = 10;

/** A day's record (never null). @param {string} [day] */
export const day = (day = dayKey()) => get('days', day) ?? { id: day };

/** Merge fields into a day's record. @param {string} id @param {Record<string, any>} patch */
export const patchDay = (id, patch) => put('days', { ...day(id), ...patch, id });

const yesterday = (/** @type {string} */ d) => dayKey(addDays(parseDay(d), -1));

/**
 * Good morning! Records the wake-up time (once a day) and starts the 30-min protein
 * countdown. If she forgot to say goodnight, last night's bedtime is estimated.
 * @param {number} [now]
 * @returns {boolean} true if this call recorded the wake-up.
 */
export function wakeUp(now = Date.now()) {
  const id = dayKey(now),
    rec = day(id);
  if (rec.wake) return false;
  const est = fillBedtime(get('days', yesterday(id)));
  if (est) patchDay(yesterday(id), est);
  patchDay(id, { wake: now, ack: rec.ack ?? now, ...(dailySettings().protein ? { proteinStart: now } : {}) });
  emit('daily:wake');
  emit('daily:changed');
  return true;
}

/** "Yes, I ate" — stops the protein reminders and celebrates. @param {number} [now] */
export function proteinYes(now = Date.now()) {
  const id = dayKey(now),
    rec = day(id);
  if (rec.proteinAt) return false;
  const next = patchDay(id, { proteinAt: now, proteinStart: rec.proteinStart ?? now, proteinCelebrated: true });
  emit('protein:done', { onTime: proteinOnTime(next) });
  emit('daily:changed');
  return true;
}

/**
 * "Skipped" — no protein breakfast today: stops the reminders (here and on the push
 * server) without a celebration or quest credit. @param {number} [now]
 */
export function proteinSkip(now = Date.now()) {
  const id = dayKey(now),
    rec = day(id);
  if (!rec.proteinStart || rec.proteinAt || rec.proteinSkip) return false;
  patchDay(id, { proteinSkip: now });
  emit('protein:skipped');
  emit('daily:changed');
  return true;
}

/** Celebrate a "yes" given on a notification (recorded by the service worker) once the app opens. */
export function catchUpProtein() {
  const rec = get('days', dayKey());
  if (!rec?.proteinAt || rec.proteinCelebrated) return;
  patchDay(rec.id, { proteinCelebrated: true });
  emit('protein:done', { onTime: proteinOnTime(rec) });
}

/** Morning check-in: how she feels + how she slept (1–5). @param {{mood?: number, sleepQ?: number}} v */
export function checkinMorning(v) {
  const rec = patchDay(dayKey(), v);
  if (rec.mood && rec.sleepQ) (emit('checkin:done', 'morning'), emit('daily:changed'));
  return rec;
}

/** Evening check-in: energy during the day (1–5). @param {number} energy */
export function checkinEvening(energy) {
  patchDay(dayKey(), { energy });
  emit('checkin:done', 'evening');
  emit('daily:changed');
}

/**
 * Goodnight, Vidrichka: records tonight's bedtime (+ small XP once per evening).
 * @param {number} [now]
 */
export function goodnight(now = Date.now()) {
  const id = eveningKey(now);
  patchDay(id, { bed: now, bedEst: false });
  award(`sleep:${id}`, GOODNIGHT_XP);
  emit('daily:goodnight', id);
  emit('daily:changed');
  return id;
}

/** Undo an accidental goodnight tap (keeps the XP ledger idempotent). */
export function undoGoodnight() {
  const id = eveningKey(Date.now());
  patchDay(id, { bed: null, bedEst: false });
  emit('daily:changed');
}

/** Correct last night's bedtime (check-in). @param {number} ts */
export function setLastBedtime(ts) {
  patchDay(yesterday(dayKey()), { bed: ts, bedEst: false });
  emit('daily:changed');
}

/** Last night's bedtime record (for the check-in correction). */
export const lastNight = () => {
  const id = yesterday(dayKey()),
    r = get('days', id) ?? { id },
    est = r.bed ? null : fillBedtime(r);
  return { id, bed: r.bed ?? est?.bed ?? null, bedEst: r.bed ? !!r.bedEst : !!est };
};

let lastTouch = 0;
/** Remember app use in the evening (for the bedtime estimate); at most every 5 min. */
export function touch(now = Date.now()) {
  if (!isEvening(now) || now - lastTouch < 5 * 60_000) return;
  lastTouch = now;
  const id = eveningKey(now);
  if (!day(id).bed) patchDay(id, { lastUse: now });
}

/** Has she woken up (said good morning) today? */
export const wokeToday = () => !!get('days', dayKey())?.wake;

/** Did she say goodnight this evening? */
export const tuckedIn = (now = Date.now()) => {
  const r = get('days', eveningKey(now));
  return !!r?.bed && !r.bedEst;
};

/** Sleep history, newest first. @param {number} n */
export const sleepNights = (n) => nights(all('days'), n, dayKey());

/** Evenings in a row she said goodnight. */
export const sleepRun = () => sleepStreak(all('days'), Date.now());

/** Show the "Good morning" card on Home? */
export const morningPending = (now = Date.now()) => isMorning(now) && !wokeToday();
