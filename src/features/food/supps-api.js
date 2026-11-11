/**
 * 1.6.1 „Хранителни добавки“ – the user's list (kv `supplements`) and ticking a supplement
 * on a day. Pure rules are in ./supps.js; day writes go through features/day/api.
 * @module features/food/supps-api
 */
import { all, kv, setKv, uid } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { t } from '../../core/i18n.js';
import { setDaySupp } from '../day/api.js';
import { SUPP_KINDS, SUPP_UNITS } from '../../data/supplements.js';
import {
  clampDose,
  dayProtein,
  fieldOf,
  normalizeList,
  readySupp,
  reminders,
  suppStreak,
  takenOf,
  validHM,
} from './supps.js';

/** @typedef {import('./supps.js').Supp} Supp */

/** The user's supplements (creatine always first-class, migrated from 1.4.2). @returns {Supp[]} */
export const supplements = () => normalizeList(kv('supplements', undefined), kv('creatineDose', undefined));

/** Save the list (and creatine's dose to its 1.4.2 key) and re-plan reminders. @param {Supp[]} list */
function save(list) {
  setKv('supplements', list);
  const cr = list.find((s) => s.id === 'creatine');
  if (cr) setKv('creatineDose', cr.dose);
  emit('daily:changed'); // reminders are planned by the daily-rhythm scheduler
}

/** Display name. @param {Supp} s */
export const suppName = (s) => (s.kind === 'custom' ? String(s.name) : t(`supp.${s.kind}`));

/** Ready kinds not on the list yet (for „Добави“). */
export const readyToAdd = () => {
  const have = new Set(supplements().map((s) => s.id));
  return Object.keys(SUPP_KINDS).filter((k) => !have.has(k));
};

/** Add a ready supplement (one tap). @param {string} kind @returns {Supp|null} */
export function addReady(kind) {
  if (!SUPP_KINDS[kind]) return null;
  const list = supplements();
  if (list.some((s) => s.id === kind)) return null;
  const s = readySupp(kind);
  save([...list, s]);
  return s;
}

/**
 * Add an own supplement. @param {string} name @param {string} unit @param {number} dose
 * @returns {Supp|null} null when the name is empty or the unit unknown
 */
export function addCustom(name, unit, dose) {
  const n = String(name ?? '')
    .trim()
    .slice(0, 40);
  if (!n || !SUPP_UNITS.includes(/** @type {any} */ (unit))) return null;
  /** @type {Supp} */
  const s = { id: uid('c'), kind: 'custom', name: n, unit: /** @type {any} */ (unit), dose: 0 };
  s.dose = clampDose(s, dose) || 1;
  save([...supplements(), s]);
  return s;
}

/** Change a supplement's settings (dose, reminder, protein %, own name/unit). @param {string} id @param {Partial<Supp>} patch */
export function updateSupp(id, patch) {
  const list = supplements().map((s) => {
    if (s.id !== id) return s;
    const n = { ...s, ...patch, id: s.id, kind: s.kind };
    if (!validHM(n.remind)) delete n.remind;
    n.dose = clampDose(n, n.dose) || s.dose;
    return n;
  });
  save(list);
  return list.find((s) => s.id === id) ?? null;
}

/**
 * Take a supplement off the list (its ticked days stay on the day records, so adding it
 * back brings its history and streak back). Returns the removed entry for „Отмени“.
 * Creatine stays on the list (it was always there). @param {string} id
 */
export function removeSupp(id) {
  if (id === 'creatine') return null;
  const list = supplements(),
    s = list.find((x) => x.id === id);
  if (!s) return null;
  save(list.filter((x) => x.id !== id));
  return s;
}

/** Put a removed supplement back where it was. @param {Supp} s @param {number} [at] */
export function restoreSupp(s, at) {
  const list = supplements().filter((x) => x.id !== s.id);
  list.splice(at ?? list.length, 0, s);
  save(list);
}

/** Day record by key. @param {string} date */
const rec = (date) => all('days').find((r) => r.id === date);

/** Amount taken on a day (0 = not). @param {Supp} s @param {string} date */
export const taken = (s, date) => takenOf(s, rec(date));

/**
 * Tick (dose) or untick (null) a supplement on a day. A dose becomes the remembered one.
 * @param {Supp} s @param {string} date @param {number|null} dose
 */
export function setTaken(s, date, dose) {
  const list = supplements();
  const v = dose == null ? 0 : clampDose(s, dose);
  setDaySupp(date, fieldOf(s), v || null, (r) => dayProtein(list, r));
  if (v && v !== s.dose) updateSupp(s.id, { dose: v });
  return v;
}

/** Days in a row taken (today or up to yesterday). @param {Supp} s @param {string} today */
export const streak = (s, today) => suppStreak(s, new Map(all('days').map((r) => [r.id, r])), today);

/** Reminder settings for the daily planner. */
export const suppReminders = () => reminders(supplements(), suppName);
