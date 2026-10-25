/**
 * Which reminders are due for one device right now. Pure (no I/O), so it is unit-tested
 * directly. Mirrors the app's planner (src/features/daily/logic.js) with server rules:
 *
 * - Every slot is computed in the device's own IANA time zone and converted to an
 *   instant, so DST changes follow the zone rules: a time that does not exist on a
 *   spring-forward day is shifted forward by the gap (like JS Date), and a repeated hour
 *   on a fall-back day fires once (the later occurrence) because of the per-day dedupe.
 * - A slot is due from its time until GRACE_MIN later (or its natural end, whichever is
 *   first), so a skipped cron minute never loses a reminder, and an old one is never
 *   sent hours late.
 * - Each kind is sent at most once per device-local day (`sent`), and within a group
 *   only the latest due slot is sent (8:15 replaces 7:30).
 * @module schedule
 */

export const MIN = 60_000;
export const HOUR = 60 * MIN;
/** Minutes after its time a reminder may still be sent. */
export const GRACE_MIN = 30;
/** Protein reminders, minutes after the morning acknowledgement. */
export const PROTEIN_STEPS = [10, 20, 30];

/**
 * @typedef {object} TimeToggle @property {string} time `HH:MM` @property {boolean} on
 * @typedef {object} Settings Reminder settings as registered by the app.
 * @property {boolean} morning @property {string} wake @property {string} loud
 * @property {boolean} protein @property {TimeToggle[]} water
 * @property {TimeToggle} checkinAm @property {TimeToggle} checkinPm @property {TimeToggle} bedtime
 * @property {{wake: boolean, bed: boolean}} silent
 * @typedef {object} DayFlags Minimal daily state (epoch ms or null).
 * @property {number|null} [ack_at] @property {number|null} [protein_done]
 * @property {number|null} [checkin_am] @property {number|null} [checkin_pm] @property {number|null} [goodnight]
 * @typedef {object} Slot
 * @property {string} day Device-local day key. @property {string} kind
 * @property {string} group @property {number} at @property {number} until
 * @property {string} route @property {boolean} silent @property {boolean} loud
 * @property {string[]} actions
 */

/** @type {Map<string, Intl.DateTimeFormat>} */
const fmts = new Map();
/** @param {string} tz */
const fmt = (tz) => {
  let f = fmts.get(tz);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    fmts.set(tz, f);
  }
  return f;
};

/** Is `tz` a time zone this runtime knows? @param {unknown} tz */
export function validZone(tz) {
  if (typeof tz !== 'string' || tz.length > 64 || !/^[A-Za-z0-9_+\-/]+$/.test(tz)) return false;
  try {
    fmt(tz);
    return true;
  } catch {
    return false;
  }
}

/**
 * Wall-clock time of an instant in a zone.
 * @param {string} tz @param {number} ts
 * @returns {{day: string, min: number, wall: number}} day key, minute of day, and the wall clock as a UTC timestamp
 */
export function localParts(tz, ts) {
  /** @type {Record<string, string>} */
  const p = {};
  for (const { type, value } of fmt(tz).formatToParts(new Date(ts))) p[type] = value;
  const h = Number(p.hour) % 24,
    m = Number(p.minute);
  const day = `${p.year}-${p.month}-${p.day}`;
  return { day, min: h * 60 + m, wall: Date.UTC(+p.year, +p.month - 1, +p.day, h, m, Number(p.second)) };
}

/** UTC offset of a zone at an instant, in ms. @param {string} tz @param {number} ts */
const offset = (tz, ts) => localParts(tz, ts).wall - Math.floor(ts / 1000) * 1000;

/**
 * Instant of a wall-clock time (`minutes` after midnight of `day`, may exceed 24 h).
 * Non-existent times (DST gap) are shifted forward by the gap; repeated ones take the later instant.
 * @param {string} tz @param {string} day @param {number} minutes
 */
export function toInstant(tz, day, minutes) {
  const [y, mo, d] = day.split('-').map(Number);
  const wall = Date.UTC(y, mo - 1, d) + minutes * MIN;
  const guess = wall - offset(tz, wall);
  const ts = wall - offset(tz, guess);
  // In a gap the two offsets differ; take the later instant so the slot is not early.
  return Math.max(ts, guess);
}

/** Day key `n` days after `day`. @param {string} day @param {number} n */
export function shiftDay(day, n) {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `HH:MM` → minutes. @param {string} t */
export const hm = (t) => {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
};

/**
 * All reminder slots of one device-local day (before dedupe and skip rules).
 * @param {string} tz @param {string} day @param {Settings} s @param {DayFlags} flags
 * @returns {(Slot & {skip?: keyof DayFlags, needs?: keyof DayFlags})[]}
 */
export function planDay(tz, day, s, flags = {}) {
  /** @type {(Slot & {skip?: keyof DayFlags, needs?: keyof DayFlags})[]} */
  const out = [];
  const T = (/** @type {number} */ m) => toInstant(tz, day, m);
  const add = (/** @type {any} */ o) =>
    out.push({ day, silent: false, loud: false, actions: [], ...o, until: Math.min(o.until, o.at + GRACE_MIN * MIN) });
  if (s.morning) {
    const wake = T(hm(s.wake)),
      loud = Math.max(T(hm(s.loud)), wake + MIN);
    add({
      kind: 'wake',
      group: 'morning',
      at: wake,
      until: loud,
      route: 'morning',
      silent: s.silent.wake,
      skip: 'ack_at',
    });
    add({
      kind: 'loud',
      group: 'morning',
      at: loud,
      until: loud + 4 * HOUR,
      route: 'morning',
      loud: true,
      skip: 'ack_at',
    });
  }
  if (s.protein && flags.ack_at)
    PROTEIN_STEPS.forEach((m, i) => {
      const at = flags.ack_at + m * MIN,
        next = PROTEIN_STEPS[i + 1];
      add({
        kind: `p${m}`,
        group: 'protein',
        at,
        until: next ? flags.ack_at + next * MIN : at + HOUR,
        route: 'morning',
        actions: ['protein-yes'],
        skip: 'protein_done',
      });
    });
  const water = s.water.map((w) => (w.on ? T(hm(w.time)) : null));
  s.water.forEach((w, i) => {
    if (!w.on) return;
    const at = water[i],
      next = water.filter((x) => x != null && x > at).sort((a, b) => a - b)[0];
    add({
      kind: `water${i}`,
      group: 'water',
      at,
      until: next ?? at + 3 * HOUR,
      route: 'food?water',
      actions: ['water-add'],
    });
  });
  if (s.checkinAm.on) {
    const at = T(hm(s.checkinAm.time));
    add({
      kind: 'checkinAm',
      group: 'checkinAm',
      at,
      until: at + 5 * HOUR,
      route: 'checkin/morning',
      skip: 'checkin_am',
    });
  }
  if (s.checkinPm.on) {
    const at = T(hm(s.checkinPm.time));
    add({
      kind: 'checkinPm',
      group: 'checkinPm',
      at,
      until: at + 4 * HOUR,
      route: 'checkin/evening',
      skip: 'checkin_pm',
    });
  }
  if (s.bedtime.on) {
    // Before 04:00 a bedtime belongs to the previous evening (like the app's eveningKey).
    const m = hm(s.bedtime.time),
      at = T(m < 240 ? m + 1440 : m);
    add({
      kind: 'bed',
      group: 'bed',
      at,
      until: at + 4 * HOUR,
      route: 'goodnight',
      silent: s.silent.bed,
      skip: 'goodnight',
    });
  }
  return out;
}

/**
 * Reminders to send now for one device: today's and yesterday's (late evening) slots
 * that are due, not skipped by a flag, and not sent yet. One per group (the latest).
 * @param {object} o
 * @param {string} o.tz @param {Settings} o.settings @param {number} o.now
 * @param {Record<string, DayFlags>} o.flags Flags by day key.
 * @param {Record<string, Set<string>|string[]>} o.sent Kinds already sent, by day key.
 * @returns {Slot[]}
 */
export function dueNow({ tz, settings, now, flags, sent }) {
  const today = localParts(tz, now).day;
  /** @type {Map<string, Slot>} */
  const latest = new Map();
  for (const day of [shiftDay(today, -1), today]) {
    const f = flags[day] ?? {},
      done = new Set(sent[day] ?? []);
    for (const s of planDay(tz, day, settings, f)) {
      if (!(s.at <= now && now < s.until) || done.has(s.kind) || (s.skip && f[s.skip])) continue;
      const k = `${day}:${s.group}`,
        cur = latest.get(k);
      if (!cur || cur.at < s.at) {
        const { skip: _s, needs: _n, ...slot } = s;
        latest.set(k, slot);
      }
    }
  }
  return [...latest.values()];
}
