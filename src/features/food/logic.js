/**
 * Nutrition maths (pure): per-portion values, day totals, meal-of-day defaults and
 * "regular meal" detection.
 * @module features/food/logic
 */

/**
 * Meal slots in display order with typical start hours. 1.4.3 (part B): five meals – the
 * morning snack (`snack_am`, new, off by default) and the afternoon snack (`snack`, the old
 * „Междинно“, id kept for existing entries). Which are used: core/settings `enabledMeals`.
 */
export const MEALS = /** @type {const} */ ([
  ['breakfast', 4],
  ['snack_am', 10],
  ['lunch', 11],
  ['snack', 15],
  ['dinner', 18],
]);

/** The four meals of older versions (the default when no list of enabled meals is given). */
export const DEFAULT_MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];

/**
 * 1.4.0: the time given to food added to a PAST day (it used to be 12:00 for every meal,
 * even breakfast). Today's food keeps the real time.
 */
export const MEAL_TIME = /** @type {Record<string, string>} */ ({
  breakfast: '08:00',
  snack_am: '10:30',
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

/**
 * 1.5.0: one time per meal – every entry of a meal on a day shares it. The meal's time is its
 * earliest entry (older data may have several times; the first one counts). Pure.
 * @param {{date?: string, meal?: string, type?: string, ts?: number}[]} rows @param {string} date
 * @param {string} meal @returns {number|null}
 */
export function mealTimeOf(rows, date, meal) {
  let t = Infinity;
  for (const r of rows)
    if (r.date === date && r.meal === meal && r.type !== 'water' && Number(r.ts) > 0) t = Math.min(t, Number(r.ts));
  return t === Infinity ? null : t;
}

/**
 * 1.5.1: the time of a meal on a day („HH:MM“ – its earliest entry, see mealTimeOf), or ''.
 * Pure. @param {any[]} rows @param {string} date @param {string} meal
 */
export const mealHM = (rows, date, meal) => {
  const at = mealTimeOf(rows, date, meal);
  if (at == null) return '';
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

/**
 * 1.5.0: an unplanned meal („Добави хранене“) is its own meal id `x_<base36 time>` – old
 * data has none and older versions simply don't list it. It gives no XP, counts for no daily
 * goal; its entries only add to the day's totals and charts. @param {any} m
 */
export const isExtra = (m) => typeof m === 'string' && m.startsWith('x_');

/** A new unplanned meal's id. @param {number} [now] */
export const newExtraId = (now = Date.now()) => `x_${now.toString(36)}`;

/** The planned meals that name an unplanned one by its place in the day. */
const ANCHORS = /** @type {const} */ (['breakfast', 'lunch', 'dinner']);

/** A meal's time on `date`: its entries' time, else its usual time. */
const anchorAt = (/** @type {any[]} */ rows, /** @type {string} */ date, /** @type {string} */ m) =>
  mealTimeOf(rows, date, m) ?? new Date(`${date}T${MEAL_TIME[m] ?? '12:00'}`).getTime();

/**
 * 1.5.0: the name of an unplanned meal at `ts` (pure): between breakfast and lunch
 * „Междинно сутрешно“ (`extraAm`), between lunch and dinner „Междинно следобедно“ (`extraPm`),
 * before breakfast or after dinner „Допълнително хранене“ (`extra`). The planned meals count
 * at their logged time, else at their usual time (08:00 / 13:00 / 19:00).
 * @param {number} ts @param {string} date @param {any[]} rows That day's (or all) food rows.
 * @returns {'extraAm'|'extraPm'|'extra'}
 */
export function extraKind(ts, date, rows) {
  const [bf, lunch, dinner] = ANCHORS.map((m) => anchorAt(rows, date, m));
  if (ts < bf || ts > dinner) return 'extra';
  return ts < lunch ? 'extraAm' : 'extraPm';
}

/**
 * 1.5.0: the meals to list for a day – the planned ones ({@link mealsForDay}) with the day's
 * unplanned meals placed among them by time (after the last meal at or before it).
 * @param {string[]} enabled @param {any[]} rows That day's food rows. @param {string} date
 */
export function mealsWithExtras(enabled, rows, date) {
  const list = mealsForDay(enabled, rows).map((m) => ({ m, at: anchorAt(rows, date, m) }));
  const extras = [...new Set(rows.filter((r) => r.date === date && isExtra(r.meal)).map((r) => r.meal))]
    .map((m) => ({ m, at: mealTimeOf(rows, date, m) ?? 0 }))
    .sort((a, b) => a.at - b.at);
  for (const x of extras) {
    let i = list.length - 1;
    while (i >= 0 && list[i].at > x.at) i--;
    list.splice(i + 1, 0, x);
  }
  return list.map((x) => x.m);
}

/** Emoji tile + background per meal slot. */
export const MEAL_STYLE = {
  breakfast: ['🥣', '#FFF2D9'],
  snack_am: ['🍎', '#E6F3FF'],
  lunch: ['🍗', '#E3F5EA'],
  snack: ['🥜', '#EEE8FF'],
  dinner: ['🍝', '#FFE9E3'],
};

/** 1.5.0: a meal's tile (unplanned meals: 🍽️). @param {string} m @returns {[string, string]} */
export const mealStyle = (m) =>
  /** @type {any} */ (MEAL_STYLE)[m] ?? (isExtra(m) ? ['🍽️', '#F1ECE4'] : ['🍽️', '#EEF3F5']);

/**
 * Start hour of a meal among the enabled ones: with the morning snack on, lunch starts at 12
 * (the morning snack gets 10–12), else at 11 as before. @param {string} m @param {string[]} enabled
 */
const startHour = (m, enabled) =>
  m === 'lunch' && enabled.includes('snack_am') ? 12 : (MEALS.find(([id]) => id === m)?.[1] ?? 0);

/**
 * Meal that fits a time of day, chosen only from the enabled meals (1.4.3 part B). In the
 * small hours (before 04:00) it is the afternoon snack as before, else the last enabled meal.
 * 1.5.0: from 04:00 on, before the first enabled meal has started (e.g. breakfast off, 09:00)
 * it is the next meal of the day (lunch), never the afternoon snack.
 * @param {Date} [d] @param {string[]} [enabled] Enabled meal ids (default: the four classic meals).
 */
export function mealFor(d = new Date(), enabled = DEFAULT_MEALS) {
  const list = MEALS.map(([m]) => m).filter((m) => enabled.includes(m));
  if (!list.length) return 'snack';
  const h = d.getHours();
  const started = [...list].reverse().find((m) => h >= startHour(m, list));
  if (started) return started;
  if (h >= MORNING_HOUR) return list[0];
  return list.includes('snack') ? 'snack' : list[list.length - 1];
}

/** 1.5.0: the day's meals start at 04:00 (earlier = the night before, see {@link mealFor}). */
const MORNING_HOUR = 4;

/**
 * 1.4.3 (fixes): the add page of a meal switched off in Profile (an old link, history back,
 * a `?protein` deep link) opens the meal of this time instead. A switched-off meal that already
 * has entries on that day (hidden meals keep their entries) still opens as is.
 * @param {string} meal The meal in the link. @param {string[]} enabled Meals in use.
 * @param {boolean} hasRows The day already has entries in that meal.
 * @param {Date} [d] Now (picks the meal of this time).
 * @returns {string|null} The meal to open instead, or null to keep the link.
 */
export function addMealRedirect(meal, enabled, hasRows, d = new Date()) {
  if (enabled.includes(meal) || (hasRows && MEALS.some(([m]) => m === meal))) return null;
  return mealFor(d, enabled);
}

/**
 * Meals to list for a day: the enabled ones plus any disabled meal that has entries that day
 * (hidden meals keep their past entries visible), in the day's order.
 * @param {string[]} enabled @param {{meal?: string}[]} [rows] That day's food rows.
 */
export const mealsForDay = (enabled, rows = []) =>
  MEALS.map(([m]) => m).filter((m) => enabled.includes(m) || rows.some((r) => r.meal === m));

/** Is `v` a known (finite, non-negative) amount? Missing fiber/salt means "unknown". @param {any} v */
export const known = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0;

/**
 * Nutrition of `grams` of a food given per 100 g. Fiber (`fib`) and salt (`salt`) are only
 * included when the food has them (older foods and the built-in list don't – "unknown").
 * 1.5.1: saturated fat (`sat`) and sugar (`sug`) work the same way (optional, unknown = absent).
 * @param {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number}} per100
 * @param {number} grams
 * @returns {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number}}
 */
export const portion = (per100, grams) => {
  const k = grams / 100,
    r = (/** @type {number} */ v) => Math.round((v || 0) * k * 10) / 10;
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number}} */
  const out = { kcal: Math.round((per100.kcal || 0) * k), p: r(per100.p), c: r(per100.c), f: r(per100.f) };
  if (known(per100.fib)) out.fib = r(/** @type {number} */ (per100.fib));
  if (known(per100.salt)) out.salt = Math.round(/** @type {number} */ (per100.salt) * k * 100) / 100;
  if (known(per100.sat)) out.sat = r(/** @type {number} */ (per100.sat)); // 1.5.1 saturated fat
  if (known(per100.sug)) out.sug = r(/** @type {number} */ (per100.sug)); // 1.5.1 sugar
  return out;
};

/**
 * Sum nutrition rows. Fiber and salt sum only the rows that know them; `fibN` / `saltN`
 * count those rows (0 → show "unknown"). 1.5.1: saturated fat / sugar the same (`satN` / `sugN`).
 * @param {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number}[]} rows
 * @returns {{kcal: number, p: number, c: number, f: number, fib: number, salt: number, fibN: number, saltN: number, sat: number, sug: number, satN: number, sugN: number}}
 */
export const totals = (rows) =>
  rows.reduce(
    (
      /** @type {{kcal: number, p: number, c: number, f: number, fib: number, salt: number, fibN: number, saltN: number, sat: number, sug: number, satN: number, sugN: number}} */ a,
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
      sat: a.sat + (known(r.sat) ? /** @type {number} */ (r.sat) : 0),
      sug: a.sug + (known(r.sug) ? /** @type {number} */ (r.sug) : 0),
      satN: a.satN + (known(r.sat) ? 1 : 0),
      sugN: a.sugN + (known(r.sug) ? 1 : 0),
    }),
    { kcal: 0, p: 0, c: 0, f: 0, fib: 0, salt: 0, fibN: 0, saltN: 0, sat: 0, sug: 0, satN: 0, sugN: 0 },
  );

/**
 * 1.4.4: is the row still what its food gives at the row's grams? False once a custom food
 * was edited after the row was logged – the row then keeps its own (old) values.
 * @param {{grams: number, kcal: number, p: number, c: number, f: number}} row @param {any} food
 */
export function matchesFood(row, food) {
  if (!food || !(row.grams > 0)) return false;
  const n = portion(food, row.grams);
  const near = (/** @type {number} */ a, /** @type {number} */ b, /** @type {number} */ d) =>
    !known(a) || !known(b) || Math.abs(a - b) <= d;
  return near(row.kcal, n.kcal, 1) && near(row.p, n.p, 0.15) && near(row.c, n.c, 0.15) && near(row.f, n.f, 0.15);
}

/**
 * A diary row (or saved-meal item) at a new weight: every nutrient scales with the grams,
 * unknown fiber/salt stay unknown. Ids, meal, date and time are kept.
 * 1.4.3 (fixes): with the row's food (catalog or saved food, per 100 g) the values come from
 * the food, exactly like when it was added (`portion`) – 160 g is the same kcal in the add
 * sheet and in the edit sheet. Without it (voice / custom rows) they are scaled from the row.
 * @template {{grams: number, kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number}} R
 * @param {R} row
 * @param {number} grams
 * @param {any} [food] The row's food (per 100 g), if known.
 * @returns {R}
 */
export function scaleRow(row, grams, food = null) {
  const g = Math.max(1, Math.round(grams));
  if (!(row.grams > 0)) return { ...row, grams: g };
  if (food && !matchesFood(row, food)) food = null; // 1.4.4: an edited custom food keeps old rows as they were
  const per100 = Object.fromEntries(
    ['kcal', 'p', 'c', 'f', 'fib', 'salt', 'sat', 'sug'].map((k) => {
      const v = /** @type {any} */ (row)[k],
        fv = food?.[k];
      if (!known(v)) return [k, undefined];
      return [k, known(fv) ? fv : (v * 100) / row.grams];
    }),
  );
  const out = { ...row, grams: g, ...portion(/** @type {any} */ (per100), g) };
  if (!known(row.fib)) delete out.fib;
  if (!known(row.salt)) delete out.salt;
  if (!known(row.sat)) delete out.sat;
  if (!known(row.sug)) delete out.sug;
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
 * @returns {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number, alc?: number, missing?: string[]}|null}
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
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number, missing?: string[]}} */
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
  // 1.5.1: saturated fat / sugar when listed and possible (≤ fat / ≤ carbs); else just unknown
  const sat = listed(n['saturated-fat_100g']) ? +n['saturated-fat_100g'] : NaN;
  const sug = listed(n.sugars_100g) ? +n.sugars_100g : NaN;
  if (Number.isFinite(sat) && sat >= 0 && sat <= out.f + 0.05) out.sat = Math.round(sat * 10) / 10;
  if (Number.isFinite(sug) && sug >= 0 && sug <= out.c + 0.05) out.sug = Math.round(sug * 10) / 10;
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
  delete out.sat;
  delete out.sug;
  if (r.values.fib != null) out.fib = r.values.fib;
  if (r.values.salt != null) out.salt = r.values.salt;
  if (r.values.sat != null) out.sat = r.values.sat; // 1.5.1
  if (r.values.sug != null) out.sug = r.values.sug;
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
 * 1.4.4: a custom food's package photo is used only if it is one of our own image data URLs
 * (a restored backup can't inject anything else). @param {any} u @returns {string} '' if not.
 */
export const safePhoto = (u) =>
  typeof u === 'string' && u.length < 400_000 && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u)
    ? u
    : '';

/** 1.4.4: highest creatine accepted for a custom food (g per 100 g; meat and fish are ~0.3–0.7). */
export const MAX_CREATINE = 5;

/**
 * 1.4.4: a custom food's creatine field (g / 100 g, optional): '' → undefined (unknown),
 * 0…{@link MAX_CREATINE} → the number (2 decimals), anything else → NaN (an error).
 * @param {string} v
 */
export const parseCreatine = (v) => {
  if (String(v ?? '').trim() === '') return undefined;
  const x = parseNum(v);
  return Number.isFinite(x) && x >= 0 && x <= MAX_CREATINE ? Math.round(x * 100) / 100 : NaN;
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
 * @returns {{errors: Record<string, string>, warn: string|null, est: number, values: {kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number, portion: number}}}
 */
export function validateFood(v) {
  /** @type {Record<string, string>} */
  const errors = {};
  const n = Object.fromEntries(
    ['kcal', 'p', 'c', 'f', 'fib', 'salt', 'sat', 'sug', 'portion'].map((k) => [k, parseNum(v[k])]),
  );
  for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'salt', 'sat', 'sug', 'portion'])
    if (!Number.isFinite(n[k])) errors[k] = 'manual.errNumber';
    else if (n[k] < 0) errors[k] = 'manual.errNegative';
  if (!errors.kcal && n.kcal > 900) errors.kcal = 'manual.errKcalMax';
  for (const k of ['p', 'c', 'f', 'fib', 'salt', 'sat', 'sug'])
    if (!errors[k] && n[k] > 100) errors[k] = 'manual.errOver100';
  // 1.5.1: saturated fat is part of the fat, sugar part of the carbs
  if (!errors.sat && !errors.f && n.sat > n.f) errors.sat = 'manual.errSat';
  if (!errors.sug && !errors.c && n.sug > n.c) errors.sug = 'manual.errSug';
  if (!errors.p && !errors.c && !errors.f && n.p + n.c + n.f > 100)
    for (const k of ['p', 'c', 'f']) errors[k] = 'manual.errSum';
  if (!errors.portion && n.portion > 5000) errors.portion = 'manual.errPortion';
  let warn = null;
  const est = Math.round(4 * (n.p || 0) + 4 * (n.c || 0) + 9 * (n.f || 0));
  if (!Object.keys(errors).length && n.p + n.c + n.f > 0 && kcalOff(n.kcal, est)) warn = 'manual.warnKcal';
  /** @type {{kcal: number, p: number, c: number, f: number, fib?: number, salt?: number, sat?: number, sug?: number, portion: number}} */
  const values = { kcal: n.kcal, p: n.p, c: n.c, f: n.f, portion: n.portion || 100 };
  const typed = (/** @type {string} */ k) => String(v[k] ?? '').trim() !== '';
  if (typed('fib') && !errors.fib) values.fib = n.fib;
  if (typed('salt') && !errors.salt) values.salt = n.salt;
  if (typed('sat') && !errors.sat) values.sat = n.sat;
  if (typed('sug') && !errors.sug) values.sug = n.sug;
  return { errors, warn, est, values };
}

/** 1.4.3 (part A): the grams steppers' buttons (add sheet and diary-row edit), in grams. */
export const GRAM_STEPS = /** @type {const} */ ([-10, -5, 5, 10]);
/** Largest portion in grams. */
export const GRAM_MAX = 5000;

/**
 * Grams after a stepper button (`d` grams) or a typed value (`typed`), kept within 0…GRAM_MAX.
 * Typed text is rounded to whole grams; text that is not a number gives 0. Pure.
 * @param {number} g Current grams. @param {{d?: number, typed?: string}} change
 */
export function nextGrams(g, change) {
  const v =
    change.typed != null
      ? Math.round(parseFloat(String(change.typed).replace(',', '.')) || 0)
      : g + Number(change.d || 0);
  return Math.min(GRAM_MAX, Math.max(0, v));
}
