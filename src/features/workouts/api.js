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
import { canResume, estimateMinutes, newItems, planFromItems } from './logic.js';

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

/** 1.6.3: id of a free workout („Свободна тренировка“) – no plan behind it. */
export const FREE_PLAN = 'free';

/** 1.6.3: is this workout / session a free one? @param {any} w */
export const isFree = (w) => w?.planId === FREE_PLAN;

/**
 * 1.6.3 „Започни празна тренировка“ (Ralitsa #8): the normal workout logger with no
 * exercises; she adds them from the whole library while training (session.addExercise).
 * A running workout is resumed instead (as for a plan).
 */
export function startFreeWorkout() {
  if (activeWorkout()) return activeWorkout();
  const w = {
    id: uid('s'),
    planId: FREE_PLAN,
    name: { bg: 'Свободна тренировка', en: 'Free workout' },
    startedAt: Date.now(),
    items: [],
    rest: null,
  };
  setKv('active', w);
  return w;
}

/**
 * 1.6.3 „Запази като план“ after a free workout: a new plan (no days, at the end of the list)
 * from the exercises done – sets / reps / kg / rest as logged. Once per session (the plan id
 * is kept on the session). @param {any} session @param {string} name
 * @returns {Plan|null} null if nothing was done or the name is empty
 */
export function savePlanFrom(session, name) {
  const n = String(name ?? '')
    .trim()
    .slice(0, 60);
  if (!session || !n) return null;
  if (session.savedPlanId && get('plans', session.savedPlanId)) return get('plans', session.savedPlanId);
  const items = planFromItems(session.items ?? []);
  if (!items.length) return null;
  const plan = {
    id: uid('plan'),
    name: n,
    sub: '',
    place: /** @type {'gym'} */ ('gym'),
    days: [],
    builtin: false,
    items,
    order: plans().length,
  };
  put('plans', plan);
  put('sessions', { ...session, savedPlanId: plan.id });
  return plan;
}

/** Minutes estimate for a plan. @param {Plan} p */
export const planMinutes = (p) => estimateMinutes(p.items);
