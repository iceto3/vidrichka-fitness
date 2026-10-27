/**
 * Validation of the app's request and of the model's answer. Everything the model returns
 * is re-checked and clamped here, so the app only ever receives well-formed entries.
 * @module parse
 */
import { MEALS } from './prompt.js';

export class Invalid extends Error {
  /** @param {string} code @param {number} [status] */
  constructor(code, status = 400) {
    super(code);
    this.status = status;
  }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/,
  HM = /^([01]\d|2[0-3]):[0-5]\d$/,
  TZ = /^[A-Za-z0-9_+\-/]{1,64}$/;
export const MAX_ENTRIES = 20;

/** Days between two YYYY-MM-DD strings (b − a). @param {string} a @param {string} b */
const dayDiff = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/**
 * Check the app's request body.
 * @param {any} b Parsed JSON.
 * @param {number} maxText
 * @returns {{text: string, today: string, time: string, tz: string, weekday: string, lang: string}}
 */
export function checkRequest(b, maxText) {
  if (!b || typeof b !== 'object') throw new Invalid('bad-body');
  const text = typeof b.text === 'string' ? b.text.replace(/\s+/g, ' ').trim() : '';
  if (!text) throw new Invalid('empty');
  if (text.length > maxText) throw new Invalid('too-long', 413);
  if (typeof b.today !== 'string' || !DAY.test(b.today) || Number.isNaN(Date.parse(b.today)))
    throw new Invalid('bad-today');
  if (typeof b.time !== 'string' || !HM.test(b.time)) throw new Invalid('bad-time');
  if (typeof b.tz !== 'string' || !TZ.test(b.tz)) throw new Invalid('bad-tz');
  const weekday = new Date(`${b.today}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', timeZone: 'UTC' });
  return { text, today: b.today, time: b.time, tz: b.tz, weekday, lang: b.lang === 'en' ? 'en' : 'bg' };
}

/** @param {any} v @param {number} max @param {number} [dp] */
const num = (v, max, dp = 0) => {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  const k = 10 ** dp;
  return Math.round(Math.min(n, max) * k) / k;
};
/** Like num, but null stays null (unknown), e.g. fiber/salt. @param {any} v @param {number} max @param {number} dp */
const opt = (v, max, dp) => (v === null || v === undefined || v === '' ? null : num(v, max, dp));
/** @param {any} v @param {number} max */
const str = (v, max) => (typeof v === 'string' ? v.replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max) : '');
/** Default meal by local time. @param {string} hm */
export const mealAt = (hm) => {
  const h = Number(hm.slice(0, 2));
  return h >= 4 && h < 11 ? 'breakfast' : h >= 11 && h < 15 ? 'lunch' : h >= 18 && h < 23 ? 'dinner' : 'snack';
};

/**
 * Normalize the model's JSON into app entries.
 * @param {any} out Parsed model output.
 * @param {{today: string, time: string}} q
 * @returns {({type: 'steps'|'sleep'|'weight'|'mood'|'energy', value: number|null, quality?: number|null, total?: boolean, meal: string, date: string, time: null} | {type: 'food', name: string, amount: string, grams: number, kcal: number, protein: number, carbs: number, fat: number, fiber: number|null, salt: number|null, meal: string, meal_named: boolean, date: string, time: string|null} | {type: 'water', amount_ml: number, meal: string, meal_named: boolean, date: string, time: string|null})[]}
 */
export function normalize(out, q) {
  const list = Array.isArray(out?.entries) ? out.entries.slice(0, MAX_ENTRIES) : null;
  if (!list) throw new Invalid('bad-model-output', 502);
  /** @type {any[]} */
  const res = [];
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    let date = typeof e.date === 'string' && DAY.test(e.date) ? e.date : q.today;
    const back = dayDiff(date, q.today);
    if (!(back >= 0 && back <= 7)) date = q.today; // no future, at most a week back
    const time = typeof e.time === 'string' && HM.test(e.time) ? e.time : null;
    const named = e.meal_named === true && MEALS.includes(e.meal);
    const meal = MEALS.includes(e.meal) ? e.meal : mealAt(time ?? q.time);
    if (e.type === 'water') {
      const ml = num(e.amount_ml, 5000);
      if (ml >= 10) res.push({ type: 'water', amount_ml: ml, meal, meal_named: named, date, time });
      continue;
    }
    if (e.type === 'steps') {
      const n = Math.round(num(e.value, 100000));
      if (n > 0) res.push({ type: 'steps', value: n, total: e.total === true, date, time: null, meal });
      continue;
    }
    if (e.type === 'sleep') {
      const h = e.value == null ? null : num(e.value, 16, 1);
      const qn = e.quality == null ? null : Math.round(num(e.quality, 5));
      const qq = qn != null && qn >= 1 ? qn : null;
      if ((h != null && h > 0) || qq != null)
        res.push({ type: 'sleep', value: h != null && h > 0 ? h : null, quality: qq, date, time: null, meal });
      continue;
    }
    if (e.type === 'weight') {
      const kg = num(e.value, 400, 1);
      if (kg >= 20) res.push({ type: 'weight', value: kg, date, time: null, meal });
      continue;
    }
    if (e.type === 'mood' || e.type === 'energy') {
      const r = Math.round(num(e.value, 5));
      if (r >= 1) res.push({ type: e.type, value: r, date, time: null, meal });
      continue;
    }
    if (e.type !== 'food') continue;
    const name = str(e.name, 60);
    if (!name) continue;
    res.push({
      type: 'food',
      name,
      amount: str(e.amount, 40),
      grams: num(e.grams, 3000) || 100,
      kcal: num(e.kcal, 5000),
      protein: num(e.protein, 500, 1),
      carbs: num(e.carbs, 800, 1),
      fat: num(e.fat, 500, 1),
      fiber: opt(e.fiber, 200, 1),
      salt: opt(e.salt, 100, 2),
      meal,
      meal_named: named,
      date,
      time,
    });
  }
  return res;
}
