/**
 * 1.4.3 Abbreviated nutrients of a meal item row (pure, unit tested):
 * „пр 25 · вх 3,1 · мз 10 · кр 0,4 · фб 1,2 · сл 0,3“ — protein, carbs, fat, creatine, fiber,
 * salt in grams. Creatine only when the food has some; fiber or salt the food does not list
 * show „–“ (unknown, never 0). The ⓘ legend lists the full names (same keys as elsewhere).
 * @module features/food/nutrients
 */
import { fmtNum, t } from '../../core/i18n.js';
import { known } from './logic.js';

/** Nutrients in display order: [field, short-name key, full-name key]. */
export const NUTRIENTS = /** @type {const} */ ([
  ['p', 'nutr.p', 'food.protein'],
  ['c', 'nutr.c', 'food.carbs'],
  ['f', 'nutr.f', 'food.fat'],
  ['cr', 'nutr.cr', 'creatine.title'],
  ['fib', 'nutr.fib', 'food.fiber'],
  ['salt', 'nutr.salt', 'food.salt'],
]);

/**
 * A gram amount for the row: one decimal, „<0,1“ for a trace, „–“ when unknown.
 * @param {number|null|undefined} g
 */
export const fmtNutr = (g) =>
  !known(g)
    ? '–'
    : /** @type {number} */ (g) > 0 && /** @type {number} */ (g) < 0.05
      ? `<${fmtNum(0.1, 1)}`
      : fmtNum(/** @type {number} */ (g), 1);

/**
 * The row's nutrients as [short-name key, grams] pairs, in display order.
 * Protein, carbs and fat count missing values as 0 (as the day totals do).
 * @param {{p?: number, c?: number, f?: number, fib?: number, salt?: number}} row
 * @param {number|null} [creatineMg] mg of creatine in the row (null/0: not shown)
 * @returns {[string, number|null][]}
 */
export function nutrientCells(row, creatineMg = null) {
  /** @type {[string, number|null][]} */
  const out = [];
  for (const [k, short] of NUTRIENTS) {
    if (k === 'cr') {
      if (Number(creatineMg) > 0) out.push([short, Number(creatineMg) / 1000]);
    } else if (k === 'fib' || k === 'salt') out.push([short, known(row?.[k]) ? /** @type {number} */ (row[k]) : null]);
    else out.push([short, Number(row?.[k]) || 0]);
  }
  return out;
}

/**
 * Line 2 of a meal item row: „пр 25 · вх 3,1 · мз 10 · фб 1,2 · сл 0,3“.
 * @param {any} row @param {number|null} [creatineMg] @param {(k: string) => string} [tr]
 */
export const nutrientLine = (row, creatineMg = null, tr = t) =>
  nutrientCells(row, creatineMg)
    .map(([k, g]) => `${tr(k)} ${fmtNutr(g)}`)
    .join(' · ');

/** Legend rows for the ⓘ sheet: [short, full name]. @param {(k: string) => string} [tr] */
export const nutrientLegend = (tr = t) => NUTRIENTS.map(([, short, full]) => [tr(short), tr(full)]);
