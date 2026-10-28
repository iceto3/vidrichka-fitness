/**
 * 1.4.2 Creatine of a day (pure, unit tested): built-in meat and fish with data
 * (data/creatine.js) plus a supplement entered on the day. Foods without data – custom
 * foods, barcode products, voice entries, processed meat – count as 0 ("unknown"),
 * nothing is guessed.
 * @module features/food/creatine
 */
import { CREATINE_MG } from '../../data/creatine.js';

/** Default supplement dose offered (g). */
export const DEFAULT_CREATINE_DOSE = 3;

/**
 * mg of creatine in one diary row, or null when its food has no data.
 * @param {{foodId?: string, grams?: number}} row @param {Record<string, number>} [table]
 */
export function creatineMg(row, table = CREATINE_MG) {
  const per100 = row?.foodId ? table[row.foodId] : undefined;
  if (per100 == null || !(Number(row.grams) > 0)) return null;
  return (per100 * Number(row.grams)) / 100;
}

/**
 * Day total in grams (1 decimal): food with data + supplement.
 * @param {any[]} rows Diary rows of the day (water excluded). @param {number|null|undefined} suppG
 * @param {Record<string, number>} [table]
 * @returns {{foodG: number, suppG: number, totalG: number, rows: number}} `rows` = rows with data
 */
export function dayCreatine(rows, suppG, table = CREATINE_MG) {
  let mg = 0,
    n = 0;
  for (const r of rows ?? []) {
    const v = creatineMg(r, table);
    if (v != null) ((mg += v), n++);
  }
  const r1 = (/** @type {number} */ x) => Math.round(x * 10) / 10;
  const supp = Number(suppG) > 0 ? r1(Number(suppG)) : 0,
    food = r1(mg / 1000);
  return { foodG: food, suppG: supp, totalG: r1(mg / 1000 + supp), rows: n };
}
