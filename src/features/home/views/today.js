/**
 * 1.3.4 Home cards for today: the steps challenge (progress bar + quick entry), last
 * night's sleep (hours + quality) and today's meals. A meal that already has food opens the
 * same meal sheet as Food (edit grams / move / delete, "+ Add to …", "Save as combination");
 * an empty one opens Add food, as before.
 * @module features/home/views/today
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { dayKey } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { bar, stepper } from '../../../ui/components.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { addSteps, clampSteps, setSteps, stepGoal, stepRun, steps } from '../../steps/api.js';
import { setSleep, sleepOf } from '../../daily/api.js';
import { FACES, scale } from '../../daily/views/checkin.js';
import { dayRows, foodName } from '../../food/api.js';
import { MEALS, MEAL_STYLE, totals } from '../../food/logic.js';

/** Steps card. */
export function stepsCard() {
  const n = steps(),
    goal = stepGoal(),
    run = stepRun(),
    done = n >= goal;
  return html`<section class="card mt12 pad14 stepscard${done ? ' done' : ''}" aria-label="${t('steps.title')}">
<div class="row gap10"><span class="sq teal">${ic('steps', 20, 2.1)}</span><div class="f1 minw0"><div class="b">${t('steps.title')}</div>
<div class="muted xs b">${done ? t('steps.goalMet') : t('steps.left', { n: fmtNum(goal - n) })}${run ? html` · 🔥 ${t('steps.streak', { n: run })}` : ''}</div></div>
<div class="right"><span class="xb num big19 stepsn">${fmtNum(n)}</span><span class="muted xs b num"> / ${fmtNum(goal)}</span></div></div>
<div class="stepsbar mt10">${bar(n / goal, done ? 'var(--ok, #1FB46B)' : 'var(--accent)')}</div>
<div class="row gap8 mt10"><button class="chip" data-act="stepsAdd" data-n="1000">+1000</button><button class="chip" data-act="stepsAdd" data-n="2000">+2000</button>
<span class="f1"></span><button class="btn sm sec" data-act="stepsSheet">${ic('edit', 15, 2.4)}${t('steps.enter')}</button></div></section>`;
}

/** Steps entry sheet: add some or set the day's total. */
export function openStepsSheet() {
  let v = '';
  openSheet({
    render: () => html`<h2 class="h2">${t('steps.title')}</h2><p class="muted small b mt4">${t('steps.manualHint')}</p>
<div class="row between mt12 b"><span>${t('steps.today')}</span><span class="num">${fmtNum(steps())} / ${fmtNum(stepGoal())}</span></div>
<label class="field mt12"><span>${t('steps.count')}</span><input class="input num" id="stepsin" type="text" inputmode="numeric" data-input="v" value="${v}" placeholder="5000" autocomplete="off"></label>
<div class="row gap10 mt16"><button class="btn sec f1" data-act="set">${t('steps.setTotal')}</button><button class="btn f1" data-act="add">${ic('plus', 18, 2.8)}${t('steps.add')}</button></div>`,
    actions: {
      v: (el) => ((v = /** @type {HTMLInputElement} */ (el).value.replace(/\D/g, '')), false),
      add: () => {
        if (!clampSteps(v)) return false;
        addSteps(dayKey(), Number(v));
        closeSheet();
        return false;
      },
      set: () => {
        if (v === '') return false;
        setSteps(dayKey(), Number(v));
        closeSheet();
        return false;
      },
    },
    mount: (el) => /** @type {HTMLInputElement|null} */ (el.querySelector('#stepsin'))?.focus(),
  });
}

/** Last night's sleep card. */
export function sleepCard() {
  const s = sleepOf();
  const has = s.hours != null || s.q != null;
  return html`<button class="card mt12 pad14 row gap10 sleepcard" data-act="sleepSheet"><span class="sq violet">${ic('moon', 20, 2.1)}</span>
<span class="f1 left minw0"><span class="b block">${t('sleep.cardTitle')}</span><span class="muted xs b">${has ? t('sleep.cardSub') : t('sleep.cardAsk')}</span></span>
${has ? html`<span class="xb num big19">${s.hours == null ? '–' : `${fmtNum(s.hours, 1)} ${t('unit.h')}`}</span><span class="fs18">${s.q ? FACES[s.q - 1] : ''}</span>` : html`<span class="chip accent chip-sm">${t('sleep.add')}</span>`}</button>`;
}

/** Sleep entry sheet: hours (½ h steps) and quality 1–5; saved on every change. */
export function openSleepSheet() {
  const date = dayKey();
  openSheet({
    render: () => {
      const s = sleepOf(date);
      return html`<h2 class="h2">${t('sleep.cardTitle')}</h2>
<div class="row between mt12"><span class="b">${t('sleep.hours')}</span>${stepper({ act: 'h', value: s.hours == null ? '' : fmtNum(s.hours, 1), unit: t('unit.h'), label: t('sleep.hours') })}</div>
<h3 class="b mt16">${t('sleep.quality')}</h3>${scale('sleepQ', s.q ?? undefined, t('sleep.quality'))}
<button class="btn w100 mt16" data-close>${t('common.done')}</button>`;
    },
    actions: {
      h: (el, ev) => {
        const cur = sleepOf(date).hours ?? 7;
        const typed = Number(/** @type {HTMLInputElement} */ (el).value?.replace(',', '.'));
        const v = ev.type === 'change' ? (Number.isFinite(typed) ? typed : cur) : cur + Number(el.dataset.d) * 0.5;
        setSleep(date, { hours: v });
      },
      rate: (el) => void setSleep(date, { q: Number(el.dataset.v) }),
    },
  });
}

/** Today's meals card (same rows as Food). */
export function mealsCard() {
  const today = dayKey(),
    rows = dayRows(today);
  return html`<section class="card mt12 meals homemeals" aria-label="${t('home.mealsToday')}"><div class="row between mhead"><h2 class="h3 xb">${t('home.mealsToday')}</h2><span class="b num small">${fmtNum(totals(rows).kcal)} kcal</span></div>
${MEALS.map(([m]) => {
  const items = rows.filter((r) => r.meal === m),
    [emo, bg] = MEAL_STYLE[m];
  if (!items.length)
    return html`<button class="meal" data-go="food/add/${m}" data-m="${m}"><span class="mic muted-bg">${ic('plus', 20, 2.4)}</span><span class="f1"><span class="b muted block">${t(`meal.${m}`)}</span><span class="muted xs b">${t('food.nothing')}</span></span></button>`;
  return html`<button class="meal" data-act="homeMeal" data-m="${m}"><span class="mic" style="${raw(`background:${bg}`)}">${emo}</span><span class="f1 minw0"><span class="row gap8"><span class="b">${t(`meal.${m}`)}</span><span class="muted xs b">${items[0].time}</span></span>
<span class="muted small b ellip block">${items.map((r) => foodName(r)).join(', ')}</span></span><span class="b num nowrap">${fmtNum(totals(items).kcal)} <span class="muted xs">kcal</span></span></button>`;
})}</section>`;
}

/** Open a filled meal's sheet (the Food tab's own sheet, for today). @param {string} meal */
export async function openHomeMeal(meal) {
  const { openMeal } = await import('../../food/views/diary.js');
  openMeal(meal, dayKey());
}
