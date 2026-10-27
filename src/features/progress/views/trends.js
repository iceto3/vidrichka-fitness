/**
 * Progress › Trends (1.3.4): week / month / 3-month charts of steps (goal line + streak),
 * mood and energy, sleep, water, kcal / protein / fiber / salt and workouts, plus up to
 * two insight cards once there are 14+ days of data.
 * @module features/progress/views/trends
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { all } from '../../../core/store.js';
import { settings } from '../../../core/settings.js';
import { barChart, lineChart } from '../../../ui/charts.js';
import { ic } from '../../../ui/icons.js';
import { stepGoal, stepRun } from '../../steps/api.js';
import {
  MIN_DAYS,
  RANGES,
  dailyRows,
  dataDays,
  goalDays,
  insights,
  isEmpty,
  mean,
  series,
  weeklyWorkouts,
  weightRange,
  weightSeries,
} from '../trends.js';

/** Recommended daily fiber (g) and the salt upper limit (g) used as reference lines. */
const FIBER_REF = 25,
  SALT_MAX = 5;

/** @type {{range: keyof typeof RANGES}} */
const state = { range: 'week' };

/** Axis label for a day (or a week's Monday). @param {string} x */
const lbl = (x) =>
  state.range === 'week'
    ? fmtDate(parseDay(x), { weekday: 'short' })
    : fmtDate(parseDay(x), { day: 'numeric', month: 'short' });

/** Average of the shown points, formatted ('–' if none). @param {{y: number|null}[]} pts @param {number} [d] */
const avgOf = (pts, d = 0) => {
  const m = mean(pts.map((p) => p.y));
  return m == null ? '–' : fmtNum(m, d);
};

/** A chart card. @param {string} cls @param {string} title @param {any} right @param {any} body */
const card = (cls, title, right, body) =>
  html`<div class="card mt12 pad16 chcard ${cls}"><div class="row between"><h2 class="h3 xb">${title}</h2>${right}</div><div class="mt10">${body}</div></div>`;

/** 1.4.0: an empty range says so instead of drawing bare axes. @param {{y: number|null}[]} pts @param {string} what */
const orEmpty = (pts, what, chart) =>
  isEmpty(pts) ? html`<p class="small muted b chempty">${t('trends.empty', { what })}</p>` : chart;

/** Insight text (gender-aware tail). @param {import('../trends.js').Insight} i */
const insightCard = (i) => {
  const a = fmtNum(i.a, 1),
    b = fmtNum(i.b, 1);
  return html`<div class="card mt12 pad16 insight" data-insight="${i.id}"><div class="row gap8"><span class="insico">${i.id === 'sleepEnergy' ? '🌙' : i.id === 'workoutMood' ? '🏋️' : '👟'}</span><div><div class="xs b muted up">${t('insight.title')}</div><div class="b mt4">${t(`insight.${i.id}`, { a, b })}</div><div class="small muted mt4">${t(`insight.${i.id}${i.up ? 'Up' : 'Down'}`)}</div></div></div></div>`;
};

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  render: () => {
    const s = settings(),
      today = dayKey(),
      n = RANGES[state.range],
      weekly = state.range === '3m';
    const data = { days: all('days'), food: all('food'), sessions: all('sessions') };
    const rows = dailyRows(data, n, today);
    const long = state.range === '3m' ? rows : dailyRows(data, 90, today);
    const goal = stepGoal();
    const pt = (/** @type {keyof import('../trends.js').DayRow} */ k) => series(rows, k, weekly);
    const st = pt('steps'),
      gd = goalDays(rows, goal);
    const found = insights(long, { stepGoal: goal });
    const known = dataDays(long);
    const wk = weeklyWorkouts(data.sessions, weekly ? 13 : state.range === 'month' ? 5 : 4, today);
    const wkPts = (/** @type {'n'|'vol'} */ k) => wk.map((w) => ({ x: w.x, y: w[k] }));
    const wlbl = (/** @type {string} */ x) => fmtDate(parseDay(x), { day: 'numeric', month: 'short' });
    const per = weekly ? t('trends.perWeekAvg') : t('trends.perDayAvg');
    const wpts = weightSeries(all('measurements'), n, today, weekly),
      wvals = /** @type {number[]} */ (wpts.map((p) => p.y).filter((y) => y != null));
    const wt = {
      pts: wpts,
      range: weightRange(wpts),
      last: wvals.at(-1) ?? null,
      delta: wvals.length >= 2 ? Math.round((wvals[wvals.length - 1] - wvals[0]) * 10) / 10 : null,
    };
    return html`<div class="trends">
<div class="mini mt12 trange" role="tablist">${Object.keys(RANGES).map(
      (r) =>
        html`<button class="${state.range === r ? 'on' : ''}" data-act="trange" data-v="${r}" role="tab" aria-selected="${state.range === r}">${t(`trends.${r}`)}</button>`,
    )}</div>
<div class="ch-insights">${
      found.length
        ? found.map(insightCard)
        : html`<div class="card mt12 pad16 insight soon"><div class="row gap8"><span class="insico">💡</span><div><div class="small muted b">${t('insight.soon', { n: Math.max(0, MIN_DAYS - known) })}</div><div class="xs muted mt4">${t('insight.soonWhat')}</div></div></div></div>`
    }</div>
${card(
  'ch-steps',
  t('trends.steps'),
  html`<span class="chip chip-sm">🔥 ${t('steps.streak', { n: stepRun() })}</span>`,
  html`${orEmpty(st, t('trends.emptySteps'), barChart(st, { goal, goalLabel: fmtNum(goal), color: 'var(--accent)', aria: t('trends.steps'), label: lbl }))}<div class="row between xs b muted mt6"><span>${per}: <span class="num">${avgOf(st)}</span></span><span>${t('trends.goalDays', { n: gd.hit, total: n })}</span></div>`,
)}
${card(
  'ch-mood',
  t('trends.moodEnergy'),
  html`<span class="row gap8 xs b"><span class="lg" style="--c:#e98aa7">${t('sleep.mood')}</span><span class="lg" style="--c:#f1b23a">${t('sleep.energy')}</span></span>`,
  orEmpty(
    [...pt('mood'), ...pt('energy')],
    t('trends.emptyMood'),
    lineChart(
      [
        { pts: pt('mood'), color: '#e98aa7' },
        { pts: pt('energy'), color: '#f1b23a' },
      ],
      { min: 1, max: 5, aria: t('trends.moodEnergy'), label: lbl },
    ),
  ),
)}
${card(
  'ch-sleep',
  t('sleep.hours'),
  html`<span class="xs b muted">${per}: <span class="num">${avgOf(pt('sleep'), 1)}</span> ${t('unit.h')}</span>`,
  orEmpty(
    pt('sleep'),
    t('trends.emptySleep'),
    barChart(pt('sleep'), {
      goal: 7,
      goalLabel: `7 ${t('unit.h')}`,
      color: '#7b86e0',
      aria: t('sleep.hours'),
      label: lbl,
    }),
  ),
)}
${card(
  'ch-water',
  t('trends.water'),
  html`<span class="xs b muted">${per}: <span class="num">${avgOf(pt('water'), 1)}</span> / ${s.waterGoal}</span>`,
  orEmpty(
    pt('water'),
    t('trends.emptyWater'),
    barChart(pt('water'), {
      goal: s.waterGoal,
      goalLabel: String(s.waterGoal),
      color: '#38a9e0',
      aria: t('trends.water'),
      label: lbl,
    }),
  ),
)}
${card(
  'ch-food',
  t('trends.food'),
  '',
  isEmpty(pt('kcal'))
    ? html`<p class="small muted b chempty">${t('trends.empty', { what: t('trends.emptyFood') })}</p>`
    : html`<div class="xs b muted">${t('trends.kcal')} · ${per}: <span class="num">${avgOf(pt('kcal'))}</span> / ${fmtNum(s.kcalGoal)}</div>
${barChart(pt('kcal'), { goal: s.kcalGoal, goalLabel: fmtNum(s.kcalGoal), color: '#f08a5d', aria: t('trends.kcal'), label: lbl, hit: (y) => y <= s.kcalGoal * 1.1 })}
<div class="xs b muted mt10">${t('trends.protein')} · ${per}: <span class="num">${avgOf(pt('protein'))}</span> / ${s.proteinGoal} ${t('unit.g')}</div>
${barChart(pt('protein'), { goal: s.proteinGoal, goalLabel: `${s.proteinGoal} ${t('unit.g')}`, color: '#14a3a8', aria: t('trends.protein'), label: lbl })}
<div class="grid2 gap12 mt10"><div><div class="xs b muted">${t('food.fiber')} · <span class="num">${avgOf(pt('fib'), 1)}</span> ${t('unit.g')}</div>${barChart(pt('fib'), { goal: FIBER_REF, goalLabel: `${FIBER_REF}`, color: '#6cbf6a', aria: t('food.fiber') })}</div>
<div><div class="xs b muted">${t('food.salt')} · <span class="num">${avgOf(pt('salt'), 1)}</span> ${t('unit.g')}</div>${barChart(pt('salt'), { goal: SALT_MAX, goalLabel: `≤${SALT_MAX}`, color: '#a08bd6', aria: t('food.salt'), hit: (y) => y <= SALT_MAX })}</div></div>
<div class="xs muted mt6">${t('trends.refs', { f: FIBER_REF, s: SALT_MAX })}</div>`,
)}
${card(
  'ch-weight',
  t('trends.weight'),
  wt.last != null
    ? html`<span class="xs b muted">${t('trends.weightNow', { kg: fmtNum(wt.last, 1), d: wt.delta == null ? '' : `${wt.delta > 0 ? '+' : ''}${fmtNum(wt.delta, 1)}` })}</span>`
    : '',
  wt.range
    ? lineChart([{ pts: wt.pts, color: '#e0745d' }], {
        min: wt.range.min,
        max: wt.range.max,
        gridStep: wt.range.step,
        aria: t('trends.weight'),
        label: lbl,
      })
    : html`<p class="small muted b chempty">${t('trends.empty', { what: t('trends.emptyWeight') })}</p><button class="btn sec sm mt8" data-go="progress/body">${t('trends.addWeight')}</button>`,
)}
${card(
  'ch-work',
  t('trends.workouts'),
  html`<span class="xs b muted">${ic('dumbbell', 13, 2.3)} ${t('trends.perWeekN', { n: fmtNum(mean(wk.map((w) => w.n)) ?? 0, 1) })}</span>`,
  isEmpty(wkPts('n'))
    ? html`<p class="small muted b chempty">${t('trends.empty', { what: t('trends.emptyWorkouts') })}</p>`
    : html`${barChart(wkPts('n'), { goal: s.weeklyGoal, goalLabel: String(s.weeklyGoal), color: 'var(--accent)', aria: t('trends.workouts'), label: wlbl })}
<div class="xs b muted mt10">${t('trends.volume')}</div>${barChart(wkPts('vol'), { color: '#5d7fe0', aria: t('trends.volume'), label: wlbl })}`,
)}
</div>`;
  },
  actions: {
    trange: (el) => {
      state.range = /** @type {keyof typeof RANGES} */ (el.dataset.v);
    },
  },
});
