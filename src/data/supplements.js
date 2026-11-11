/**
 * 1.6.1 Ready supplements („Хранителни добавки“ in Храна), addable with one tap. A user's
 * own list (kv `supplements`) holds one entry per added supplement with its last dose; the
 * names are i18n keys `supp.<kind>`. Doses: `dose` default, `step` of the ± buttons, `max`
 * accepted per day (in `unit`). Protein powder counts for the day's protein (`proteinPct`
 * g of protein per 100 g of powder, editable per user).
 * @module data/supplements
 */

/** Dose units: grams, milligrams, international units, capsules / tablets. */
export const SUPP_UNITS = /** @type {const} */ (['g', 'mg', 'IU', 'caps']);

/**
 * @typedef {{emoji: string, unit: typeof SUPP_UNITS[number], dose: number, step: number, max: number, proteinPct?: number}} SuppKind
 */

/** @type {Record<string, SuppKind>} */
export const SUPP_KINDS = {
  creatine: { emoji: '⚡', unit: 'g', dose: 3, step: 0.5, max: 50 },
  protein: { emoji: '🥤', unit: 'g', dose: 30, step: 5, max: 200, proteinPct: 75 },
  vitd: { emoji: '☀️', unit: 'IU', dose: 2000, step: 500, max: 20000 },
  omega3: { emoji: '🐟', unit: 'caps', dose: 1, step: 1, max: 10 },
  magnesium: { emoji: '🌙', unit: 'mg', dose: 300, step: 50, max: 2000 },
  vitc: { emoji: '🍊', unit: 'mg', dose: 500, step: 50, max: 5000 },
  iron: { emoji: '🩸', unit: 'mg', dose: 14, step: 1, max: 200 },
  zinc: { emoji: '🛡️', unit: 'mg', dose: 10, step: 1, max: 100 },
  multi: { emoji: '💊', unit: 'caps', dose: 1, step: 1, max: 5 },
};

/** Defaults of a user's own supplement, per unit (step / max / starting dose). */
export const CUSTOM_UNIT = {
  g: { dose: 5, step: 0.5, max: 200 },
  mg: { dose: 100, step: 10, max: 10000 },
  IU: { dose: 1000, step: 500, max: 50000 },
  caps: { dose: 1, step: 1, max: 20 },
};
