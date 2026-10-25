/**
 * Public API of the food feature: diary rows, water, saved meals, foods (local database
 * + custom/online cached), usage stats for "most used" ordering.
 * @module features/food/api
 */
import { all, get, kv, put, remove, setKv, uid } from '../../core/store.js';
import { emit } from '../../core/bus.js';
import { L } from '../../core/i18n.js';
import { dayKey, hhmm } from '../../core/dates.js';
import { FOODS, FOOD_CATEGORIES, QUICK_PICKS } from '../../data/foods.js';
import { portion } from './logic.js';

export { FOODS, FOOD_CATEGORIES, QUICK_PICKS };

const local = new Map(FOODS.map((f) => [f.id, f]));

/** Currently viewed diary day (shared by diary and add screens). */
export const view = { date: dayKey() };

/** Food by id (local database or saved custom/online food). @param {string} id */
export const foodById = (id) => local.get(id) ?? get('foods', id);

/** Localized food name. @param {{name: any}} f */
export const foodName = (f) => L(f.name);

/** Diary rows for a day (water excluded), by time. @param {string} date */
export const dayRows = (date) =>
  all('food')
    .filter((r) => r.date === date && r.type !== 'water')
    .sort((a, b) => a.ts - b.ts);

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
 */
export function logFood(food, grams, meal, date = view.date) {
  if (food.source && !local.has(food.id)) put('foods', food);
  const use = kv('foodUse', {});
  setKv('foodUse', { ...use, [food.id]: { n: (use[food.id]?.n ?? 0) + 1, ts: Date.now(), cat: food.cat } });
  const ts = date === dayKey() ? Date.now() : new Date(`${date}T12:00`).getTime();
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
  });
  emit('food:logged', { meal, emoji: row.emoji ?? '🍽️' });
  return row;
}

/**
 * Log ready-made diary rows (e.g. confirmed voice entries with their own nutrition, day,
 * meal and time). One micro animation for the batch.
 * @param {{date: string, meal: string, ts: number, time: string, name: string, emoji?: string,
 *   grams: number, kcal: number, p: number, c: number, f: number, source?: string}[]} rows
 */
export function logRows(rows) {
  const saved = rows.map((r) => put('food', { ...r, id: uid('f') }));
  if (saved.length) emit('food:logged', { meal: saved[0].meal, emoji: saved[0].emoji ?? '🍽️' });
  return saved;
}

/** Remove a diary row. @param {string} id */
export const unlog = (id) => remove('food', id);

/** Saved regular meals, most used first. */
export const savedMeals = () => all('meals').sort((a, b) => (b.uses ?? 0) - (a.uses ?? 0));

/**
 * Save a regular meal from diary rows.
 * @param {string} name
 * @param {any[]} rows
 */
export const saveMeal = (name, rows) =>
  put('meals', {
    id: uid('meal'),
    name,
    uses: 0,
    items: rows.map(({ foodId, name: n, emoji, grams, kcal, p, c, f }) => ({
      foodId,
      name: n,
      emoji,
      grams,
      kcal,
      p,
      c,
      f,
    })),
  });

/**
 * Log all items of a saved meal in one tap.
 * @param {string} id
 * @param {string} meal
 */
export function logSavedMeal(id, meal) {
  const m = get('meals', id);
  if (!m) return;
  const ts = view.date === dayKey() ? Date.now() : new Date(`${view.date}T12:00`).getTime();
  m.items.forEach((/** @type {any} */ it, /** @type {number} */ i) =>
    put('food', { ...it, id: uid('f'), date: view.date, meal, ts: ts + i, time: hhmm(new Date(ts)) }),
  );
  put('meals', { ...m, uses: (m.uses ?? 0) + 1 });
  emit('food:logged', { meal, emoji: m.items[0]?.emoji ?? '🍽️' });
}

/** Category ids ordered by usage (most used first, ties keep default order). */
export function categoriesByUse() {
  const use = Object.values(kv('foodUse', {}));
  /** @type {Record<string, number>} */
  const n = {};
  use.forEach((u) => u.cat && (n[u.cat] = (n[u.cat] ?? 0) + u.n));
  return [...FOOD_CATEGORIES].sort((a, b) => (n[b.id] ?? 0) - (n[a.id] ?? 0));
}

/** Recently used foods (most recent first). @param {number} [max] */
export const recentFoods = (max = 8) =>
  Object.entries(kv('foodUse', {}))
    .sort((a, b) => b[1].ts - a[1].ts)
    .map(([id]) => foodById(id))
    .filter(Boolean)
    .slice(0, max);

/** Quick picks: personal most-used foods, topped up with defaults. */
export function quickPicks() {
  const used = Object.entries(kv('foodUse', {}))
    .sort((a, b) => b[1].n - a[1].n)
    .map(([id]) => id);
  return [...new Set([...used.slice(0, 6), ...QUICK_PICKS])].slice(0, 6).map(foodById).filter(Boolean);
}

/**
 * Local search across both languages.
 * @param {string} q
 */
export function searchLocal(q) {
  const s = q.trim().toLowerCase();
  if (!s) return [];
  const pool = [...FOODS, ...all('foods')];
  return pool
    .filter((f) => (typeof f.name === 'string' ? f.name : `${f.name.en} ${f.name.bg}`).toLowerCase().includes(s))
    .slice(0, 30);
}
