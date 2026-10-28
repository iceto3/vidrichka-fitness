/**
 * Nutrition maths (pure): per-portion values, day totals, meal-of-day defaults and
 * "regular meal" detection.
 * @module features/food/logic
 */

/** Meal slots in display order with typical start hours. */
export const MEALS = /** @type {const} */ ([
  ['breakfast', 4],
  ['lunch', 11],
  ['snack', 15],
  ['dinner', 18],
]);

/**
 * 1.4.0: the time given to food added to a PAST day (it used to be 12:00 for every meal,
 * even breakfast). Today's food keeps the real time.
 */
export const MEAL_TIME = /** @type {Record<string, string>} */ ({
  breakfast: '08:00',
  lunch: '13:00',
  snack: '16:00',
  dinner: '19:00',
});

/**
 * Timestamp for food logged on `date` in `meal`: now for today, else the meal's usual time.
 * @param {string} date @param {string} meal @param {string} today @param {number} [now]
 */
export const mealTs = (date, meal, today, now = Date.now()) =>
  date === today ? now : new Date(`${date}T${MEAL_TIME[meal] ?? '12:00'}`).getTime();

/** Emoji tile + background per meal slot. */
export const MEAL_STYLE = {
  breakfast: ['🥣', '#FFF2D9'],
  lunch: ['🍗', '#E3F5EA'],
  snack: ['🥜', '#EEE8FF'],
  dinner: ['🍝', '#FFE9E3'],
};

/** Meal that fits a time of day. @param {Date} [d] */
export const mealFor = (d = new Date()) => [...MEALS].reverse().find(([, h]) => d.getHours() >= h)?.[0] ?? 'snack';

/** Is `v` a known (finite, non-negative) amount? Missing fiber/salt means "unknown". @param {any} v */
export const known = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Nutrition of `grams` of a food given per 100 g. Fiber (`fib`) and salt (`salt`) are only
 * included when the food has them (older foods and the built-in list don't – "unknown").
 * @param {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} per100
 * @param {number} grams
 * @returns {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}}
 */
export const portion = (per100, grams) => {
  const k = grams / 100,
    r = (/** @type {number} */ v) => Math.round((v || 0) * k * 10) / 10;
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} */
  const out = { kcal: Math.round((per100.kcal || 0) * k), p: r(per100.p), c: r(per100.c), f: r(per100.f) };
  if (known(per100.fib)) out.fib = r(/** @type {number} */ (per100.fib));
  if (known(per100.salt)) out.salt = Math.round(/** @type {number} */ (per100.salt) * k * 100) / 100;
  return out;
};

/**
 * Sum nutrition rows. Fiber and salt sum only the rows that know them; `fibN` / `saltN`
 * count those rows (0 → show "unknown").
 * @param {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}[]} rows
 * @returns {{kcal: number, p: number, c: number, f: number, fib: number, salt: number, fibN: number, saltN: number}}
 */
export const totals = (rows) =>
  rows.reduce(
    (
      /** @type {{kcal: number, p: number, c: number, f: number, fib: number, salt: number, fibN: number, saltN: number}} */ a,
      r,
    ) => ({
      kcal: a.kcal + (r.kcal || 0),
      p: a.p + (r.p || 0),
      c: a.c + (r.c || 0),
      f: a.f + (r.f || 0),
      fib: a.fib + (known(r.fib) ? /** @type {number} */ (r.fib) : 0),
      salt: a.salt + (known(r.salt) ? /** @type {number} */ (r.salt) : 0),
      fibN: a.fibN + (known(r.fib) ? 1 : 0),
      saltN: a.saltN + (known(r.salt) ? 1 : 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0, fib: 0, salt: 0, fibN: 0, saltN: 0 },
  );

/**
 * A diary row (or saved-meal item) at a new weight: every nutrient scales with the grams,
 * unknown fiber/salt stay unknown. Ids, meal, date and time are kept.
 * @template {{grams: number, kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} R
 * @param {R} row
 * @param {number} grams
 * @returns {R}
 */
export function scaleRow(row, grams) {
  const g = Math.max(1, Math.round(grams));
  if (!(row.grams > 0)) return { ...row, grams: g };
  const per100 = Object.fromEntries(
    ['kcal', 'p', 'c', 'f', 'fib', 'salt'].map((k) => {
      const v = /** @type {any} */ (row)[k];
      return [k, known(v) ? (v * 100) / row.grams : undefined];
    }),
  );
  const out = { ...row, grams: g, ...portion(/** @type {any} */ (per100), g) };
  if (!known(row.fib)) delete out.fib;
  if (!known(row.salt)) delete out.salt;
  return out;
}

/** Signature of a meal's foods (order-independent). @param {{foodId?: string, name?: any}[]} items */
export const signature = (items) =>
  items
    .map((i) => i.foodId ?? JSON.stringify(i.name))
    .sort()
    .join('|');

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

/** Per-100 g nutrients a product can lack, in display order (1.4.0). */
export const NUTRIENTS = /** @type {const} */ (['kcal', 'p', 'c', 'f', 'fib', 'salt']);

/** @param {any} v */
const listed = (v) => v != null && v !== '' && Number.isFinite(+v);

/**
 * Read per-100 g nutrition from an Open Food Facts product (fiber and salt when listed;
 * salt falls back to sodium × 2.5). 1.4.0: a value the product does not list counts as 0
 * (fiber/salt: unknown) and its key goes to `missing`, so the UI can ask the user to fill it
 * in; kcal may be missing too as long as at least one of kcal/П/В/М is listed.
 * @param {any} p OFF product JSON.
 * @returns {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, alc?: number, missing?: string[]}|null}
 */
export function fromOff(p) {
  const n = p?.nutriments ?? {};
  const kcalRaw = listed(n['energy-kcal_100g'])
    ? +n['energy-kcal_100g']
    : listed(n.energy_100g)
      ? n.energy_100g / 4.184
      : null;
  const key = { p: 'proteins_100g', c: 'carbohydrates_100g', f: 'fat_100g' };
  if (kcalRaw == null && !Object.values(key).some((k) => listed(n[k]))) return null; // no nutrition at all
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, missing?: string[]}} */
  const out = {
    kcal: kcalRaw == null ? 0 : Math.round(kcalRaw),
    p: listed(n[key.p]) ? +n[key.p] : 0,
    c: listed(n[key.c]) ? +n[key.c] : 0,
    f: listed(n[key.f]) ? +n[key.f] : 0,
  };
  const fib = listed(n.fiber_100g) ? +n.fiber_100g : NaN;
  const salt = listed(n.salt_100g) ? +n.salt_100g : listed(n.sodium_100g) ? +n.sodium_100g * 2.5 : NaN;
  // kept even when impossible (negative, over 100 g) so that implausible() rejects the product
  if (Number.isFinite(fib)) out.fib = Math.round(fib * 10) / 10;
  if (Number.isFinite(salt)) out.salt = Math.round(salt * 100) / 100;
  const missing = [
    ...(kcalRaw == null ? ['kcal'] : []),
    .../** @type {const} */ (['p', 'c', 'f']).filter((m) => !listed(n[key[m]])),
  ];
  if (missing.length) out.missing = missing;
  // OFF's alcohol_100g is % vol; ethanol (0.789 g/ml, 7 kcal/g) explains the kcal of wine and spirits
  const alc = listed(n.alcohol_100g) ? Math.round(+n.alcohol_100g * 0.789 * 10) / 10 : 0;
  if (alc > 0) /** @type {any} */ (out).alc = alc;
  return out;
}

/**
 * 1.4.0: declared kcal clearly inconsistent with 4·П + 4·В + 9·М (more than 30 % AND more
 * than 30 kcal apart). Looser than {@link kcalOff} (the manual form's live hint): this one
 * decides whether an Open Food Facts product is believable at all.
 * @param {number} kcal @param {number} est
 */
export const kcalMismatch = (kcal, est) => {
  const d = Math.abs(kcal - est);
  return d > 30 && d > 0.3 * Math.max(est, 1);
};

/**
 * 4·П + 4·В + 9·М (+ 7·alcohol g when known), rounded.
 * @param {{p?: number, c?: number, f?: number, alc?: number}} v
 */
export const kcalEstimate = (v) => Math.round(4 * (v.p || 0) + 4 * (v.c || 0) + 9 * (v.f || 0) + 7 * (v.alc || 0));

/**
 * 1.4.0: the ONE plausibility check for per-100 g values from Open Food Facts (text search
 * and barcode). Implausible = a negative value, kcal over 900, a macro or П+В+М over 100 g,
 * or kcal that the macros cannot explain ({@link kcalMismatch}, e.g. "Nutella 5 kcal").
 * Such products are never shown or used: the user is asked to enter the food themselves.
 * A missing macro can only add calories, so kcal ABOVE the estimate is fine while a macro
 * is missing, and kcal is not compared at all while it is missing itself.
 * @param {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, alc?: number, missing?: string[]}} v
 */
export function implausible(v) {
  const miss = v.missing ?? [];
  const vals = [v.kcal, v.p, v.c, v.f, v.fib, v.salt].filter((x) => x != null);
  if (vals.some((x) => !Number.isFinite(x) || x < 0)) return true;
  const sum = (v.p || 0) + (v.c || 0) + (v.f || 0);
  if (v.kcal > 900 || sum > 100 || [v.p, v.c, v.f, v.fib, v.salt].some((x) => (x ?? 0) > 100)) return true;
  if (miss.includes('kcal')) return false;
  const est = kcalEstimate(v);
  if (miss.some((k) => ['p', 'c', 'f'].includes(k)) && v.kcal >= est) return false;
  return kcalMismatch(v.kcal, est);
}

/**
 * Which values a product from Open Food Facts does not list (1.4.0), in {@link NUTRIENTS}
 * order. They count as 0 (fiber/salt: unknown) until the user fills them in. Once the user
 * has corrected the food (`fixed`), only kcal/П/В/М they still left empty remain.
 * @param {any} food Per-100 g food, or a diary row (which carries `missing` but no `source`).
 * @returns {string[]}
 */
export function missingValues(food) {
  if (!food || (food.source !== 'off' && !food.missing?.length)) return [];
  const miss = new Set(food.missing ?? []);
  if (food.source === 'off' && !food.fixed) {
    if (!known(food.fib)) miss.add('fib');
    if (!known(food.salt)) miss.add('salt');
  }
  return NUTRIENTS.filter((k) => miss.has(k));
}

/**
 * The food after the user corrected it in the form (1.4.0): typed values replace the
 * product's, a value left empty stays missing (kcal/П/В/М count as 0, fiber/salt unknown),
 * and the food is marked `fixed` so it is not flagged again. Id, barcode and source stay, so
 * the next scan of the same barcode finds the corrected food.
 * @param {any} food
 * @param {Record<string, string>} v Raw form values (kcal, p, c, f, fib, salt, portion, name).
 */
export function applyFix(food, v) {
  const r = validateFood(v);
  const typed = (/** @type {string} */ k) => String(v[k] ?? '').trim() !== '';
  const out = {
    ...food,
    name: String(v.name ?? '').trim() || food.name,
    kcal: r.values.kcal,
    p: r.values.p,
    c: r.values.c,
    f: r.values.f,
    portion: r.values.portion,
    fixed: true,
  };
  delete out.fib;
  delete out.salt;
  if (r.values.fib != null) out.fib = r.values.fib;
  if (r.values.salt != null) out.salt = r.values.salt;
  const missing = ['kcal', 'p', 'c', 'f'].filter((k) => !typed(k));
  if (missing.length) out.missing = missing;
  else delete out.missing;
  return out;
}

/** Parse a typed number ("12,5" works); '' → 0; anything else → NaN. @param {string} v */
export const parseNum = (v) => {
  const x = String(v ?? '')
    .trim()
    .replace(',', '.');
  return x === '' ? 0 : /^-?\d*\.?\d+$/.test(x) ? Number(x) : NaN;
};

/**
 * 1.4.0: do the typed calories differ from 4·П + 4·В + 9·М by more than 20 % AND more than
 * 30 kcal? (Only a gentle hint under the form – saving is never blocked.)
 * @param {number} kcal @param {number} est
 */
export const kcalOff = (kcal, est) => {
  const d = Math.abs(kcal - est);
  return d > 30 && d > 0.2 * Math.max(est, 1);
};

/**
 * Check a manual food (values per 100 g). Errors block saving; `warn` (kcal far from
 * 4·П + 4·В + 9·М, see kcalOff) is a live hint only (1.4.0: saving is never blocked). No value is silently clamped. Fiber and salt
 * are optional: left empty they stay unknown (not 0).
 * @param {Record<string, string>} v  Raw field values: kcal, p, c, f, fib, salt, portion.
 * @returns {{errors: Record<string, string>, warn: string|null, est: number, values: {kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, portion: number}}}
 */
export function validateFood(v) {
  /** @type {Record<string, string>} */
  const errors = {};
  const n = Object.fromEntries(['kcal', 'p', 'c', 'f', 'fib', 'salt', 'portion'].map((k) => [k, parseNum(v[k])]));
  for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'salt', 'portion'])
    if (!Number.isFinite(n[k])) errors[k] = 'manual.errNumber';
    else if (n[k] < 0) errors[k] = 'manual.errNegative';
  if (!errors.kcal && n.kcal > 900) errors.kcal = 'manual.errKcalMax';
  for (const k of ['p', 'c', 'f', 'fib', 'salt']) if (!errors[k] && n[k] > 100) errors[k] = 'manual.errOver100';
  if (!errors.p && !errors.c && !errors.f && n.p + n.c + n.f > 100)
    for (const k of ['p', 'c', 'f']) errors[k] = 'manual.errSum';
  if (!errors.portion && n.portion > 5000) errors.portion = 'manual.errPortion';
  let warn = null;
  const est = Math.round(4 * (n.p || 0) + 4 * (n.c || 0) + 9 * (n.f || 0));
  if (!Object.keys(errors).length && n.p + n.c + n.f > 0 && kcalOff(n.kcal, est)) warn = 'manual.warnKcal';
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, portion: number}} */
  const values = { kcal: n.kcal, p: n.p, c: n.c, f: n.f, portion: n.portion || 100 };
  const typed = (/** @type {string} */ k) => String(v[k] ?? '').trim() !== '';
  if (typed('fib') && !errors.fib) values.fib = n.fib;
  if (typed('salt') && !errors.salt) values.salt = n.salt;
  return { errors, warn, est, values };
}
