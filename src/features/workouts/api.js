/**
 * Public API of the workouts feature: plans (seeded from data/workouts.js), sessions,
 * today's plan and the active workout. Other features import only this file.
 * @module features/workouts/api
 */
import { all, get, kv, put, setKv, uid } from '../../core/store.js';
import { L } from '../../core/i18n.js';
import { dayKey, weekdayMon } from '../../core/dates.js';
import { html } from '../../ui/dom.js';
import { ic } from '../../ui/icons.js';
import { t } from '../../core/i18n.js';
import { PLANS } from '../../data/workouts.js';
import { canResume, estimateMinutes, newItems } from './logic.js';

export { estimateMinutes };

/** @typedef {import('../../data/workouts.js').Plan & {order?: number}} Plan */

/** Copy built-in plans into the store once (deleted ones are not re-added). */
export function seedPlans() {
  const seeded = kv('seededPlans', []);
  const fresh = PLANS.filter((p) => !seeded.includes(p.id));
  if (!fresh.length) return;
  fresh.forEach((p, i) => put('plans', { ...structuredClone(p), order: seeded.length + i }));
  setKv('seededPlans', [...seeded, ...fresh.map((p) => p.id)]);
}

/** All plans in display order. @returns {Plan[]} */
export const plans = () => all('plans').sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

/** Localized plan name. @param {{name: any}|undefined} p */
export const planName = (p) => L(p?.name) || '—';

/** Finished sessions, newest first. */
export const sessions = () => all('sessions').sort((a, b) => b.endedAt - a.endedAt);

/** Plan scheduled for a date (default today), if any. @param {Date} [d] */
export const planFor = (d = new Date()) => plans().find((p) => p.days.includes(weekdayMon(d)));

/** The next scheduled plan after today (for "next up"). */
export function nextPlan() {
  for (let i = 1; i <= 7; i++) {
    const d = new Date(Date.now() + i * 864e5),
      p = planFor(d);
    if (p) return { plan: p, date: d };
  }
  return null;
}

/** The in-progress workout, or null. */
export const activeWorkout = () => kv('active', null);

/**
 * 1.4.3 (part B): can this saved workout be finished now (a partial one of today, no workout
 * running)? @param {any} s
 */
export const resumable = (s) => canResume(s, dayKey(), (ts) => dayKey(new Date(ts)), !!activeWorkout());

/** 1.4.3 (part B): today's newest partial workout that can still be finished, or null. */
export const resumableToday = () => sessions().find(resumable) ?? null;

/**
 * 1.4.3 (part B): the „Довърши тренировката с Видричка“ button (shown wherever a partial
 * workout is, only while it can be finished – the same day). The `resume/:id` route does it.
 * @param {any} s A saved session. @param {string} [cls] Extra classes.
 */
export const resumeButton = (s, cls = '') =>
  resumable(s)
    ? html`<button class="btn resumebtn ${cls}" data-go="resume/${s.id}">${ic('play', 18, 2.2)}${t('workout.resumeVidrichka')}</button>`
    : '';

/**
 * Start a workout from a plan (or resume the active one).
 * @param {string} planId
 */
export function startWorkout(planId) {
  if (activeWorkout()) return activeWorkout();
  const plan = get('plans', planId);
  if (!plan) throw new Error(`unknown plan ${planId}`);
  const w = {
    id: uid('s'),
    planId,
    name: plan.name,
    startedAt: Date.now(),
    items: newItems(plan.items, sessions()),
    rest: null,
  };
  setKv('active', w);
  return w;
}

/** Minutes estimate for a plan. @param {Plan} p */
export const planMinutes = (p) => estimateMinutes(p.items);
