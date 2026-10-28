/**
 * 1.4.2 Creatine in built-in foods (mg per 100 g, as listed: raw, cooked or canned).
 * Only meat and fish with published data have a value; every other food (and custom,
 * Open Food Facts or voice entries) is "unknown" and counts as 0 in the day total.
 *
 * How a value is made (one rule for every row, so nothing is typed in by hand):
 *   mg/100 g = species reference (raw) × (row protein / reference raw protein) × retention
 *   retention: raw 1 · cooked (grilled, boiled, fried, breaded) 0.75 · canned 0.70
 * Scaling by protein follows the lean muscle in the row (fat in mince, water lost when
 * cooking, breading); the retention covers the creatine lost to the juices and turned
 * into creatinine by heat.
 *
 * Sources (full list with links in docs/CREATINE.md):
 *   [H97] Harris, Lowe, Warnes, Orme 1997, Res Vet Sci 62:58–62 – raw chicken and beef
 *         ≈ 30 mmol/kg (≈ 393 mg/100 g), ox liver 2.3 mmol/kg (≈ 30 mg/100 g).
 *   [B94] Balsom, Söderlund, Ekblom 1994, Sports Med 18:268–280 – herring 6.5–10 g/kg,
 *         pork 5, beef 4.5, salmon 4.5, tuna 4, cod 3 g/kg (also used by [BA19], [R23]).
 *   [BA19] Balestrino & Adriano 2019, Med Res Rev 39:2427–2459 (review) – food table.
 *   [R23] Wuertz & Reiser, "Creatine: a valuable supplement in aquafeeds?", Rev Aquacult
 *         2022/23 (doi 10.1111/raq.12717) – tuna 2.7–6.5, cod 3–4.4, shrimp 0.7 g/kg.
 *   [NH] NHANES creatine method (Bakian 2020, Transl Psychiatry; Ostojic 2021,
 *        Nutrition 87–88:111207) – 3.88 g/kg for meat, poultry and fish food codes of the USDA FNDDS; used
 *        for fish without a species value (mackerel, trout, sea bass, sardine, sprat).
 *   [L07] Larsen et al. 2007, J Food Compos Anal 20:396–402 – cod keeps 68–78 % of its
 *         creatine when boiled, fried or baked (→ 0.75); [P04] Purchas et al. 2004, Meat
 *         Sci 68:201–207 (beef: creatine falls with cooking – juices and creatinine).
 *   [HU60] Hughes 1960, J Sci Food Agric 11:700 – canned herring at 115 °C: about a quarter
 *         turns into creatinine plus some binding loss (→ 0.70).
 * Processed meat (ham, bacon, sausages, lukanka, kebapche, kyufte) and dishes are left
 * unknown: their meat share and processing vary too much.
 * @module data/creatine
 */
import { FOODS } from './foods.js';

/** Species references: raw mg/100 g, raw protein g/100 g (USDA SR raw), source keys. */
export const CREATINE_REF = /** @type {const} */ ({
  beef: { mg: 420, p: 21, src: 'H97 ≈393, B94 450' },
  pork: { mg: 500, p: 21, src: 'B94, BA19' },
  chicken: { mg: 400, p: 22.5, src: 'H97 ≈393, BA19' },
  turkey: { mg: 400, p: 23.7, src: 'poultry as chicken (H97, BA19) – estimate' },
  salmon: { mg: 450, p: 20, src: 'B94, R23' },
  tuna: { mg: 400, p: 24.4, src: 'B94, R23 270–650' },
  cod: { mg: 300, p: 18, src: 'B94, R23 300–440' },
  herring: { mg: 650, p: 18, src: 'B94 650–1000 (low end); HU60 350–420' },
  shrimp: { mg: 70, p: 20.1, src: 'R23' },
  liver: { mg: 30, p: 20.4, src: 'H97 (ox liver)' },
  fish: { mg: 388, p: 20, src: 'NH 3.88 g/kg (no species value)' },
  mix60: { mg: 468, p: 21, src: 'pork 60 % + beef 40 %' },
  mix50: { mg: 460, p: 21, src: 'pork 50 % + beef 50 %' },
  mix75: { mg: 480, p: 21, src: 'pork 75 % + beef 25 %' },
});

/** Retention of creatine by how the row is listed. */
export const RETENTION = /** @type {const} */ ({ raw: 1, cooked: 0.75, canned: 0.7 });

/**
 * Built-in food id → [species, state]. Every id must exist in data/foods.js (unit tested).
 * @type {Record<string, [keyof typeof CREATINE_REF, keyof typeof RETENTION]>}
 */
export const CREATINE_FOODS = {
  chicken_breast: ['chicken', 'cooked'],
  chicken_thigh: ['chicken', 'cooked'],
  turkey_breast: ['turkey', 'cooked'],
  beef_steak: ['beef', 'cooked'],
  minced_beef: ['beef', 'raw'],
  minced_mixed: ['mix60', 'raw'],
  minced_mixed_50: ['mix50', 'raw'],
  minced_mixed_75: ['mix75', 'raw'],
  pork_loin: ['pork', 'cooked'],
  pork_chop: ['pork', 'cooked'],
  salmon: ['salmon', 'raw'],
  tuna_can: ['tuna', 'canned'],
  cod: ['cod', 'raw'],
  mackerel: ['fish', 'raw'],
  trout: ['fish', 'raw'],
  sea_bass: ['fish', 'raw'],
  shrimp: ['shrimp', 'cooked'],
  sardines: ['fish', 'canned'],
  chicken_wings: ['chicken', 'cooked'],
  liver_chicken: ['liver', 'raw'],
  chicken_breast_raw: ['chicken', 'raw'],
  chicken_thigh_raw: ['chicken', 'raw'],
  turkey_breast_raw: ['turkey', 'raw'],
  pork_loin_raw: ['pork', 'raw'],
  beef_raw: ['beef', 'raw'],
  minced_beef_80: ['beef', 'raw'],
  salmon_grilled: ['salmon', 'cooked'],
  chicken_breast_boiled: ['chicken', 'cooked'],
  chicken_breast_breaded: ['chicken', 'cooked'],
  chicken_breast_fried: ['chicken', 'cooked'],
  chicken_thigh_boiled: ['chicken', 'cooked'],
  chicken_thigh_breaded: ['chicken', 'cooked'],
  chicken_thigh_fried: ['chicken', 'cooked'],
  turkey_breast_breaded: ['turkey', 'cooked'],
  turkey_breast_fried: ['turkey', 'cooked'],
  pork_chop_boiled: ['pork', 'cooked'],
  pork_chop_breaded: ['pork', 'cooked'],
  pork_chop_fried: ['pork', 'cooked'],
  beef_boiled: ['beef', 'cooked'],
  beef_breaded: ['beef', 'cooked'],
  beef_fried: ['beef', 'cooked'],
  fish_white_boiled: ['cod', 'cooked'],
  fish_breaded: ['cod', 'cooked'],
  fish_fried: ['cod', 'cooked'],
  salmon_fried: ['salmon', 'cooked'],
  mackerel_fried: ['fish', 'cooked'],
  trout_fried: ['fish', 'cooked'],
  sprat_fried: ['fish', 'cooked'],
  herring: ['herring', 'raw'],
};

/**
 * mg of creatine per 100 g of a food row (rule above), rounded to 1 mg.
 * @param {keyof typeof CREATINE_REF} species @param {keyof typeof RETENTION} state @param {number} protein
 */
export const creatinePer100 = (species, state, protein) => {
  const r = CREATINE_REF[species];
  return Math.round(r.mg * (protein / r.p) * RETENTION[state]);
};

/** Food id → mg creatine per 100 g (built-in foods with data only). @type {Record<string, number>} */
export const CREATINE_MG = Object.fromEntries(
  FOODS.filter((f) => CREATINE_FOODS[f.id]).map((f) => {
    const [species, state] = CREATINE_FOODS[f.id];
    return [f.id, creatinePer100(species, state, f.p)];
  }),
);
