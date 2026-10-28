/**
 * 1.4.0 Day cards: ONE set of date-parameterized cards (steps, sleep, mood & energy, water,
 * meals, workouts) and their entry sheets. Home shows them for today; the day view
 * (`#day/<date>`, opened from the Progress calendar) shows them for any past day, and the
 * Food diary reuses the water card. Every read and write goes through ../api.js.
 *
 * Use: put `stepsCard(date)` etc. in a view and spread `cardActions(() => date)` into its
 * actions. Cards only emit `data-act` names from CARD_ACTS, so they never clash.
 * @module features/day/views/cards
 */
import { html, raw } from '../../../ui/dom.js';
import { L, fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { dayKey, durationMin, parseDay } from '../../../core/dates.js';
import { settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { bar, stepper } from '../../../ui/components.js';
import { closeSheet, confirmDialog, openSheet, toast } from '../../../ui/sheet.js';
import { FACES, scale } from '../../daily/views/checkin.js';
import { MEALS, MEAL_STYLE, totals } from '../../food/logic.js';
import { foodName, view as foodView } from '../../food/api.js';
import {
  DayEditError,
  MAX_GLASSES,
  addDaySteps,
  clearDaySleep,
  rateDayField,
  readDay,
  setDaySleep,
  setDaySteps,
  setDayWater,
  stepGoal,
  stepRun,
} from '../api.js';

/** Default hours offered when no sleep is recorded yet (1.4.0: 7.5 h instead of 7). */
export const DEFAULT_SLEEP_H = 7.5;

const isToday = (/** @type {string} */ date) => date === dayKey();

/** Run a day write; a refused date/value shows a short message instead of throwing. @param {() => any} fn */
export function safely(fn) {
  try {
    return fn();
  } catch (e) {
    if (e instanceof DayEditError) return void toast(t(`day.err.${e.code}`));
    throw e;
  }
}

/** Steps card. @param {string} date */
export function stepsCard(date) {
  const d = readDay(date),
    n = d.steps ?? 0,
    goal = stepGoal(),
    today = isToday(date),
    run = today ? stepRun() : 0,
    done = n >= goal;
  return html`<section class="card mt12 pad14 stepscard${done ? ' done' : ''}" aria-label="${t(today ? 'steps.title' : 'day.steps')}">
<div class="row gap10"><span class="sq teal">${ic('steps', 20, 2.1)}</span><div class="f1 minw0"><div class="b">${t(today ? 'steps.title' : 'day.steps')}</div>
<div class="muted xs b">${done ? t('steps.goalMet') : t('steps.left', { n: fmtNum(goal - n) })}${run ? html` · 🔥 ${t('steps.streak', { n: run })}` : ''}</div></div>
<div class="right"><span class="xb num big19 stepsn">${fmtNum(n)}</span><span class="muted xs b num"> / ${fmtNum(goal)}</span></div></div>
<div class="stepsbar mt10">${bar(n / goal, done ? 'var(--ok, #1FB46B)' : 'var(--accent)')}</div>
<div class="row gap8 mt10 wrap"><button class="chip" data-act="stepsAdd" data-n="1000">+1000</button><button class="chip" data-act="stepsAdd" data-n="2000">+2000</button>
<span class="f1"></span><button class="btn sm sec" data-act="stepsShot" aria-label="${t('shot.stepsAria')}">📷 ${t('shot.btn')}</button><button class="btn sm sec" data-act="stepsSheet">${ic('edit', 15, 2.4)}${t('steps.enter')}</button></div></section>`;
}

/** Steps entry sheet: add some or set the day's total (1.4.0: each button explained). @param {string} date */
export function openStepsSheet(date) {
  let v = '';
  openSheet({
    render:
      () => html`<h2 class="h2">${t(isToday(date) ? 'steps.title' : 'day.steps')}</h2><p class="muted small b mt4">${t('steps.manualHint')}</p>
<div class="row between mt12 b"><span>${isToday(date) ? t('steps.today') : fmtDate(parseDay(date), { weekday: 'short', day: 'numeric', month: 'short' })}</span><span class="num">${fmtNum(readDay(date).steps ?? 0)} / ${fmtNum(stepGoal())}</span></div>
<label class="field mt12"><span>${t('steps.count')}</span><input class="input num" id="stepsin" type="text" inputmode="numeric" data-input="v" value="${v}" placeholder="5000" autocomplete="off"></label>
<div class="row gap10 mt16"><button class="btn sec f1" data-act="set">${t('steps.setTotal')}</button><button class="btn f1" data-act="add">${ic('plus', 18, 2.8)}${t('steps.add')}</button></div>
<p class="muted xs b mt8 stepshelp">${t('steps.setHelp')}<br>${t('steps.addHelp')}</p>`,
    actions: {
      v: (el) => ((v = /** @type {HTMLInputElement} */ (el).value.replace(/\D/g, '')), false),
      add: () => {
        if (!Number(v)) return false;
        safely(() => addDaySteps(date, Number(v)));
        closeSheet();
        return false;
      },
      set: () => {
        if (v === '') return false;
        safely(() => setDaySteps(date, Number(v)));
        closeSheet();
        return false;
      },
    },
    mount: (el) => /** @type {HTMLInputElement|null} */ (el.querySelector('#stepsin'))?.focus(),
  });
}

/** Sleep card (the night before `date`). @param {string} date */
export function sleepCard(date) {
  const s = readDay(date).sleep,
    has = s.hours != null || s.q != null,
    title = t(isToday(date) ? 'sleep.cardTitle' : 'day.sleep');
  return html`<div class="card mt12 pad14 row gap10 sleepcard"><button class="row gap10 f1 minw0 left" data-act="sleepSheet"><span class="sq violet">${ic('moon', 20, 2.1)}</span>
<span class="f1 left minw0"><span class="b block">${title}</span><span class="muted xs b">${has ? t('sleep.cardSub') : t('sleep.cardAsk')}</span></span>
${has ? html`<span class="xb num big19">${s.hours == null ? '–' : `${fmtNum(s.hours, 1)} ${t('unit.h')}`}</span><span class="fs18">${s.q ? FACES[s.q - 1] : ''}</span>` : html`<span class="muted b num">0 ${t('unit.h')}</span>`}</button>
${has ? '' : html`<button class="chip accent chip-sm" data-act="sleepSheet">${t('sleep.add')}</button>`}
<button class="iconbtn flat sm" data-act="sleepShot" aria-label="${t('shot.sleepAria')}">📷</button></div>`;
}

/**
 * Sleep entry sheet: hours (½ h steps, 7.5 h offered when empty), quality 1–5 with words,
 * and (1.4.0) "Delete entry". Saved on every change. @param {string} date
 */
export function openSleepSheet(date) {
  openSheet({
    render: () => {
      const s = readDay(date).sleep;
      return html`<h2 class="h2">${t(isToday(date) ? 'sleep.cardTitle' : 'day.sleep')}</h2>
<div class="row between mt12"><span class="b">${t('sleep.hours')}</span>${stepper({ act: 'h', value: fmtNum(s.hours ?? DEFAULT_SLEEP_H, 1), unit: t('unit.h'), label: t('sleep.hours') })}</div>
${s.hours == null ? html`<p class="muted xs b mt4">${t('sleep.defaultHint', { n: fmtNum(DEFAULT_SLEEP_H, 1) })}</p>` : ''}
<h3 class="b mt16">${t('sleep.quality')}</h3>${scale('sleepQ', s.q ?? undefined, t('sleep.quality'))}
<div class="row gap10 mt16">${s.manual ? html`<button class="btn sec f1" data-act="clear">${ic('trash', 16, 2.2)}${t('sleep.delete')}</button>` : ''}<button class="btn f1" data-act="done">${t('common.done')}</button></div>`;
    },
    actions: {
      h: (el, ev) => {
        const cur = readDay(date).sleep.hours ?? DEFAULT_SLEEP_H;
        const typed = Number(/** @type {HTMLInputElement} */ (el).value?.replace(',', '.'));
        const v = ev.type === 'change' ? (Number.isFinite(typed) ? typed : cur) : cur + Number(el.dataset.d) * 0.5;
        safely(() => setDaySleep(date, { hours: Math.max(0, v) }));
      },
      rate: (el) => void safely(() => setDaySleep(date, { q: Number(el.dataset.v) })),
      done: () => {
        // Closing with the offered default saves it (the stepper showed it as the value).
        if (readDay(date).sleep.hours == null) safely(() => setDaySleep(date, { hours: DEFAULT_SLEEP_H }));
        closeSheet();
        return false;
      },
      clear: async () => {
        if (
          !(await confirmDialog({
            title: t('sleep.deleteQ'),
            body: t('sleep.deleteBody'),
            ok: t('common.remove'),
            danger: true,
          }))
        )
          return false;
        safely(() => clearDaySleep(date));
        closeSheet();
        return false;
      },
    },
  });
}

/** Mood & energy card (1–5 each). @param {string} date */
export function moodCard(date) {
  const d = readDay(date),
    cell = (/** @type {string} */ k, /** @type {number|null} */ v) =>
      html`<span class="f1 center"><span class="muted xs b block">${t(`sleep.${k}`)}</span><span class="fs22">${v ? FACES[v - 1] : '–'}</span><span class="xs b block">${v ? t(`scale.${k}${v}`) : '0'}</span></span>`;
  return html`<button class="card mt12 pad14 row gap10 moodcard w100" data-act="moodSheet" aria-label="${t('day.moodEnergy')}"><span class="sq warm">${ic('heart', 20, 2.1)}</span>
${cell('mood', d.mood)}${cell('energy', d.energy)}${ic('right', 16, 2.2, 'var(--muted)')}</button>`;
}

/** Mood & energy sheet. @param {string} date */
export function openMoodSheet(date) {
  openSheet({
    render: () => {
      const d = readDay(date);
      return html`<h2 class="h2">${t('day.moodEnergy')}</h2>
<h3 class="b mt12">${t('sleep.mood')}</h3>${scale('mood', d.mood ?? undefined, t('sleep.mood'))}
<h3 class="b mt16">${t('sleep.energy')}</h3>${scale('energy', d.energy ?? undefined, t('sleep.energy'))}
<div class="row gap10 mt16">${d.mood || d.energy ? html`<button class="btn sec f1" data-act="clear">${t('day.clearRatings')}</button>` : ''}<button class="btn f1" data-close>${t('common.done')}</button></div>`;
    },
    actions: {
      rate: (el) =>
        void safely(() =>
          rateDayField(
            date,
            /** @type {'mood'|'energy'} */ (el.dataset.f === 'energy' ? 'energy' : 'mood'),
            Number(el.dataset.v),
          ),
        ),
      clear: () => void safely(() => (rateDayField(date, 'mood', null), rateDayField(date, 'energy', null))),
    },
  });
}

/**
 * Water card: − on the left, the glasses in the middle (their size is fixed by design),
 * + on the right. − takes one glass away and never goes below 0.
 * @param {string} date
 */
export function waterCard(date) {
  const s = settings(),
    w = readDay(date).water ?? 0;
  return html`<div class="card mt12 row gap10 water"><div class="mic blue sm">${ic('drop', 20, 2.2)}</div>
<div class="f1 minw0"><div class="b">${t('food.water')}</div><div class="muted xs b">${t('food.glasses', { n: w, goal: s.waterGoal, l: fmtNum((w * s.glassMl) / 1000, 2) })}</div></div>
<button class="iconbtn sm bluebtn waterminus" data-act="water" data-n="${Math.max(0, w - 1)}" aria-label="${t('food.removeGlass')}" ${w > 0 ? '' : raw('disabled')}>${ic('minus', 18, 2.6)}</button>
<div class="row gap4 glasses" role="group" aria-label="${t('food.water')}">${Array.from({ length: Math.max(s.waterGoal, w) }, (_, k) => html`<button class="glass${k < w ? ' on' : ''}" data-act="water" data-n="${k < w && k === w - 1 ? k : k + 1}" aria-label="${t('food.setGlasses', { n: k + 1 })}"></button>`)}</div>
<button class="iconbtn sm bluebtn waterplus" data-act="water" data-n="${Math.min(MAX_GLASSES, w + 1)}" aria-label="${t('food.addGlass')}">${ic('plus', 18, 2.6)}</button></div>`;
}

/** Meals card (same rows and sheet as Food). @param {string} date */
export function mealsCard(date) {
  const d = readDay(date),
    rows = d.food,
    tot = d.totals,
    s = settings(),
    p = tot?.p ?? 0;
  const head = isToday(date) ? t('home.mealsToday') : t('day.food');
  return html`<section class="card mt12 meals homemeals" aria-label="${head}"><div class="row between mhead"><h2 class="h3 xb">${head}</h2><span class="b num small">${fmtNum(tot?.kcal ?? 0)} ${t('unit.kcal')}</span></div>
<div class="row gap12 small b muted dayfoodsum"><span class="${p > s.proteinGoal ? 'okc' : ''}">${t('food.protein')} <span class="num">${fmtNum(p)}/${s.proteinGoal} ${t('unit.g')}</span>${p >= s.proteinGoal ? ' ✓' : ''}</span>
<span>${t('food.fiber')} <span class="num">${fmtNum(tot?.fib ?? 0, 1)} ${t('unit.g')}</span></span><span>${t('food.salt')} <span class="num">${fmtNum(tot?.salt ?? 0, 1)} ${t('unit.g')}</span></span></div>
${MEALS.map(([m]) => {
  const items = rows.filter((r) => r.meal === m),
    [emo, bg] = MEAL_STYLE[m];
  if (!items.length)
    return html`<button class="meal" data-act="dayAddFood" data-m="${m}"><span class="mic muted-bg">${ic('plus', 20, 2.4)}</span><span class="f1"><span class="b muted block">${t(`meal.${m}`)}</span><span class="muted xs b">${t('food.nothing')}</span></span></button>`;
  return html`<button class="meal" data-act="dayMeal" data-m="${m}"><span class="mic" style="${raw(`background:${bg}`)}">${emo}</span><span class="f1 minw0"><span class="row gap8"><span class="b">${t(`meal.${m}`)}</span><span class="muted xs b">${items[0].time}</span></span>
<span class="muted small b ellip block">${items.map((r) => foodName(r)).join(', ')}</span></span><span class="b num nowrap">${fmtNum(totals(items).kcal)} <span class="muted xs">${t('unit.kcal')}</span></span></button>`;
})}</section>`;
}

/** Workouts finished on the day (tap → the saved workout, where it can be edited). @param {string} date */
export function workoutsCard(date) {
  const list = readDay(date).workouts;
  return html`<section class="card mt12 pad14 dayworkouts" aria-label="${t('day.workout')}"><div class="row gap10"><span class="sq acc">${ic('dumbbell', 20, 2.1)}</span><h2 class="h3 xb f1">${t('day.workout')}</h2><span class="b num">${list.filter((w) => !w.partial).length}</span></div>
${
  list.length
    ? html`<div class="list mt8">${list.map(
        (
          w,
        ) => html`<button class="lrow" data-go="history/${w.id}"><span class="f1 left minw0"><span class="b block">${L(w.name) || '—'}</span>
<span class="muted xs b">${t('day.workoutLine', { ex: w.exercises, sets: w.setsDone, min: durationMin(w.durationSec), vol: fmtNum(w.volume) })}</span></span>
${w.partial ? html`<span class="chip chip-sm">${t('summary.partial')}</span>` : ''}${w.prs ? html`<span class="chip warm chip-sm">${ic('trophy', 13, 2.4)}${w.prs}</span>` : ''}${ic('right', 16, 2.2, 'var(--muted)')}</button>`,
      )}</div>`
    : html`<p class="muted small b mt8">${t('day.noWorkout')}</p>`
}</section>`;
}

/** Action names the cards use (a view must not reuse them for something else). */
export const CARD_ACTS = /** @type {const} */ ([
  'stepsAdd',
  'stepsSheet',
  'stepsShot',
  'sleepSheet',
  'sleepShot',
  'moodSheet',
  'water',
  'dayMeal',
  'dayAddFood',
]);

/**
 * The cards' actions for a view showing `dateOf()`.
 * @param {() => string} dateOf @returns {Record<string, (el: HTMLElement, ev: Event) => any>}
 */
export function cardActions(dateOf) {
  return {
    stepsAdd: (el) => void safely(() => addDaySteps(dateOf(), Number(el.dataset.n))),
    stepsSheet: () => (openStepsSheet(dateOf()), false),
    stepsShot: async () => ((await import('./shot.js')).openShot('steps', dateOf()), false),
    sleepSheet: () => (openSleepSheet(dateOf()), false),
    sleepShot: async () => ((await import('./shot.js')).openShot('sleep', dateOf()), false),
    moodSheet: () => (openMoodSheet(dateOf()), false),
    water: (el) => {
      const date = dateOf(),
        before = readDay(date).water ?? 0,
        n = Math.max(0, Number(el.dataset.n));
      safely(() => setDayWater(date, n));
      if (n < before) toast(t('food.waterRemoved', { n }));
    },
    dayMeal: async (el) => {
      const { openMeal } = await import('../../food/views/diary.js');
      openMeal(el.dataset.m ?? 'snack', dateOf());
      return false;
    },
    dayAddFood: (el) => {
      foodView.date = dateOf();
      emit('nav', { path: `food/add/${el.dataset.m ?? 'snack'}` });
      return false;
    },
  };
}
