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

/**
 * Read per-100 g nutrition from an Open Food Facts product (fiber and salt when listed;
 * salt falls back to sodium × 2.5).
 * @param {any} p OFF product JSON.
 * @returns {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, missing?: string[]}|null}
 */
export function fromOff(p) {
  const n = p?.nutriments ?? {};
  const kcal = n['energy-kcal_100g'] ?? (n.energy_100g != null ? n.energy_100g / 4.184 : null);
  if (kcal == null) return null;
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number}} */
  const out = {
    kcal: Math.round(kcal),
    p: +(n.proteins_100g ?? 0),
    c: +(n.carbohydrates_100g ?? 0),
    f: +(n.fat_100g ?? 0),
  };
  // 1.4.0: macros the product does not list are counted as 0 but shown as "–"
  const missing = /** @type {const} */ ([
    ['p', 'proteins_100g'],
    ['c', 'carbohydrates_100g'],
    ['f', 'fat_100g'],
  ])
    .filter(([, k]) => n[k] == null || n[k] === '')
    .map(([m]) => m);
  if (missing.length) /** @type {any} */ (out).missing = missing;
  const fib = n.fiber_100g != null && n.fiber_100g !== '' ? +n.fiber_100g : NaN;
  const salt =
    n.salt_100g != null && n.salt_100g !== ''
      ? +n.salt_100g
      : n.sodium_100g != null && n.sodium_100g !== ''
        ? +n.sodium_100g * 2.5
        : NaN;
  if (known(fib) && fib <= 100) out.fib = Math.round(fib * 10) / 10;
  if (known(salt) && salt <= 100) out.salt = Math.round(salt * 100) / 100;
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
