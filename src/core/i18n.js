/**
 * Internationalisation: `t(key, vars)` lookups with `{var}` interpolation and simple
 * plurals (`{ one, other }` values selected by `vars.n`). English is the fallback.
 * Languages are registered in `src/data/i18n/index.js` and loaded lazily.
 * @module core/i18n
 */
import { LANGUAGES } from '../data/i18n/index.js';
import en from '../data/i18n/en.js';

/** @type {Record<string, any>} */
let dict = en;
let lang = 'en';
const missing = new Set();

/** Active language code. */
export const getLang = () => lang;

/** BCP-47 locale of the active language (for Intl). */
export const locale = () => LANGUAGES[lang]?.locale ?? 'en-GB';

/**
 * Pick a supported language from a preference list (e.g. navigator.languages).
 * @param {readonly string[]} prefs
 */
export const detectLang = (prefs) =>
  prefs.map((p) => p.slice(0, 2).toLowerCase()).find((p) => p in LANGUAGES) ?? 'en';

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
    if (!missing.has(key)) console.warn(`[i18n] missing key: ${key}`), missing.add(key);
    return key;
  }
  if (typeof v === 'object') v = pluralFor(Number(vars.n)) === 'one' ? v.one : v.other;
  return String(v).replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

/** @param {number} n */
const pluralFor = (n) => new Intl.PluralRules(locale()).select(n) === 'one' ? 'one' : 'other';

/**
 * Localized "multilingual value": `{en, bg}` objects or plain strings.
 * @param {string|Record<string,string>|undefined} v
 */
export const L = (v) => (v && typeof v === 'object' ? (v[lang] ?? v.en ?? Object.values(v)[0]) : (v ?? ''));

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
