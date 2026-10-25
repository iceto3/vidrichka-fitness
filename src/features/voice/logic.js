/**
 * Voice logging maths (pure): the request context, choosing each entry's meal, and
 * turning parsed entries into diary rows and glasses of water (1.3.1: saved directly,
 * with Undo – no confirm step).
 * @module features/voice/logic
 */

export const MAX_TEXT = 500;
export const MEALS = ['breakfast', 'lunch', 'snack', 'dinner'];
/** Typical time of a meal when the sentence gave none (for past days). */
const MEAL_TIME = { breakfast: '08:00', lunch: '13:00', snack: '16:00', dinner: '19:30' };

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** Local YYYY-MM-DD. @param {Date} d */
export const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
/** Local HH:MM. @param {Date} d */
export const localHM = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

/**
 * Body of POST /parse: the text plus the phone's local date, time and time zone, so
 * "вчера вечерта" / "this morning" resolve to the right day.
 * @param {string} text @param {Date} now @param {string} lang
 */
export const requestBody = (text, now, lang) => ({
  text: text.replace(/\s+/g, ' ').trim().slice(0, MAX_TEXT),
  today: localDay(now),
  time: localHM(now),
  tz: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
  lang,
});

/**
 * @typedef {{type: 'food', name: string, amount: string, grams: number, kcal: number, protein: number,
 *   carbs: number, fat: number, fiber?: number|null, salt?: number|null, meal: string, meal_named?: boolean,
 *   date: string, time: string|null}} FoodEntry
 * @typedef {{type: 'water', amount_ml: number, glasses?: number, meal: string, meal_named?: boolean, date: string, time: string|null}} WaterEntry
 * @typedef {FoodEntry | WaterEntry} Entry
 */

/** Glasses for an amount of water (at least one). @param {number} ml @param {number} glassMl */
export const glassesFor = (ml, glassMl) => Math.max(1, Math.round(ml / (glassMl || 250)));

/**
 * Prepare server entries for saving: water becomes glasses.
 * @param {any[]} list @param {number} glassMl @returns {Entry[]}
 */
export const prepare = (list, glassMl) =>
  list.map((e) => (e.type === 'water' ? { ...e, glasses: glassesFor(e.amount_ml, glassMl) } : e));

/**
 * Which meal each entry goes to:
 * 1. the meal named in the sentence ("запиши в закуска …") always wins;
 * 2. a said time ("на обяд", "в 8") or a past day keeps the meal the server inferred;
 * 3. otherwise (today, nothing said) the meal of the Food › Add screen it was opened from,
 *    else the current meal by time of day.
 * @param {Entry[]} list
 * @param {{today: string, screenMeal?: string, defaultMeal: string}} o
 * @returns {Entry[]}
 */
export const assignMeals = (list, o) =>
  list.map((e) => {
    if (e.meal_named && MEALS.includes(e.meal)) return e;
    if (e.time || e.date !== o.today) return MEALS.includes(e.meal) ? e : { ...e, meal: o.defaultMeal };
    return { ...e, meal: o.screenMeal && MEALS.includes(o.screenMeal) ? o.screenMeal : o.defaultMeal };
  });

/**
 * Timestamp of an entry: its own time, else now (today) or the meal's usual time (past day).
 * @param {{date: string, time: string|null, meal: string}} e @param {Date} now
 */
export function entryTs(e, now) {
  if (e.time) return new Date(`${e.date}T${e.time}`).getTime();
  if (e.date === localDay(now)) return now.getTime();
  return new Date(`${e.date}T${MEAL_TIME[e.meal] ?? '12:00'}`).getTime();
}

/**
 * Diary rows (the food store's shape) for the food entries (fiber/salt when the server sent them).
 * @param {Entry[]} list @param {Date} now
 */
export const foodRows = (list, now) =>
  list
    .filter((e) => e.type === 'food')
    .map((e, i) => {
      const f = /** @type {FoodEntry} */ (e),
        ts = entryTs(f, now) + i;
      return {
        date: f.date,
        meal: MEALS.includes(f.meal) ? f.meal : 'snack',
        ts,
        time: localHM(new Date(ts)),
        name: f.name,
        emoji: emojiFor(f.name),
        grams: f.grams,
        kcal: f.kcal,
        p: f.protein,
        c: f.carbs,
        f: f.fat,
        ...(typeof f.fiber === 'number' && f.fiber >= 0 ? { fib: f.fiber } : {}),
        ...(typeof f.salt === 'number' && f.salt >= 0 ? { salt: f.salt } : {}),
        source: 'voice',
      };
    });

/** Glasses of water to add per day. @param {Entry[]} list @returns {Record<string, number>} */
export const waterByDay = (list) =>
  list.reduce((a, e) => (e.type === 'water' ? { ...a, [e.date]: (a[e.date] ?? 0) + (e.glasses ?? 1) } : a), {});

const EMOJI = [
  [/овес|oat|мюсли|granola|каша|porridge/i, '🥣'],
  [/банан|banana/i, '🍌'],
  [/ябъл|apple/i, '🍎'],
  [/яйц|яйце|egg/i, '🥚'],
  [/хляб|филия|тост|bread|toast/i, '🍞'],
  [/кафе|coffee/i, '☕'],
  [/чай|tea\b/i, '🍵'],
  [/мляко|milk/i, '🥛'],
  [/кисело мляко|йогурт|yog/i, '🥛'],
  [/сирене|кашкавал|cheese/i, '🧀'],
  [/пиле|chicken/i, '🍗'],
  [/месо|кюфте|кебап|пържола|meat|beef|pork|steak/i, '🥩'],
  [/риба|сьомга|тон|fish|salmon|tuna/i, '🐟'],
  [/салата|salad/i, '🥗'],
  [/ориз|rice/i, '🍚'],
  [/паста|спагети|макарон|pasta|spaghetti/i, '🍝'],
  [/пица|pizza/i, '🍕'],
  [/супа|чорба|soup/i, '🍲'],
  [/картоф|potato|fries/i, '🥔'],
  [/шоколад|chocolate/i, '🍫'],
  [/сок|juice/i, '🧃'],
  [/бира|beer/i, '🍺'],
  [/вино|wine/i, '🍷'],
  [/ядки|бадем|орех|nut|almond/i, '🥜'],
  [/протеин|protein/i, '💪'],
  [/лютеница|кетчуп|доматен сос|ketchup/i, '🥫'],
  [/сода|газирана|кола|лимонада|soda|cola/i, '🥤'],
  [/домат|tomato/i, '🍅'],
  [/краставиц|cucumber/i, '🥒'],
];
/** A fitting emoji for a food name (fallback 🍽️). @param {string} name */
export const emojiFor = (name) =>
  /** @type {string} */ (EMOJI.find(([re]) => /** @type {RegExp} */ (re).test(name))?.[1] ?? '🍽️');
