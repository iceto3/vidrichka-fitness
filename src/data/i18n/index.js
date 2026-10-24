/**
 * Language registry. Add a language: create `<code>.js` with the same keys as `en.js`
 * and add an entry here (the unit tests check that every key exists).
 * @module data/i18n
 */

/** @type {Record<string, {name: string, locale: string, load: () => Promise<Record<string, any>>}>} */
export const LANGUAGES = {
  en: { name: 'English', locale: 'en-GB', load: async () => (await import('./en.js')).default },
  bg: { name: 'Български', locale: 'bg-BG', load: async () => (await import('./bg.js')).default },
};
