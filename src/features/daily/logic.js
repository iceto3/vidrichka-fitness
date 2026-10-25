/**
 * Daily rhythm — pure logic (no DOM, no storage), shared by the app and unit tests:
 * which reminders fire when, the protein countdown, sleep hours and the bedtime estimate.
 *
 * One record per day (`days` store, id = day key) holds:
 *   wake, ack (morning notification tapped), proteinStart, proteinAt, proteinSkip, mood, sleepQ, energy
 *   (that day), and bed, bedEst, lastUse (that day's EVENING, until 04:00 next morning),
 *   plus `shown: {kind: ts}` so every reminder is shown at most once.
 * @module features/daily/logic
 */
import { addDays, dayKey, parseDay } from '../../core/dates.js';

export const MIN = 60_000;
export const HOUR = 60 * MIN;
/** Until 04:00 a moment still belongs to the previous evening (late bedtimes). */
export const NIGHT_END_H = 4;
/** The goodnight (moon) button shows from 19:00. */
export const EVENING_H = 19;
/** App use from 20:00 on can stand in for a forgotten bedtime. */
export const ESTIMATE_FROM_H = 20;
/** Opening the morning page before 16:00 records the wake-up. */
export const MORNING_END_H = 16;
/** Protein countdown (min) and the extra minutes a "yes" still counts as on time. */
export const PROTEIN_WINDOW = 30;
export const PROTEIN_GRACE = 15;
/** Protein reminders, minutes after waking. */
export const PROTEIN_STEPS = [10, 20, 30];

/**
 * Timestamp of a local time on a day.
 * @param {string} day Day key. @param {string} time `HH:MM`. @param {number} [plusDays]
 */
export function at(day, time, plusDays = 0) {
  const [h, m] = time.split(':').map(Number),
    d = parseDay(day);
  d.setDate(d.getDate() + plusDays);
  d.setHours(h || 0, m || 0, 0, 0);
  return d.getTime();
}

/** Evening (day key) a moment belongs to: before 04:00 it is still the previous evening. @param {number} ts */
export function eveningKey(ts) {
  const d = new Date(ts);
  if (d.getHours() < NIGHT_END_H) d.setDate(d.getDate() - 1);
  return dayKey(d);
}

/** Is it evening (19:00–04:00)? @param {number} ts */
export const isEvening = (ts) => {
  const h = new Date(ts).getHours();
  return h >= EVENING_H || h < NIGHT_END_H;
};

/** Morning window in which opening #morning records the wake-up (04:00–16:00). @param {number} ts */
export const isMorning = (ts) => {
  const h = new Date(ts).getHours();
  return h >= NIGHT_END_H && h < MORNING_END_H;
};

/**
 * Hours slept = next wake-up − bedtime (one decimal), or null when either is missing or
 * the result is implausible (≤ 0 h or more than 16 h).
 * @param {number|null|undefined} bed @param {number|null|undefined} wake
 */
export function sleepHours(bed, wake) {
  if (!bed || !wake) return null;
  const h = (wake - bed) / HOUR;
  return h > 0 && h <= 16 ? Math.round(h * 10) / 10 : null;
}

/**
 * Bedtime estimate for a forgotten goodnight: her last app use that evening, if it was
 * between 20:00 and 04:00 the next morning; otherwise null (unknown).
 * @param {number|null|undefined} lastUse @param {string} evening Day key of the evening.
 */
export function estimateBedtime(lastUse, evening) {
  if (!lastUse) return null;
  return lastUse >= at(evening, `${ESTIMATE_FROM_H}:00`) && lastUse < at(evening, '04:00', 1) ? lastUse : null;
}

/**
 * Patch that fills an evening record's missing bedtime with the estimate (or null).
 * @param {any} rec Evening record.
 */
export function fillBedtime(rec) {
  if (!rec || rec.bed) return null;
  const bed = estimateBedtime(rec.lastUse, rec.id);
  return bed ? { bed, bedEst: true } : null;
}

/** Was the protein "yes" within the window (+ grace)? @param {any} rec */
export const proteinOnTime = (rec) =>
  !!(rec?.proteinStart && rec.proteinAt && rec.proteinAt - rec.proteinStart <= (PROTEIN_WINDOW + PROTEIN_GRACE) * MIN);

/**
 * Protein countdown state.
 * @param {any} rec Today's record. @param {number} now
 * @returns {{state: 'idle'|'running'|'overdue'|'done'|'skipped', left: number, onTime?: boolean}} left in ms
 */
export function proteinState(rec, now) {
  if (!rec?.proteinStart) return { state: 'idle', left: 0 };
  if (rec.proteinAt) return { state: 'done', left: 0, onTime: proteinOnTime(rec) };
  if (rec.proteinSkip) return { state: 'skipped', left: 0 };
  // Clamped: a clock that moved back (time sync, time-zone change) must not show 30:01.
  const left = Math.min(PROTEIN_WINDOW * MIN, rec.proteinStart + PROTEIN_WINDOW * MIN - now);
  return left > 0 ? { state: 'running', left } : { state: 'overdue', left: 0 };
}

/** Where "Ate it" / "Yes, I ate" leads: the Food logger on today's breakfast, with a hint (sw.js uses the same route). */
export const BREAKFAST_LOGGER = 'food/add/breakfast?protein';

/** How long the Home bar keeps a small "done"/"skipped" state after she answers. */
export const PROTEIN_ANSWERED_SHOW = 10 * MIN;

/** Remaining time as mm:ss (seconds rounded up, so it reads 30:00 → 00:01 → 00:00). @param {number} ms */
export const mmss = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

/**
 * The Home protein bar: running (ticking), overdue (dark red, 00:00 until she answers —
 * survives reloads because it is computed from the stored start), then a short
 * done/skipped state; null when there is nothing to show.
 * @param {any} rec Today's record. @param {number} now
 * @returns {{mode: 'running'|'overdue'|'done'|'skipped', time: string} | null}
 */
export function proteinBar(rec, now) {
  const ps = proteinState(rec, now);
  if (ps.state === 'idle') return null;
  if (ps.state === 'done' || ps.state === 'skipped') {
    const at = ps.state === 'done' ? rec.proteinAt : rec.proteinSkip;
    return now - at < PROTEIN_ANSWERED_SHOW && now >= at ? { mode: ps.state, time: '' } : null;
  }
  return { mode: ps.state, time: mmss(ps.left) };
}

/**
 * Last `n` nights, newest first. A night is keyed by the morning she woke up: bedtime
 * comes from the previous evening's record, mood/sleep rating/energy from that day.
 * @param {any[]} rows `days` records. @param {number} n @param {string} today Day key.
 */
export function nights(rows, n, today) {
  const by = new Map(rows.map((r) => [r.id, r]));
  return Array.from({ length: n }, (_, i) => {
    const day = dayKey(addDays(parseDay(today), -i)),
      eve = by.get(dayKey(addDays(parseDay(day), -1))) ?? {},
      r = by.get(day) ?? {};
    return {
      day,
      bed: eve.bed ?? null,
      bedEst: !!eve.bedEst,
      wake: r.wake ?? null,
      hours: sleepHours(eve.bed, r.wake),
      sleepQ: r.sleepQ ?? null,
      mood: r.mood ?? null,
      energy: r.energy ?? null,
    };
  });
}

/**
 * Sleep streak: evenings in a row she tucked Vidrichka in (estimated bedtimes don't count).
 * Tonight counts once done; until then the streak runs up to last night.
 * @param {any[]} rows @param {number} now
 */
export function sleepStreak(rows, now) {
  const by = new Map(rows.map((r) => [r.id, r]));
  const ok = (/** @type {string} */ k) => !!by.get(k)?.bed && !by.get(k)?.bedEst;
  const prev = (/** @type {string} */ k) => dayKey(addDays(parseDay(k), -1));
  let k = eveningKey(now),
    n = 0;
  if (!ok(k)) k = prev(k);
  while (ok(k)) (n++, (k = prev(k)));
  return n;
}

/**
 * @typedef {object} Slot A reminder occurrence.
 * @property {string} id      `<day>:<kind>`
 * @property {string} day     Day key of the record it belongs to.
 * @property {string} kind    wake | loud | p10 | p20 | p30 | water0…3 | checkinAm | checkinPm | bed
 * @property {string} group   morning | protein | water | checkinAm | checkinPm | bed (one shown per group)
 * @property {number} at      When it becomes due.
 * @property {number} until   After this it is stale and never shown.
 * @property {string} route   Where a tap leads (`morning`, `food?water`, …).
 * @property {boolean} [silent] No sound/vibration (Android; iOS ignores it).
 * @property {boolean} [loud]   Insistent (vibration pattern, stays until handled).
 * @property {string[]} [actions] Android notification buttons: protein-yes | water-add.
 * @property {string[]} [skipIf] Not shown if any of these record fields is set.
 * @property {string[]} [needs]  Shown only if all of these record fields are set.
 */

/**
 * @typedef {object} DailyConfig Daily-rhythm settings (see core/settings DAILY).
 * @property {boolean} morning @property {string} wake @property {string} loud @property {boolean} protein
 * @property {{time: string, on: boolean}[]} water
 * @property {{time: string, on: boolean}} checkinAm @property {{time: string, on: boolean}} checkinPm
 * @property {{time: string, on: boolean}} bedtime
 */

/**
 * Reminders of one day.
 * @param {string} day @param {DailyConfig} cfg @param {any} [rec] That day's record (protein needs its wake time).
 * @returns {Slot[]}
 */
export function planDay(day, cfg, rec = {}) {
  /** @type {Slot[]} */
  const out = [];
  const add = (/** @type {Omit<Slot, 'id'|'day'>} */ s) => out.push({ id: `${day}:${s.kind}`, day, ...s });
  if (cfg.morning) {
    const wake = at(day, cfg.wake),
      loud = Math.max(at(day, cfg.loud), wake + MIN);
    add({
      kind: 'wake',
      group: 'morning',
      at: wake,
      until: loud,
      route: 'morning',
      silent: true,
      skipIf: ['wake', 'ack'],
    });
    add({
      kind: 'loud',
      group: 'morning',
      at: loud,
      until: loud + 4 * HOUR,
      route: 'morning',
      loud: true,
      skipIf: ['wake', 'ack'],
    });
  }
  if (cfg.protein && rec?.proteinStart)
    PROTEIN_STEPS.forEach((m) =>
      add({
        kind: `p${m}`,
        group: 'protein',
        at: rec.proteinStart + m * MIN,
        until: rec.proteinStart + 2 * HOUR,
        route: 'morning',
        actions: ['protein-yes'],
        needs: ['proteinStart'],
        skipIf: ['proteinAt', 'proteinSkip'],
      }),
    );
  const water = cfg.water.filter((w) => w.on).map((w) => at(day, w.time));
  cfg.water.forEach((w, i) => {
    if (!w.on) return;
    const t = at(day, w.time),
      next = water.filter((x) => x > t).sort((a, b) => a - b)[0];
    add({
      kind: `water${i}`,
      group: 'water',
      at: t,
      until: next ?? t + 3 * HOUR,
      route: 'food?water',
      actions: ['water-add'],
    });
  });
  if (cfg.checkinAm.on) {
    const t = at(day, cfg.checkinAm.time);
    add({
      kind: 'checkinAm',
      group: 'checkinAm',
      at: t,
      until: t + 5 * HOUR,
      route: 'checkin/morning',
      skipIf: ['mood'],
    });
  }
  if (cfg.checkinPm.on) {
    const t = at(day, cfg.checkinPm.time);
    add({
      kind: 'checkinPm',
      group: 'checkinPm',
      at: t,
      until: Math.max(t + 4 * HOUR, at(day, '23:59')),
      route: 'checkin/evening',
      skipIf: ['energy'],
    });
  }
  if (cfg.bedtime.on)
    add({
      kind: 'bed',
      group: 'bed',
      at: at(day, cfg.bedtime.time),
      until: at(day, '04:00', 1),
      route: 'goodnight',
      silent: true,
      skipIf: ['bed'],
    });
  return out;
}

/**
 * Reminders from yesterday (late slots still open) through `days` days ahead.
 * @param {number} now @param {number} days @param {DailyConfig} cfg @param {Record<string, any>} recs
 */
export function planRange(now, days, cfg, recs) {
  const today = parseDay(dayKey(now));
  return Array.from({ length: days + 1 }, (_, i) => dayKey(addDays(today, i - 1)))
    .flatMap((d) => planDay(d, cfg, recs[d]))
    .filter((s) => s.until > now);
}

// The service worker (sw.js) carries a copy of dueSlots between `// <due>` markers;
// a unit test checks the two stay identical in behaviour.
/**
 * Reminders due now. Within a day's group only the latest due one is shown (opening the
 * phone at 08:20 shows the 8:15 alarm, not 7:30 as well); all due ones are marked as seen.
 * @param {Slot[]} slots @param {number} now @param {Record<string, any>} recs Records by day.
 * @returns {{show: Slot[], seen: Slot[]}}
 */
export function dueSlots(slots, now, recs) {
  const seen = slots.filter((s) => {
    const r = recs[s.day] || {};
    return (
      s.at <= now &&
      now < s.until &&
      !(r.shown && r.shown[s.kind]) &&
      !(s.skipIf || []).some((f) => r[f]) &&
      (s.needs || []).every((f) => r[f])
    );
  });
  /** @type {Map<string, Slot>} */
  const latest = new Map();
  seen.forEach((s) => {
    const k = `${s.day}:${s.group}`,
      cur = latest.get(k);
    if (!cur || cur.at < s.at) latest.set(k, s);
  });
  return { show: [...latest.values()], seen };
}

/**
 * How many daily-rhythm reminders are switched on (for the Profile › Reminders summary).
 * @param {{morning?: boolean, protein?: boolean, water?: {on: boolean}[], checkinAm?: {on: boolean}, checkinPm?: {on: boolean}, bedtime?: {on: boolean}}} d
 */
export const dailyOnCount = (d) =>
  [d.morning, d.protein, d.checkinAm?.on, d.checkinPm?.on, d.bedtime?.on].filter(Boolean).length +
  (d.water ?? []).filter((w) => w.on).length;

/**
 * In-app morning prompt only in the morning (04:00–12:00) and not once a workout was done
 * that day (1.1 showed "Still sleeping?" over a finished workout's summary).
 * @param {number} hour Local hour 0–23. @param {boolean} workedOutToday
 */
export const morningPromptOk = (hour, workedOutToday) => hour >= 4 && hour < 12 && !workedOutToday;
