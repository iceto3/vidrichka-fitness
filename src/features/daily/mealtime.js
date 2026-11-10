/**
 * 1.4.3 Meal reminder pill and meal timing — pure logic (no DOM, no storage), unit tested.
 *
 * The only meal with a countdown is the protein breakfast (see ./logic.js): its window
 * starts at `proteinStart` and lasts PROTEIN_WINDOW minutes. The planned time of the meal is
 * the end of that window. The pill reuses `proteinBar` (the Home banner's state), so there is
 * one countdown and one set of meal-window data.
 *
 * Timing is stored on the day record (backward compatible, no migration):
 *   mealTimes: { breakfast: { planned: ts, actual: ts } }   (1.4.3, written when eaten)
 *   proteinAteAt: ts   (1.4.3, the time she typed for a late meal, read when the breakfast is saved)
 * Older records only have `proteinStart` / `proteinAt` / `proteinSkip`; they are read as
 * planned = start + window, actual = proteinAt.
 * @module features/daily/mealtime
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';
import { MIN, PROTEIN_WINDOW, proteinBar, proteinQuest } from './logic.js';

/** The meal the countdown belongs to. */
export const TIMED_MEAL = 'breakfast';

/** Routes where the pill is never shown: the logger for that meal itself. */
const PILL_HIDDEN_ROUTES = /^food\/add\/breakfast$/;

/**
 * The pending meal for the pill: name key + the Home banner's countdown (shared logic).
 * Null when nothing is pending (no countdown, already eaten or skipped, reminders off).
 * @param {any} rec Today's record. @param {number} now @param {boolean} [enabled] protein reminder on
 * @returns {{meal: string, mode: 'running'|'overdue', time: string, late: {h: number, m: number} | null} | null}
 */
export function pendingMeal(rec, now, enabled = true) {
  if (!enabled) return null;
  const b = proteinBar(rec, now);
  if (!b || (b.mode !== 'running' && b.mode !== 'overdue')) return null;
  return { meal: TIMED_MEAL, mode: b.mode, time: b.time, late: b.late ?? null };
}

/**
 * Is the pill shown? Only with a pending meal, on a page with the bottom nav, never on
 * Начало (it has the big banner), never during a workout, never on the meal's own logger.
 * @param {{pending: any, tab?: string, navHidden?: boolean, workout?: boolean, path?: string}} s
 */
export const pillVisible = (s) =>
  !!s.pending && !!s.tab && s.tab !== 'home' && !s.navHidden && !s.workout && !PILL_HIDDEN_ROUTES.test(s.path ?? '');

/** Planned time of the protein breakfast (end of its window), or null. @param {any} rec */
export const plannedAt = (rec) => (rec?.proteinStart ? rec.proteinStart + PROTEIN_WINDOW * MIN : null);

/**
 * Timestamp for a typed `HH:MM` on a day. @param {string} day Day key. @param {string} hm
 * @returns {number|null}
 */
export function hmOn(day, hm) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm ?? '');
  if (!m || Number(m[1]) > 23 || Number(m[2]) > 59) return null;
  const d = parseDay(day);
  d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return d.getTime();
}

/**
 * Check a typed "ate at" time: not in the future and not before the countdown started.
 * The current minute counts as now.
 * @param {any} rec Today's record. @param {string} hm @param {number} now
 * @returns {{ok: true, at: number} | {ok: false, err: 'invalid'|'future'|'early'}}
 */
export function checkAteAt(rec, hm, now) {
  const at = hmOn(dayKey(now), hm);
  if (at == null) return { ok: false, err: 'invalid' };
  if (at > now) return { ok: false, err: 'future' };
  if (rec?.proteinStart && at < Math.floor(rec.proteinStart / MIN) * MIN) return { ok: false, err: 'early' };
  return { ok: true, at: Math.min(at, now) };
}

/**
 * The actual time to record when the breakfast is saved: the typed time if it is valid
 * (after the start, not after `now`), else `now`. @param {any} rec @param {number} now
 */
export function actualAt(rec, now) {
  const a = Number(rec?.proteinAteAt);
  return a > 0 && a <= now && (!rec?.proteinStart || a >= Math.floor(rec.proteinStart / MIN) * MIN) ? a : now;
}

/**
 * @typedef {{status: 'ontime'|'late'|'missed'|'pending', planned: number|null, actual: number|null, delayMin: number}} MealTiming
 */

/**
 * On time or late, from the planned and the actual time (late = after the window).
 * @param {number} planned @param {number} actual
 * @returns {{status: 'ontime'|'late', delayMin: number}}
 */
export function classify(planned, actual) {
  const d = Math.round((actual - planned) / MIN);
  return d > 0 ? { status: 'late', delayMin: d } : { status: 'ontime', delayMin: 0 };
}

/**
 * Timing of a day's timed meal, or null when that day had no countdown.
 * New records use `mealTimes`; older ones are read from proteinStart/proteinAt/proteinSkip.
 * A day before today whose meal was never answered counts as missed; today's is pending.
 * @param {any} rec Day record. @param {string} today Day key of today.
 * @returns {MealTiming | null}
 */
export function mealTiming(rec, today) {
  if (!rec) return null;
  const mt = rec.mealTimes?.[TIMED_MEAL];
  if (mt && Number(mt.planned) > 0 && Number(mt.actual) > 0)
    return {
      ...classify(Number(mt.planned), Number(mt.actual)),
      planned: Number(mt.planned),
      actual: Number(mt.actual),
    };
  const planned = plannedAt(rec);
  if (!planned) return null;
  if (rec.proteinAt) return { ...classify(planned, rec.proteinAt), planned, actual: rec.proteinAt };
  if (rec.proteinSkip || (rec.id && rec.id < today)) return { status: 'missed', planned, actual: null, delayMin: 0 };
  return { status: 'pending', planned, actual: null, delayMin: 0 };
}

/** 1.4.3 (part A): a breakfast with at least this much protein (g) is a protein breakfast. */
export const PROTEIN_MIN_G = 30;

/**
 * Protein (g, whole) in a day's breakfast rows, or null when no breakfast food was saved that
 * day (older days whose rows are gone: unknown, never „low“). Water rows are ignored.
 * @param {{meal?: string, type?: string, p?: number}[]} [rows] That day's food rows.
 */
export function breakfastProtein(rows) {
  const b = (rows ?? []).filter((r) => r.meal === TIMED_MEAL && r.type !== 'water');
  return b.length ? Math.round(b.reduce((a, r) => a + (Number(r.p) || 0), 0)) : null;
}

/**
 * The last `n` days (oldest first) with their meal timing and (1.4.3 part A) the protein of
 * that day's breakfast (`protein`: grams or null when unknown).
 * @param {Record<string, any>} recs Day records by id. @param {string} today @param {number} [n]
 * @param {Record<string, any[]>} [food] Food rows by day.
 * @returns {{day: string, t: MealTiming | null, protein: number | null}[]}
 */
export function timingDays(recs, today, n = 7, food = {}) {
  const end = parseDay(today);
  return Array.from({ length: n }, (_, i) => {
    const day = dayKey(addDays(end, i - n + 1));
    return { day, t: mealTiming(recs[day], today), protein: breakfastProtein(food[day]) };
  });
}

/** Was a day's breakfast a protein one (eaten, ≥ PROTEIN_MIN_G)? @param {{t: MealTiming | null, protein?: number | null}} d */
export const isProteinDay = (d) =>
  !!d.t && (d.t.status === 'ontime' || d.t.status === 'late') && (d.protein ?? 0) >= PROTEIN_MIN_G;

/** Eaten, but with less protein than PROTEIN_MIN_G (known grams only). @param {{t: MealTiming | null, protein?: number | null}} d */
export const isLowProtein = (d) =>
  !!d.t && (d.t.status === 'ontime' || d.t.status === 'late') && d.protein != null && d.protein < PROTEIN_MIN_G;

/**
 * Summary below the chart: on time / answered-or-missed meals, protein breakfasts of those
 * days (1.4.3 part A), and the average delay of the late ones (minutes, rounded; null when
 * none was late). Pending and empty days are left out.
 * @param {{t: MealTiming | null, protein?: number | null}[]} days
 */
export function timingSummary(days) {
  const counted = days.filter((d) => d.t && d.t.status !== 'pending');
  const done = counted.map((d) => /** @type {MealTiming} */ (d.t));
  const late = done.filter((x) => x.status === 'late');
  return {
    onTime: done.filter((x) => x.status === 'ontime').length,
    total: done.length,
    late: late.length,
    missed: done.filter((x) => x.status === 'missed').length,
    protein: counted.filter(isProteinDay).length,
    avgDelay: late.length ? Math.round(late.reduce((a, x) => a + x.delayMin, 0) / late.length) : null,
  };
}

/** 1.4.4: „Кога яде?“ is offered right after the late meal is logged, not hours later. */
export const ASK_WITHIN = 10 * MIN;

/**
 * 1.4.4 „Кога яде?“: ask when the timed meal was just recorded late at the moment it was
 * logged (not with a time typed from the pill / banner), once per day. „Сега“ keeps it.
 * @param {any} rec Today's record. @param {number} now
 */
export function askWhenAte(rec, now) {
  const mt = rec?.mealTimes?.[TIMED_MEAL];
  if (!rec?.proteinAt || !mt || mt.asked || !(mt.planned > 0) || !(mt.actual > 0)) return false;
  if (now - rec.proteinAt > ASK_WITHIN || now < rec.proteinAt - MIN) return false;
  if (mt.actual < rec.proteinAt - MIN) return false; // a time was typed already
  return classify(mt.planned, mt.actual).status === 'late';
}

/**
 * 1.4.4: the day record with another actual time for the timed meal (pure). The quest, the
 * Хранене навреме chart and the XP all read `mealTimes.breakfast.actual`.
 * @param {any} rec @param {number} at @param {boolean} [asked]
 */
export const withActual = (rec, at, asked = true) => ({
  ...rec,
  mealTimes: { ...rec?.mealTimes, [TIMED_MEAL]: { ...rec?.mealTimes?.[TIMED_MEAL], actual: at, asked } },
});

/**
 * 1.4.4: the live preview under the picker – what that time would give (the protein quest's
 * grading: on time 15 XP, up to PROTEIN_LATE_MAX min late 8 XP, later 0).
 * @param {any} rec @param {number} at
 * @returns {{state: 'done'|'late'|'missed'|'open', delayMin: number, xp: number}}
 */
export const previewAt = (rec, at) => proteinQuest(withActual(rec, at), at);
