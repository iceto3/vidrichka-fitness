/**
 * 1.4.2 "Снимай етикета": what the voice server read from a nutrition label → values for
 * the new-food form (pure, unit tested). Nothing is saved here: the form is pre-filled and
 * the user confirms with "Запази" (the form's own checks still run). A reading that fails
 * the app's one plausibility check ({@link implausible}) pre-fills nothing but the name.
 * @module features/food/label
 */
import { implausible } from './logic.js';

/** Form fields a label can fill, in form order. */
export const LABEL_FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'f', 'fib', 'salt']);

/** Number → form string: up to 2 decimals (kcal whole), decimal comma in Bulgarian. @param {number} n @param {string} k @param {string} lang */
export const formNum = (n, k, lang) => {
  const r = k === 'kcal' ? Math.round(n) : Math.round(n * 100) / 100;
  return lang === 'en' ? String(r) : String(r).replace('.', ',');
};

/**
 * @param {any} label The server's `label` ({name, kcal, p, f, c, fib, salt} per 100 g, or null).
 * @param {string} [lang]
 * @returns {{err: null|'unreadable'|'implausible', v: Record<string, string>, filled: string[]}}
 *   `v` = form strings to set (only known values), `filled` = which fields they are.
 */
export function labelToForm(label, lang = 'bg') {
  if (!label || typeof label !== 'object') return { err: 'unreadable', v: {}, filled: [] };
  /** @type {Record<string, number|null>} */
  const n = {};
  for (const k of LABEL_FIELDS) {
    const x = label[k];
    n[k] = typeof x === 'number' && Number.isFinite(x) ? x : null;
  }
  const name = typeof label.name === 'string' ? label.name.trim().slice(0, 80) : '';
  /** @type {Record<string, string>} */
  const v = name ? { name } : {};
  const filledName = name ? ['name'] : [];
  if (n.kcal == null && n.p == null && n.c == null && n.f == null) return { err: 'unreadable', v, filled: filledName };
  const missing = /** @type {string[]} */ (['kcal', 'p', 'c', 'f'].filter((k) => n[k] == null));
  const check = {
    kcal: n.kcal ?? 0,
    p: n.p ?? 0,
    c: n.c ?? 0,
    f: n.f ?? 0,
    ...(n.fib != null ? { fib: n.fib } : {}),
    ...(n.salt != null ? { salt: n.salt } : {}),
    missing,
  };
  if (implausible(check)) return { err: 'implausible', v, filled: filledName };
  const filled = [...filledName];
  for (const k of LABEL_FIELDS)
    if (n[k] != null) {
      v[k] = formNum(/** @type {number} */ (n[k]), k, lang);
      filled.push(k);
    }
  return { err: null, v, filled };
}

/**
 * 1.4.2 tester round: put a new label reading into the form without leaving stale values.
 * Every value the previous scan filled and the user has not changed since is cleared first
 * (values typed by hand stay); then a successful reading fills its fields. So after a failed
 * or blocked reading (implausible, unreadable, offline, limit, …) nothing from an older photo
 * can be saved by mistake.
 * @param {Record<string, string>} form The form values (changed in place and returned).
 * @param {Record<string, string>} prev What the previous scan put in, by field.
 * @param {{err: string|null, v: Record<string, string>}} res A {@link labelToForm} result
 *   (`err` set and `v` empty for a failed request).
 * @returns {{form: Record<string, string>, scan: Record<string, string>, filled: string[], cleared: string[]}}
 */
export function applyScan(form, prev, res) {
  const cleared = [];
  for (const [k, val] of Object.entries(prev))
    if (form[k] === val) {
      form[k] = '';
      cleared.push(k);
    }
  /** @type {Record<string, string>} */
  const scan = {};
  for (const [k, val] of Object.entries(res.v ?? {})) {
    form[k] = val;
    scan[k] = val;
  }
  return { form, scan, filled: Object.keys(scan), cleared: cleared.filter((k) => !(k in scan)) };
}
