/**
 * 1.6.1 „Хранителни добавки“ (pure, unit tested): the user's supplement list, the day field
 * each one is ticked in, doses, streaks, protein from protein powder and reminder slots.
 *
 * Storage (no data moves): the list lives in kv `supplements`; a supplement taken on a day
 * is a number on that day's record – creatine keeps its 1.4.2 field `creatineG` (so its
 * history and the creatine totals stay as they were) and its last dose stays in kv
 * `creatineDose`; every other supplement uses `sp_<id>`. Protein powder also writes the
 * day's `suppP` (g of protein) so the protein totals and the protein goal count it.
 * @module features/food/supps
 */
import { CUSTOM_UNIT, SUPP_KINDS, SUPP_UNITS } from '../../data/supplements.js';
import { addDays, dayKey, parseDay } from '../../core/dates.js';

/**
 * @typedef {object} Supp A supplement on the user's list.
 * @property {string} id      kind for the ready ones (`creatine`, `protein`, …), `c_<uid>` for own ones
 * @property {string} kind    a SUPP_KINDS key or 'custom'
 * @property {string} [name]  own supplements only
 * @property {'g'|'mg'|'IU'|'caps'} unit
 * @property {number} dose    the last dose (offered next time)
 * @property {string} [remind] reminder time „HH:MM“ ('' / missing = off)
 * @property {number} [proteinPct] protein powder: g protein per 100 g
 */

/** Settings of a supplement's kind (own ones by their unit). @param {Supp} s */
export const kindOf = (s) =>
  SUPP_KINDS[s.kind] ?? {
    emoji: '💊',
    ...(CUSTOM_UNIT[/** @type {keyof typeof CUSTOM_UNIT} */ (s.unit)] ?? CUSTOM_UNIT.caps),
  };

/** The day-record field a supplement is ticked in. @param {Pick<Supp, 'id'|'kind'>} s */
export const fieldOf = (s) => (s.kind === 'creatine' ? 'creatineG' : `sp_${s.id}`);

/** A ready supplement with its defaults. @param {string} kind @returns {Supp} */
export const readySupp = (kind) => {
  const k = SUPP_KINDS[kind];
  return { id: kind, kind, unit: k.unit, dose: k.dose, ...(k.proteinPct ? { proteinPct: k.proteinPct } : {}) };
};

/** Round a dose to its step's precision and clamp it to (0, max]. @param {Supp} s @param {number} v */
export function clampDose(s, v) {
  const k = kindOf(s),
    n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return 0;
  const r = k.step < 1 ? Math.round(n * 10) / 10 : Math.round(n);
  return Math.min(k.max, Math.max(k.step < 1 ? 0.1 : 1, r));
}

/** Is a reminder time valid („HH:MM“, 24 h)? @param {any} v */
export const validHM = (v) => typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v);

/**
 * The stored list, cleaned and migrated: creatine is always on the list (it was a card in
 * Храна since 1.4.2) with its remembered dose; unknown kinds and broken rows are dropped.
 * @param {any} stored kv `supplements` (undefined before 1.6.1) @param {any} creatineDose kv `creatineDose`
 * @returns {Supp[]}
 */
export function normalizeList(stored, creatineDose) {
  const list = Array.isArray(stored) ? stored : [];
  /** @type {Supp[]} */
  const out = [];
  const seen = new Set();
  for (const r of list) {
    if (!r || typeof r.id !== 'string' || seen.has(r.id)) continue;
    const ready = SUPP_KINDS[r.kind];
    if (!ready && !(r.kind === 'custom' && String(r.name ?? '').trim())) continue;
    const unit = ready ? ready.unit : SUPP_UNITS.includes(r.unit) ? r.unit : 'caps';
    /** @type {Supp} */
    const s = { id: r.id, kind: r.kind, unit, dose: 0 };
    if (!ready) s.name = String(r.name).trim().slice(0, 40);
    s.dose = clampDose(s, r.dose) || kindOf(s).dose;
    if (validHM(r.remind)) s.remind = r.remind;
    if (r.kind === 'protein') s.proteinPct = Math.min(100, Math.max(1, Math.round(Number(r.proteinPct) || 75)));
    seen.add(s.id);
    out.push(s);
  }
  if (!seen.has('creatine')) out.unshift(readySupp('creatine'));
  const cr = /** @type {Supp} */ (out.find((s) => s.id === 'creatine'));
  // creatine's last dose has been kept in kv `creatineDose` since 1.4.2 – it stays the source
  const kept = clampDose(cr, creatineDose);
  if (kept) cr.dose = kept;
  return out;
}

/** Amount taken on a day (0 = not taken). @param {Supp} s @param {any} rec day record */
export const takenOf = (s, rec) => Math.max(0, Number(rec?.[fieldOf(s)]) || 0);

/** g of protein in a dose of protein powder (0 for anything else). @param {Supp} s @param {number} dose */
export const proteinOf = (s, dose) =>
  s.kind === 'protein' && s.unit === 'g' ? Math.round(((Number(dose) || 0) * (s.proteinPct ?? 75)) / 10) / 10 : 0;

/**
 * The day's protein from supplements (g) after a change – what goes into `suppP`.
 * @param {Supp[]} list @param {any} rec the day's record with the change applied
 */
export const dayProtein = (list, rec) =>
  Math.round(list.reduce((a, s) => a + proteinOf(s, takenOf(s, rec)), 0) * 10) / 10;

/**
 * Consecutive days taken, ending today – or yesterday while today is still open (like the
 * other habit streaks). @param {Supp} s @param {Map<string, any>|Record<string, any>} recs records by day
 * @param {string} today
 */
export function suppStreak(s, recs, today) {
  const get = (/** @type {string} */ k) => (recs instanceof Map ? recs.get(k) : recs[k]);
  const prev = (/** @type {string} */ k) => dayKey(addDays(parseDay(k), -1));
  let k = today,
    n = 0;
  if (!takenOf(s, get(k))) k = prev(k);
  while (takenOf(s, get(k)) > 0 && n < 3660) (n++, (k = prev(k)));
  return n;
}

/**
 * Reminder settings for the daily planner (features/daily/logic `planDay`): one per
 * supplement with a time. @param {Supp[]} list @param {(s: Supp) => string} nameOf
 * @returns {{id: string, time: string, field: string, name: string}[]}
 */
export const reminders = (list, nameOf) =>
  list
    .filter((s) => validHM(s.remind))
    .map((s) => ({ id: s.id, time: /** @type {string} */ (s.remind), field: fieldOf(s), name: nameOf(s) }));
