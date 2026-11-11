/**
 * Public API of the food feature: diary rows, water, saved meals, foods (local database
 * + custom/online cached), usage stats for "most used" ordering.
 * @module features/food/api
 */
import { searchFoods } from './search.js';
import { all, get, kv, put, remove, setKv, uid } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { L, t } from '../../core/i18n.js';
import { dayKey, hhmm } from '../../core/dates.js';
import { FOODS, FOOD_CATEGORIES, QUICK_PICKS } from '../../data/foods.js';
import { extraKind, isExtra, known, mealFor, mealTimeOf, mealTs, portion, scaleRow } from './logic.js';
import { enabledMeals } from '../../core/settings.js';
import { bump, byPoints, categoriesByPoints, groupFoods } from './usage.js';

export { FOODS, FOOD_CATEGORIES, QUICK_PICKS };

const local = new Map(FOODS.map((f) => [f.id, f]));

/** Currently viewed diary day (shared by diary and add screens). */
export const view = { date: dayKey() };

/** Food by id (local database or saved custom/online food). @param {string} id */
export const foodById = (id) => local.get(id) ?? get('foods', id);

/** Localized food name. @param {{name: any}} f */
export const foodName = (f) => L(f.name);

/** 1.4.3 (part B): the meal for now, among the meals switched on in Profile. */
export const currentMeal = () => mealFor(new Date(), enabledMeals());

/** Diary rows for a day (water excluded), by time. @param {string} date */
export const dayRows = (date) =>
  all('food')
    .filter((r) => r.date === date && r.type !== 'water')
    .sort((a, b) => a.ts - b.ts);

/**
 * 1.5.0: a meal's name for the UI. An unplanned meal is named by its time (`at`, default its
 * entries' time): „Междинно сутрешно“ / „Междинно следобедно“ / „Допълнително хранене“.
 * @param {string} meal @param {string} date @param {number} [at]
 */
export function mealName(meal, date, at) {
  if (!isExtra(meal)) return t(`meal.${meal}`);
  const rows = dayRows(date);
  return t(`meal.${extraKind(at ?? mealTimeOf(rows, date, meal) ?? Date.now(), date, rows)}`);
}

/** Glasses of water on a day. @param {string} date */
export const water = (date) => get('food', `water_${date}`)?.glasses ?? 0;

/**
 * Set glasses of water. Adding to today's count emits `water:added` (small celebration).
 * @param {string} date @param {number} glasses
 */
export function setWater(date, glasses) {
  const before = water(date),
    n = Math.max(0, glasses);
  put('food', { id: `water_${date}`, type: 'water', date, glasses: n });
  if (n > before && date === dayKey()) emit('water:added', { glasses: n, before }); // micro animation
}

/**
 * Log a portion of a food.
 * @param {any} food Per-100 g food.
 * @param {number} grams
 * @param {string} meal
 * @param {string} [date]
 * @param {number} [at] 1.5.0: the time on the add page's clock (default: the meal's time).
 */
export function logFood(food, grams, meal, date = view.date, at = undefined) {
  if (food.source === 'custom')
    food = get('foods', food.id) ?? saveCustomFood(food); // 1.4.4: the saved (edited) one
  else if (food.source && !local.has(food.id)) put('foods', food);
  const use = kv('foodUse', {});
  setKv('foodUse', { ...use, [food.id]: bump(use[food.id], Date.now(), food.cat) }); // 1.4.4: points
  // 1.5.0: the time picked on the clock, else the meal's time (one per meal), else now / usual
  const ts = at ?? mealTimeOf(all('food'), date, meal) ?? mealTs(date, meal, dayKey());
  const row = put('food', {
    id: uid('f'),
    date,
    meal,
    ts,
    time: hhmm(new Date(ts)),
    foodId: food.id,
    name: food.name,
    emoji: food.emoji,
    grams,
    ...portion(food, grams),
    ...(food.missing?.length ? { missing: food.missing } : {}),
    ...(known(food.cr) ? { cr: food.cr } : {}), // 1.4.4: a custom food's creatine, g / 100 g
  });
  emit('food:logged', { meal, emoji: row.emoji ?? '🍽️' });
  return row;
}

/**
 * A diary row recomputed from its food's (corrected) per-100 g values at the row's grams
 * (1.4.0). Values the food still lacks stay in `missing`; unknown fiber/salt are dropped.
 * Pure. @param {any} row @param {any} food
 */
export function rowFromFood(row, food) {
  const out = { ...row, name: food.name, ...portion(food, row.grams) };
  if (!known(food.fib)) delete out.fib;
  if (!known(food.salt)) delete out.salt;
  if (!known(food.sat)) delete out.sat;
  if (!known(food.sug)) delete out.sug;
  if (food.missing?.length) out.missing = food.missing;
  else delete out.missing;
  return out;
}

/**
 * 1.4.0: save the user's corrected values with the food (so the next scan of the barcode
 * uses them) and update the diary rows of that food that still had missing values, plus
 * `rowId` (the row being edited). Returns the updated rows.
 * @param {any} food Corrected food (logic.applyFix). @param {string} [rowId]
 */
export function saveFoodFix(food, rowId) {
  put('foods', food);
  return all('food')
    .filter((r) => r.foodId === food.id && (r.id === rowId || r.missing?.length))
    .map((r) => put('food', rowFromFood(r, food)));
}

/**
 * Log ready-made diary rows (e.g. voice entries with their own nutrition, day, meal and
 * time). One micro animation for the batch.
 * @param {{date: string, meal: string, ts: number, time: string, name: string, emoji?: string,
 *   grams: number, kcal: number, p: number, c: number, f: number, fib?: number, salt?: number,
 *   source?: string}[]} rows
 */
export function logRows(rows) {
  const saved = rows.map((r) => put('food', { ...r, id: uid('f') }));
  if (saved.length) emit('food:logged', { meal: saved[0].meal, emoji: saved[0].emoji ?? '🍽️' });
  return saved;
}

/** Remove a diary row for good (no bin – see views for delete-with-undo). @param {string} id */
export const unlog = (id) => remove('food', id);

/**
 * Change a diary row's grams (nutrition scales) and/or move it to another meal.
 * @param {string} id
 * @param {{grams?: number, meal?: string}} change
 * @returns {{before: any, after: any}|null}
 */
export function editRow(id, change) {
  const before = get('food', id);
  if (!before) return null;
  let after =
    change.grams != null && change.grams !== before.grams
      ? scaleRow(before, change.grams, before.foodId ? foodById(before.foodId) : null)
      : { ...before };
  if (change.meal && change.meal !== before.meal) {
    // 1.5.0: moved into another meal → it takes that meal's time (one time per meal)
    const ts = mealTimeOf(
      all('food').filter((r) => r.id !== id),
      before.date,
      change.meal,
    );
    after = { ...after, meal: change.meal, ...(ts ? { ts, time: hhmm(new Date(ts)) } : {}) };
  }
  put('food', after);
  return { before, after };
}

/** Saved regular meals, most used first. */
export const savedMeals = () => all('meals').sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));

/** Name as compared for duplicates (trimmed, single spaces, case-insensitive). @param {string} n */
const nameKey = (n) => n.trim().replace(/\s+/g, ' ').toLocaleLowerCase('bg');

/**
 * Why a combination name can't be used: 'food.comboNeedName' (empty) or 'food.comboNameTaken'
 * (another combination has it), else null.
 * @param {string} name
 * @param {string} [selfId] The combination being renamed (its own name is fine).
 * @returns {string|null}
 */
export function comboNameError(name, selfId) {
  const k = nameKey(name ?? '');
  if (!k) return 'food.comboNeedName';
  return all('meals').some((m) => m.id !== selfId && nameKey(m.name ?? '') === k) ? 'food.comboNameTaken' : null;
}

/**
 * Rename a combination (the caller validates with {@link comboNameError}).
 * @param {string} id @param {string} name
 * @returns {any} The updated combination, or null if it no longer exists.
 */
export function renameMeal(id, name) {
  const m = get('meals', id);
  return m ? put('meals', { ...m, name: name.trim().replace(/\s+/g, ' ') }) : null;
}

/**
 * Save a regular meal (combination) from diary rows, with each item's grams and nutrition.
 * @param {string} name
 * @param {any[]} rows
 * @returns {any} The saved meal.
 */
export const saveMeal = (name, rows) =>
  put('meals', {
    id: uid('meal'),
    name,
    uses: 0,
    items: rows.map(({ foodId, name: n, emoji, grams, kcal, p, c, f, fib, salt, sat, sug }) => ({
      foodId,
      name: n,
      emoji,
      grams,
      kcal,
      p,
      c,
      f,
      ...(known(fib) ? { fib } : {}),
      ...(known(salt) ? { salt } : {}),
      ...(known(sat) ? { sat } : {}),
      ...(known(sug) ? { sug } : {}),
    })),
  });

/**
 * Log all items of a saved meal in one go.
 * @param {string} id
 * @param {string} meal
 * @returns {{rows: any[], before: any}|null} The new diary rows and the meal as it was (for Undo).
 */
export function logSavedMeal(id, meal) {
  const m = get('meals', id);
  if (!m) return null;
  const ts = mealTimeOf(all('food'), view.date, meal) ?? mealTs(view.date, meal, dayKey()); // 1.5.0
  const rows = m.items.map((/** @type {any} */ it, /** @type {number} */ i) =>
    put('food', { ...it, id: uid('f'), date: view.date, meal, ts: ts + i, time: hhmm(new Date(ts)) }),
  );
  put('meals', { ...m, uses: (m.uses ?? 0) + 1 });
  emit('food:logged', { meal, emoji: m.items[0]?.emoji ?? '🍽️' });
  return { rows, before: m };
}

/** Categories ordered by usage points (1.4.4: with decay; ties keep the default order). */
export const categoriesByUse = () => categoriesByPoints(FOOD_CATEGORIES, kv('foodUse', {}), Date.now());

/** Recently used foods (most recent first). @param {number} [max] */
export const recentFoods = (max = 8) =>
  Object.entries(kv('foodUse', {}))
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([id]) => foodById(id))
    .filter(Boolean)
    .slice(0, max);

/** Quick picks: personal most-used foods (by points), topped up with defaults. */
export function quickPicks() {
  const used = byPoints(kv('foodUse', {}), Date.now(), (id) => !!foodById(id));
  return [...new Set([...used.slice(0, 6), ...QUICK_PICKS])].slice(0, 6).map(foodById).filter(Boolean);
}

/** 1.4.4: favorite food ids (manual ☆, on the device) → when they were starred. */
export const favorites = () => /** @type {Record<string, number>} */ (kv('foodFav', {}));

/** Is the food a favorite? @param {string} id */
export const isFav = (id) => !!favorites()[id];

/** Star / unstar a food. @param {string} id @returns {boolean} starred now */
export function toggleFav(id) {
  const f = { ...favorites() };
  const on = !f[id];
  if (on) f[id] = Date.now();
  else delete f[id];
  setKv('foodFav', f);
  return on;
}

/** 1.4.4: foods the user entered by hand (Ръчно добавени храни), newest first. */
export const customFoods = () =>
  all('foods')
    .filter((f) => f.source === 'custom')
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0) || String(b.id).localeCompare(String(a.id)));

/** Is it a food the user may edit / delete (their own, not the built-in database)? @param {any} f */
export const isCustom = (f) => !!f && f.source === 'custom' && !local.has(f.id);

/**
 * 1.4.4: save a new custom food right away (so it is in Ръчно добавени храни even if it is
 * never added to the diary). @param {any} food
 */
export const saveCustomFood = (food) => put('foods', { created: Date.now(), ...food, source: 'custom' });

/**
 * 1.4.4: change a custom food's values / name / photo. Diary rows keep the values they were
 * logged with (rows are copies; see logic.matchesFood). Built-in foods are never changed.
 * @param {string} id @param {Record<string, any>} change Keys set to undefined are removed.
 * @returns {any|null} The saved food.
 */
export function updateCustomFood(id, change) {
  const before = get('foods', id);
  if (!isCustom(before)) return null;
  const after = { ...before, ...change, id, source: 'custom' };
  for (const k of Object.keys(after)) if (after[k] === undefined) delete after[k];
  return put('foods', after);
}

/** All favorite foods (built-in, custom or online ones that were saved), starred order. */
export const favoriteFoods = () =>
  Object.entries(favorites())
    .sort((a, b) => a[1] - b[1])
    .map(([id]) => foodById(id))
    .filter(Boolean);

/**
 * 1.4.4: a food list in the add screen's order: favorites, the 5 most used, the rest.
 * @param {any[]} list
 */
export const orderedFoods = (list) => groupFoods(list, favorites(), kv('foodUse', {}), Date.now());

/**
 * Local search across both languages.
 * @param {string} q
 */
export function searchLocal(q) {
  // 1.4.3 round 2: by words (stems, гърди = филе), built-in foods first (see ./search.js)
  return searchFoods(FOODS, all('foods'), q, (/** @type {any} */ f) =>
    typeof f.name === 'string' ? f.name : `${f.name.en} ${f.name.bg}`,
  );
}
