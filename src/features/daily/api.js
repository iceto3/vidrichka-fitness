/**
 * Public API of the daily-rhythm feature: wake-up, protein, check-ins, goodnight and
 * sleep history, stored one row per day in the `days` store. Other features import only
 * this file.
 * @module features/daily/api
 */
import { all, get, put } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { addDays, dayKey, hhmm, parseDay } from '../../core/dates.js';
import { dailySettings } from '../../core/settings.js';
import { award, setAward } from '../motivation/api.js';
import { eveningKey, fillBedtime, isEvening, isMorning, nights, proteinOnTime, sleepStreak } from './logic.js';
import { TIMED_MEAL, actualAt, askWhenAte, checkAteAt, plannedAt, withActual } from './mealtime.js';

export {
  BREAKFAST_LOGGER,
  dailyOnCount,
  proteinBar,
  proteinState,
  sleepHours,
  isEvening,
  isMorning,
  eveningKey,
} from './logic.js';
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
  if (rec.wake) {
    // 1.4.3 (tester): woke earlier (typed in the sleep editor, or tapped with protein off)
    if (proteinFromWake(now)) (emit('daily:changed'), emit('daily:wake'));
    return false;
  }
  const est = fillBedtime(get('days', yesterday(id)));
  if (est) patchDay(yesterday(id), est);
  patchDay(id, { wake: now, ack: rec.ack ?? now });
  proteinFromWake(now);
  emit('daily:wake');
  emit('daily:changed');
  return true;
}

/** How far ahead of the clock a typed wake-up may be (the sleep editor's slack, min). */
const WAKE_SLACK = 5 * 60_000;

/**
 * 1.4.3 (tester round): today's recorded wake-up – the morning tap or a wake time typed in
 * the sleep editor – starts the 30-min protein countdown at that time when it has not
 * started yet (protein on, nothing answered). An expired window is simply overdue, so the
 * pill / banner still take Изядох (with the eaten time) or Пропуснах. Only today: past days
 * are never started afterwards.
 * @param {number} [now] @returns {boolean} true if it set proteinStart.
 */
export function proteinFromWake(now = Date.now()) {
  const id = dayKey(now),
    rec = get('days', id);
  if (!rec || !dailySettings().protein || rec.proteinStart || rec.proteinAt || rec.proteinSkip) return false;
  const w = [rec.wake, rec.sleepWake].find((x) => typeof x === 'number' && dayKey(x) === id && x <= now + WAKE_SLACK);
  if (w == null) return false;
  const start = Math.min(w, now);
  patchDay(id, { proteinStart: start });
  // 1.4.3 (fixes): a breakfast saved before the wake-up was entered (e.g. the sleep sheet
  // filled in after eating) is the protein breakfast too, graded by when it was eaten:
  // on time 15, up to 60 min after the window 8 („+N мин“), later 0 („пропуснато“).
  const bf = all('food')
    .filter((r) => r.date === id && r.meal === TIMED_MEAL && r.type !== 'water' && !r.removed && r.ts <= now)
    .sort((a, b) => b.ts - a.ts)[0];
  if (bf) {
    patchDay(id, { proteinAteAt: Math.max(Number(bf.ts) || now, start) });
    proteinLogged(bf, now);
  }
  return true;
}

/**
 * Protein breakfast recorded — stops the protein reminders and celebrates. Since 1.2.1 this
 * runs only when a breakfast entry is actually saved (see `proteinLogged`); "Yes, I ate"
 * buttons just open the breakfast logger. @param {number} [now]
 */
export function proteinYes(now = Date.now()) {
  const id = dayKey(now),
    rec = day(id);
  if (rec.proteinAt) return false;
  const start = rec.proteinStart ?? now;
  // 1.4.3: planned (end of the 30-min window) and actual time (typed for a late meal, else now)
  const mealTimes = {
    ...rec.mealTimes,
    [TIMED_MEAL]: { planned: plannedAt({ proteinStart: start }), actual: actualAt(rec, now) },
  };
  const next = patchDay(id, {
    proteinAt: now,
    proteinStart: start,
    proteinCelebrated: true,
    mealTimes,
    proteinAteAt: null,
  });
  emit('protein:done', { onTime: proteinOnTime(next) });
  emit('daily:changed');
  return true;
}

/**
 * A food row was saved: if it is today's breakfast (not water) while the protein countdown
 * runs, that is the protein breakfast. The quest/XP then follows the usual 30-min window
 * (`proteinOnTime`). @param {any} row @param {number} [now]
 * @returns {boolean} true if it recorded the protein breakfast.
 */
export function proteinLogged(row, now = Date.now()) {
  if (!row || row.removed || row.type === 'water' || row.meal !== TIMED_MEAL || row.date !== dayKey(now)) return false;
  const id = dayKey(now),
    rec = day(id);
  // 1.4.3 (round 2): Undo of the deleted protein breakfast puts back exactly what it had recorded
  const u = rec.proteinUndo;
  if (u && u.row === row.id && !rec.proteinAt && !rec.proteinSkip) {
    patchDay(id, {
      proteinAt: u.proteinAt,
      proteinCelebrated: u.proteinCelebrated,
      proteinStart: rec.proteinStart ?? u.proteinStart,
      mealTimes: { ...rec.mealTimes, ...(u.mealTime ? { [TIMED_MEAL]: u.mealTime } : {}) },
      proteinUndo: null,
    });
    emit('daily:changed');
    return true;
  }
  if (!rec.proteinStart || rec.proteinAt || rec.proteinSkip) return false;
  // 1.4.3 (part A): the protein breakfast switched off in Profile → a breakfast is just a breakfast
  if (!dailySettings().protein) return false;
  if (!proteinYes(now)) return false;
  if (u) patchDay(id, { proteinUndo: null });
  ateTimeOnRow(row);
  // 1.4.4: logged after the window without a typed time → „Кога яде?“ (once a day)
  if (askWhenAte(day(id), now)) emit('meal:whenAte', { meal: TIMED_MEAL });
  return true;
}

/**
 * 1.4.4 „Кога яде?“ answered. `at` = when she ate (checked: not in the future, not before
 * the countdown started); null = „Сега“, the logged time stays. Either way it is not asked
 * again today. The meal's actual time drives Хранене навреме and the graded quest XP
 * (rewards re-grades it – no double pay); the breakfast rows of that logging get the time.
 * @param {number|null} at @param {number} [now] @returns {boolean} true if the time changed.
 */
export function setMealActual(at, now = Date.now()) {
  const id = dayKey(now),
    rec = get('days', id),
    mt = rec?.mealTimes?.[TIMED_MEAL];
  if (!rec?.proteinAt || !mt) return false;
  if (at == null) {
    patchDay(id, withActual(rec, mt.actual));
    return false;
  }
  const ok = checkAteAt(rec, hhmm(new Date(at)), now);
  if (!ok.ok || Math.abs(ok.at - at) >= 60_000) return false;
  patchDay(id, withActual(rec, at));
  for (const r of all('food'))
    if (
      r.date === id &&
      r.meal === TIMED_MEAL &&
      r.type !== 'water' &&
      r.ts >= rec.proteinAt - 60_000 &&
      r.ts - rec.proteinAt < 60 * 60_000 &&
      r.ts > at
    )
      put('food', { ...r, ts: at, time: hhmm(new Date(at)) });
  emit('daily:changed');
  return true;
}

/**
 * 1.4.3 (round 2): a breakfast saved after „Кога яде?“ shows the time she ate, not the time
 * she saved it, so the diary row and the Прогрес chart agree. Only for rows saved for today's
 * breakfast after the meal was recorded (the same logging, within an hour) whose time is the
 * save time. @param {any} row @returns {boolean} true if the row's time was changed.
 */
export function ateTimeOnRow(row) {
  if (!row || row.removed || row.type === 'water' || row.meal !== TIMED_MEAL) return false;
  const rec = get('days', row.date),
    actual = rec?.mealTimes?.[TIMED_MEAL]?.actual;
  if (!rec?.proteinAt || !(actual > 0) || actual >= rec.proteinAt - 60_000) return false;
  if (!(row.ts >= rec.proteinAt - 60_000 && row.ts - rec.proteinAt < 60 * 60_000)) return false;
  put('food', { ...row, ts: actual, time: hhmm(new Date(actual)) });
  return true;
}

/**
 * 1.4.3 (round 2): today's protein breakfast follows the diary. When the last breakfast entry
 * of today is deleted (or moved away), the meal counts as not eaten again: `proteinAt` and the
 * meal's timing are cleared, so the countdown / pill come back (overdue once the window has
 * passed), the „готова“ card and the quest are un-ticked and the quest XP is taken back. What
 * was cleared is kept on the day (`proteinUndo`) so Undo / Възстанови restores it unchanged.
 * @param {string} rowId The breakfast row that went away. @param {number} [now]
 * @returns {boolean} true if it cleared the protein breakfast.
 */
export function proteinUnlogged(rowId, now = Date.now()) {
  const id = dayKey(now),
    rec = get('days', id);
  if (!rec?.proteinAt) return false;
  if (all('food').some((r) => r.date === id && r.meal === TIMED_MEAL && r.type !== 'water')) return false;
  const mealTimes = { ...rec.mealTimes };
  delete mealTimes[TIMED_MEAL];
  patchDay(id, {
    proteinAt: null,
    proteinCelebrated: null,
    proteinAteAt: null,
    mealTimes,
    proteinUndo: {
      row: rowId,
      proteinAt: rec.proteinAt,
      proteinCelebrated: rec.proteinCelebrated ?? null,
      proteinStart: rec.proteinStart ?? null,
      mealTime: rec.mealTimes?.[TIMED_MEAL] ?? null,
    },
  });
  setAward(`quest:${id}:protein`, 0);
  emit('daily:changed');
  return true;
}

/**
 * 1.4.3: the time she says she ate a late breakfast („Изядох в 9:15“). Kept until the
 * breakfast is saved in the logger, which then records it as the actual time (see proteinYes).
 * @param {number} at Checked with `checkAteAt` (not in the future). @param {number} [now]
 */
export function setAteAt(at, now = Date.now()) {
  const id = dayKey(now),
    rec = day(id);
  if (!rec.proteinStart || rec.proteinAt || rec.proteinSkip || !(at > 0) || at > now) return false;
  patchDay(id, { proteinAteAt: at });
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

/** Longest night a manual sleep entry accepts (hours). */
export const MAX_SLEEP_H = 16;

/**
 * 1.3.4: record last night's sleep by hand (or by voice): hours and/or quality 1–5, kept on
 * the morning's record (like the morning check-in). Hours typed here win over the
 * bedtime/wake-up estimate.
 * @param {string} date Day key of the morning. @param {{hours?: number|null, q?: number|null}} v
 */
export function setSleep(date, v) {
  /** @type {Record<string, any>} */
  const patch = {};
  if (v.hours != null && Number.isFinite(Number(v.hours))) {
    patch.sleepH = Math.round(Math.min(MAX_SLEEP_H, Math.max(0, Number(v.hours))) * 60) / 60; // 1.4.0: to the minute
    // 1.4.2: hours alone (voice, screenshot) replace any bedtime/wake-up pair saved earlier.
    patch.sleepBed = null;
    patch.sleepWake = null;
  }
  if (v.q != null && Number.isFinite(Number(v.q))) patch.sleepQ = Math.min(5, Math.max(1, Math.round(Number(v.q))));
  if (!Object.keys(patch).length) return day(date);
  const rec = patchDay(date, patch);
  emit('sleep:logged', { date, ...patch });
  emit('daily:changed');
  return rec;
}

/**
 * 1.4.2: record last night's sleep as bedtime + wake-up (timestamps from the sleep editor,
 * see ./sleeptimes.js). Hours are computed (to the minute) and stored as before, so streaks,
 * charts and the morning screen keep reading `sleepH`. The goodnight `bed` is left alone; a
 * wake-up typed for today also becomes this morning's `wake` and protein start (1.4.3).
 * @param {string} date Morning's day key. @param {{bed: number, wake: number}} v
 */
export function setSleepTimes(date, v) {
  const bed = Number(v.bed),
    wake = Number(v.wake),
    hours = Math.round((wake - bed) / 60_000) / 60;
  if (!Number.isFinite(hours) || hours <= 0 || hours > MAX_SLEEP_H) throw new RangeError('sleep times');
  const patch = { sleepBed: bed, sleepWake: wake, sleepH: hours };
  const prev = day(date);
  let rec = patchDay(date, patch);
  // 1.4.3 (tester): a wake-up typed for this morning means she is up – it counts as the
  // morning's wake-up (if none yet) and starts the protein countdown at that time. The
  // editor saves on every change, so a wake-up that came from the editor follows a corrected
  // time (and so does a countdown started from it, while nothing is answered).
  const now = Date.now();
  if (date === dayKey(now) && dayKey(wake) === date && wake <= now + WAKE_SLACK) {
    const fromEditor = prev.wake != null && prev.wake === prev.sleepWake;
    if (!rec.wake || fromEditor)
      rec = patchDay(date, { wake, ack: !rec.ack || rec.ack === prev.wake ? wake : rec.ack });
    if (fromEditor && rec.proteinStart === prev.sleepWake && !rec.proteinAt && !rec.proteinSkip)
      rec = patchDay(date, { proteinStart: Math.min(wake, now) });
    if (proteinFromWake(now)) rec = day(date);
  }
  emit('sleep:logged', { date, ...patch });
  emit('daily:changed');
  return rec;
}

/**
 * 1.4.0: delete a day's manual sleep entry (hours and quality). A bedtime/wake-up estimate,
 * if any, shows again. @param {string} date
 */
export function clearSleep(date) {
  const prev = day(date);
  /** @type {Record<string, any>} */
  const patch = { sleepH: null, sleepQ: null, sleepBed: null, sleepWake: null };
  // 1.4.3 (round 2): today's wake-up that came from this entry goes with it, and so does a
  // protein countdown started from it while the meal is unanswered.
  if (date === dayKey(Date.now()) && prev.wake != null && prev.wake === prev.sleepWake) {
    patch.wake = null;
    if (prev.ack === prev.wake) patch.ack = null;
    if (prev.proteinStart && !prev.proteinAt && !prev.proteinSkip)
      ((patch.proteinStart = null), (patch.proteinAteAt = null));
  }
  const rec = patchDay(date, patch);
  emit('sleep:logged', { date, cleared: true });
  emit('daily:changed');
  return { rec, undo: Object.fromEntries(Object.keys(patch).map((k) => [k, prev[k] ?? null])) };
}

/**
 * 1.4.3 (round 2): Undo of a deleted sleep entry: the fields it cleared come back as they
 * were (a protein countdown only while the meal is still unanswered).
 * @param {string} date @param {Record<string, any>} undo From {@link clearSleep}.
 */
export function restoreSleep(date, undo) {
  const rec = day(date),
    back = { ...undo };
  if (rec.proteinAt || rec.proteinSkip || rec.proteinStart) (delete back.proteinStart, delete back.proteinAteAt);
  if (rec.wake) delete back.wake;
  patchDay(date, back);
  emit('sleep:logged', { date });
  emit('daily:changed');
}

/** Last night's sleep (the morning of `date`): hours (manual or estimated) and quality. @param {string} [date] */
export function sleepOf(date = dayKey()) {
  const n = nights(all('days'), 1, date)[0];
  return { hours: n.hours, q: n.sleepQ, manual: day(date).sleepH != null };
}

/**
 * 1.3.4: mood or energy (1–5) for a day, e.g. said with "Кажи". 1.4.0: null clears it.
 * @param {string} date @param {'mood'|'energy'} field @param {number|null} v
 */
export function rateDay(date, field, v) {
  if (v == null) return (patchDay(date, { [field]: null }), emit('daily:changed'), null); // 1.4.0: clear
  const n = Math.min(5, Math.max(1, Math.round(Number(v) || 3)));
  patchDay(date, { [field]: n });
  emit('daily:changed');
  return n;
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
