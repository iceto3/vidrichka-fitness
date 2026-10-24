/**
 * Nutrition maths (pure): per-portion values, day totals, meal-of-day defaults and
 * "regular meal" detection.
 * @module features/food/logic
 */

/** Meal slots in display order with typical start hours. */
export const MEALS = /** @type {const} */ ([['breakfast', 4], ['lunch', 11], ['snack', 15], ['dinner', 18]]);

/** Meal that fits a time of day. @param {Date} [d] */
export const mealFor = (d = new Date()) => [...MEALS].reverse().find(([, h]) => d.getHours() >= h)?.[0] ?? 'snack';

/**
 * Nutrition of `grams` of a food given per 100 g.
 * @param {{kcal: number, p: number, c: number, f: number}} per100
 * @param {number} grams
 */
export const portion = (per100, grams) => {
  const k = grams / 100, r = (/** @type {number} */ v) => Math.round((v || 0) * k * 10) / 10;
  return { kcal: Math.round((per100.kcal || 0) * k), p: r(per100.p), c: r(per100.c), f: r(per100.f) };
};

/**
 * Sum nutrition rows.
 * @param {{kcal: number, p: number, c: number, f: number}[]} rows
 */
export const totals = (rows) =>
  rows.reduce((a, r) => ({ kcal: a.kcal + (r.kcal || 0), p: a.p + (r.p || 0), c: a.c + (r.c || 0), f: a.f + (r.f || 0) }), { kcal: 0, p: 0, c: 0, f: 0 });

/** Signature of a meal's foods (order-independent). @param {{foodId?: string, name?: any}[]} items */
export const signature = (items) => items.map((i) => i.foodId ?? JSON.stringify(i.name)).sort().join('|');

/**
 * How many earlier days had a meal with exactly these foods.
 * @param {{date: string, meal: string, foodId?: string, name?: any}[]} rows All diary rows.
 * @param {string} sig
 * @param {string} exceptDate
 */
export function timesEaten(rows, sig, exceptDate) {
  /** @type {Record<string, any[]>} */
  const groups = {};
  rows.forEach((r) => r.date !== exceptDate && (groups[`${r.date}|${r.meal}`] ??= []).push(r));
  return Object.values(groups).filter((g) => signature(g) === sig).length;
}

/**
 * Read per-100 g nutrition from an Open Food Facts product.
 * @param {any} p OFF product JSON.
 * @returns {{kcal: number, p: number, c: number, f: number}|null}
 */
export function fromOff(p) {
  const n = p?.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null) return null;
  return { kcal: Math.round(kcal), p: +(n.proteins_100g ?? 0), c: +(n.carbohydrates_100g ?? 0), f: +(n.fat_100g ?? 0) };
}
