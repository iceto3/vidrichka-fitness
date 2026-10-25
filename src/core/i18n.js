/**
 * Internationalisation: `t(key, vars)` lookups with `{var}` interpolation, simple
 * plurals (`{ one, other }` values selected by `vars.n`) and grammatical gender
 * (`{ f, m }` values selected by the user's gender, see `setGender`; a variant may itself
 * be a plural object). English is the fallback and stays gender-neutral.
 * Multilingual data values (`L()`) can use the same `{ f, m }` form per language.
 * Languages are registered in `src/data/i18n/index.js` and loaded lazily.
 * @module core/i18n
 */
import { LANGUAGES } from '../data/i18n/index.js';
import en from '../data/i18n/en.js';

/** @type {Record<string, any>} */
let dict = en;
let lang = 'en';
/** @type {'f'|'m'} */
let gender = 'f';
const missing = new Set();

/** Grammatical gender used for gendered strings ('f' unless set to 'm'). */
export const getGender = () => gender;

/**
 * Set the grammatical gender (from settings; anything but 'm' means 'f').
 * @param {string} [g]
 */
export const setGender = (g) => void (gender = g === 'm' ? 'm' : 'f');

/** Is this value a `{ f, m }` gender variant object? @param {any} v */
export const isGendered = (v) => !!v && typeof v === 'object' && ('f' in v || 'm' in v);

/**
 * Resolve a `{ f, m }` value for a gender (other values pass through).
 * @param {any} v @param {'f'|'m'} [g]
 */
export const byGender = (v, g = gender) => (isGendered(v) ? (v[g] ?? v.f) : v);

/** Active language code. */
export const getLang = () => lang;

/** BCP-47 locale of the active language (for Intl). */
export const locale = () => LANGUAGES[lang]?.locale ?? 'en-GB';

/**
 * Pick a supported language from a preference list (e.g. navigator.languages).
 * @param {readonly string[]} prefs
 */
export const detectLang = (prefs) => prefs.map((p) => p.slice(0, 2).toLowerCase()).find((p) => p in LANGUAGES) ?? 'en';

/**
 * Switch language (loads the dictionary on demand).
 * @param {string} code
 */
export async function setLang(code) {
  const entry = LANGUAGES[code] ?? LANGUAGES.en;
  dict = await entry.load();
  lang = code in LANGUAGES ? code : 'en';
  if (typeof document !== 'undefined') document.documentElement.lang = lang;
}

/**
 * Translate a key.
 * @param {string} key
 * @param {Record<string, string|number>} [vars]
 * @returns {string}
 */
export function t(key, vars = {}) {
  let v = dict[key] ?? en[key];
  if (v === undefined) {
    if (!missing.has(key)) (console.warn(`[i18n] missing key: ${key}`), missing.add(key));
    return key;
  }
  v = byGender(v);
  if (typeof v === 'object') v = pluralFor(Number(vars.n)) === 'one' ? v.one : v.other;
  return String(v).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** @param {number} n */
const pluralFor = (n) => (new Intl.PluralRules(locale()).select(n) === 'one' ? 'one' : 'other');

/**
 * Localized "multilingual value": `{en, bg}` objects or plain strings.
 * @param {string|Record<string, any>|undefined} v
 * @returns {string}
 */
export const L = (v) =>
  /** @type {string} */ (
    byGender(v && typeof v === 'object' && !isGendered(v) ? (v[lang] ?? v.en ?? Object.values(v)[0]) : (v ?? ''))
  );

/**
 * Format a date with Intl options in the active locale.
 * @param {Date|number|string} d
 * @param {Intl.DateTimeFormatOptions} opts
 */
export const fmtDate = (d, opts) => new Intl.DateTimeFormat(locale(), opts).format(new Date(d));

/**
 * Format a number.
 * @param {number} n
 * @param {number} [digits] Max fraction digits.
 */
export const fmtNum = (n, digits = 0) =>
  new Intl.NumberFormat(locale(), { maximumFractionDigits: digits }).format(n || 0);

/**
 * Localized weekday name, Monday = 0.
 * @param {number} i
 * @param {'narrow'|'short'|'long'} [style]
 */
export const weekdayName = (i, style = 'short') => fmtDate(new Date(2024, 0, 1 + i), { weekday: style });

/**
 * 12-hour clock? Bulgarian always uses 24 h; English follows the device's English locale
 * (en-US → 12 h, en-GB → 24 h).
 * @param {string} [device] Device locale (default navigator.language).
 */
export function uses12h(device = typeof navigator !== 'undefined' ? navigator.language : 'en-GB') {
  if (lang !== 'en') return false;
  const loc = /^en\b/i.test(device ?? '') ? device : 'en-GB';
  try {
    const hc = new Intl.DateTimeFormat(loc, { hour: 'numeric' }).resolvedOptions().hourCycle;
    return hc === 'h11' || hc === 'h12';
  } catch {
    return false;
  }
}

/**
 * Format an "HH:MM" time in the one clock style used across the app (see `uses12h`).
 * @param {string} hhmm @param {boolean} [h12]
 */
export function fmtHM(hhmm, h12 = uses12h()) {
  const m = /^(\d{1,2}):(\d{2})/.exec(hhmm ?? '');
  if (!m) return hhmm ?? '';
  const h = Number(m[1]);
  return h12 ? `${((h + 11) % 12) + 1}:${m[2]} ${h < 12 ? 'AM' : 'PM'}` : `${String(h).padStart(2, '0')}:${m[2]}`;
}
