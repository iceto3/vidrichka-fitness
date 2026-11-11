/**
 * Food diary: date picker, kcal ring with macro bars, water tracker and meals grouped
 * by time of day with timestamps.
 * @module features/food/views/diary
 */
import { emit } from '../../../core/bus.js';
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { addDays, dayKey, hmComplete, parseDay, parseHM, stepHM } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { bar, ring, time24 } from '../../../ui/components.js';
import { closeSheet, openSheet, refreshSheet, toast } from '../../../ui/sheet.js';
import { checkFoodTime, foodTimeFloor, setMealClock } from '../../daily/api.js';
import { trashList } from '../../../core/trash.js';
import { currentMeal, dayRows, foodName, mealName, view } from '../api.js';
import { cardActions, waterCard } from '../../day/views/cards.js';
import { suppActions, suppsCard } from './supps.js';
import { get } from '../../../core/store.js';
import { withSuppProtein } from '../../day/logic.js';
import { mealHM, mealStyle, mealsWithExtras, newExtraId, totals } from '../logic.js';
import { enabledMeals } from '../../../core/settings.js';
import { creatineMg } from '../creatine.js';
import { nutrientLegend, nutrientLine } from '../nutrients.js';
import { mealTotalsLine } from './totals.js';

export { mealTotalsLine } from './totals.js';

export { MEAL_STYLE } from '../logic.js';

/**
 * 1.4.3: the legend of the abbreviated nutrients (opened by the ⓘ in a meal's sheet).
 */
export function openNutrientLegend() {
  openSheet({
    kind: 'dialog',
    render: () =>
      html`<h2 class="h3 xb">${t('nutr.legendTitle')}</h2><div class="col gap8 mt12 nutrlegend">${nutrientLegend().map(
        ([short, full]) =>
          html`<div class="row gap10"><span class="nabbr b">${short}</span><span class="b">${full}</span></div>`,
      )}</div><p class="muted xs b mt12">${t('nutr.legendNote')}</p>
<button class="btn w100 mt16" data-close>${t('common.ok')}</button>`,
  });
}

/**
 * Meal detail sheet: tap an item to edit it, delete with Undo, save as a combination.
 * 1.3.4: also opened from Home's meal rows (for today), so both places show the same sheet.
 * 1.5.1 (user decision): the meal has ONE clock, here in its header – the foods in it have no
 * time of their own. A change (typed or ±5 min, checked like „Кога яде?“: not in the future,
 * not before the wake-up) is saved with „Запази часа“ or when the sheet is closed, and moves
 * every entry of the meal (setMealClock). Older data with mixed times shows the earliest and
 * is left as it is until the clock is changed.
 * @param {string} meal @param {string} [date] Day to show (default: the diary's day).
 */
export function openMeal(meal, date) {
  if (date) view.date = date;
  const day = view.date;
  /** The meal clock: what the sheet shows (`hm`), text that is not a time yet (`typed`). */
  /** @type {{hm: string, typed?: string}} */
  const clk = { hm: mealHM(dayRows(day), day, meal) };
  const saved = () => mealHM(dayRows(day), day, meal);
  const clkErr = () => {
    if (clk.typed != null) return 'time24.bad';
    if (!clk.hm || clk.hm === saved()) return '';
    const r = checkFoodTime(day, clk.hm);
    return 'err' in r ? `mealTime.err.${r.err}` : '';
  };
  const changed = () => clk.typed == null && !!clk.hm && clk.hm !== saved();
  /** Save a changed, valid clock (every entry of the meal moves). */
  const applyClock = () => {
    if (!changed() || clkErr()) return false;
    const r = setMealClock(day, meal, clk.hm);
    if (r.ok && !('graded' in r && r.graded))
      toast(t('food.mealTimeChanged', { meal: mealName(meal, day), time: clk.hm }));
    if (r.ok) emit('ui:refresh');
    return r.ok;
  };
  openSheet({
    render: () => {
      const rows = dayRows(day).filter((r) => r.meal === meal),
        err = rows.length ? clkErr() : '';
      return html`<div class="row between"><span class="row gap6"><h2 class="h2">${mealName(meal, day)}</h2><button class="iconbtn flat sm nutrinfo" data-act="legend" aria-label="${t('nutr.legendOpen')}">${ic('info', 18, 2.2)}</button></span><span class="b num">${fmtNum(totals(rows).kcal)} ${t('unit.kcal')}</span></div>
${
  rows.length
    ? html`<div class="row gap10 mt8 mealclk"><span class="sq">${ic('clock', 18, 2.2)}</span><span class="f1 b">${t('food.time')}</span>${time24({ value: clk.typed ?? clk.hm, act: 'mclk', step: 'mclkstep', mins: 5, label: t('food.mealTime'), bad: !!err })}</div>
${err ? html`<p class="small b danger-t mt6 mclkerr" role="alert">${t(err)}</p>` : html`<p class="xs b muted mt4 mclkhint">${t('food.timeMeal')}</p>`}
${changed() && !err ? html`<button class="btn sm w100 mt8 mclksave" data-act="mclksave">${ic('check', 18, 3)}${t('food.saveMealTime')}</button>` : ''}`
    : ''
}
<div class="list mt8 mealitems">${rows.map(
        (r) =>
          html`<div class="lrow"><button class="f1 row gap10 left itembtn" data-act="edit" data-id="${r.id}" aria-label="${t('food.editItem')}: ${foodName(r)}"><span class="fic">${r.emoji ?? '🍽️'}</span><span class="f1 minw0"><span class="b block">${foodName(r)}</span><span class="muted xs b block">${r.grams} ${t('unit.g')}</span><span class="muted xs b block num nutrline">${nutrientLine(r, creatineMg(r))}</span></span>
<span class="b num small">${fmtNum(r.kcal)}</span></button><button class="iconbtn flat sm" data-act="del" data-id="${r.id}" aria-label="${t('common.remove')} ${foodName(r)}">${ic('trash', 18)}</button></div>`,
      )}</div>
<div class="row gap10 mt12"><button class="btn sec f1 savecombo" data-act="combo">${ic('star', 18, 2.2)}${t('food.saveCombo')}</button></div>
<button class="btn w100 mt10" data-go="food/add/${meal}">${ic('plus', 20, 2.8)}${t('food.addTo', { meal: mealName(meal, day) })}</button>`;
    },
    // leaving the sheet keeps a changed, valid time (like the add page's clock)
    onClose: () => void applyClock(),
    actions: {
      // typed 24 h like „Кога яде?“ (a complete time counts while typing), ±5 min; − stops at the wake-up
      mclk: (el, ev) => {
        const txt = /** @type {HTMLInputElement} */ (el).value,
          v = parseHM(txt);
        if (ev?.type === 'input') {
          if (!hmComplete(txt) || !v) return false;
          ((clk.hm = v), (clk.typed = undefined));
        } else if (v) {
          ((clk.hm = v), (clk.typed = undefined));
          /** @type {HTMLInputElement} */ (el).value = v;
        } else clk.typed = txt;
        refreshSheet();
        return false;
      },
      mclkstep: (el) => {
        clk.hm = stepHM(clk.hm || saved(), Number(el.dataset.d));
        clk.typed = undefined;
        const floor = foodTimeFloor(day),
          c = checkFoodTime(day, clk.hm);
        if (floor && 'err' in c && c.err === 'early') clk.hm = floor;
        refreshSheet();
        return false;
      },
      mclksave: () => {
        applyClock();
        clk.hm = saved();
        clk.typed = undefined;
      },
      legend: () => (openNutrientLegend(), false),
      edit: async (el) => {
        const { openItemEdit } = await import('./item.js');
        openItemEdit(el.dataset.id ?? '');
        return false;
      },
      del: async (el) => {
        const r = dayRows(view.date).find((x) => x.id === el.dataset.id);
        if (!r) return false;
        const { deleteFoodRow } = await import('./item.js');
        deleteFoodRow(r);
        if (!dayRows(view.date).some((x) => x.meal === meal)) closeSheet();
      },
      combo: async () => {
        const rows = dayRows(view.date).filter((r) => r.meal === meal);
        if (!rows.length) return false;
        const { openSaveCombo } = await import('./combo.js');
        openSaveCombo({
          rows,
          meal,
          title: t('food.saveComboTitle'),
          body: t('food.saveComboBody'),
          cancel: t('common.cancel'),
        });
        return false;
      },
    },
  });
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'food',
  // Opened from a water reminder (#/food?water): jump to today's water tracker
  // (1.6.1: #/food?supps from a supplement reminder – to „Хранителни добавки“).
  mount: () => {
    const m = /[?&](water|supps)/.exec(location.hash);
    if (!m) return;
    if (view.date !== dayKey()) ((view.date = dayKey()), emit('ui:refresh'));
    const card = document.querySelector(m[1] === 'water' ? '.food .water' : '.food .supps');
    card?.scrollIntoView({ block: 'center' });
    card?.classList.add('flash');
  },
  render: () => {
    const s = settings(),
      rows = dayRows(view.date),
      // 1.6.1: protein powder ticked in „Хранителни добавки“ counts for the protein goal
      food = totals(rows),
      tot = {
        ...food,
        p: withSuppProtein(/** @type {any} */ (food), Number(get('days', view.date)?.suppP) || 0)?.p ?? food.p,
      },
      today = dayKey();
    const isToday = view.date === today,
      d = parseDay(view.date);
    const macros = [
      ['protein', tot.p, s.proteinGoal, '#7C5CFF'],
      ['carbs', tot.c, s.carbsGoal, 'var(--gold)'],
      ['fat', tot.f, s.fatGoal, 'var(--warm)'],
    ];
    const leftK = s.kcalGoal - tot.kcal;
    return html`<div class="content food">
<div class="row between"><h1 class="h1">${t('food.title')}</h1><div class="row gap8"><button class="iconbtn" data-go="food/add/${currentMeal()}?q" aria-label="${t('food.search')}">${ic('search', 21)}</button><button class="iconbtn" data-go="food/add/${currentMeal()}?scan" aria-label="${t('food.scan')}">${ic('scan', 21)}</button></div></div>
<div class="card datebar row between mt12"><button class="iconbtn flat sm" data-act="day" data-d="-1" aria-label="${t('food.prevDay')}">${ic('left', 18)}</button>
<label class="row gap8 b datepick">${ic('calendar', 18)}<span>${isToday ? `${t('common.today')}, ` : ''}${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</span><input type="date" data-change="pick" value="${view.date}" max="${today}" aria-label="${t('food.pickDate')}"></label>
<button class="iconbtn flat sm" data-act="day" data-d="1" aria-label="${t('food.nextDay')}" ${isToday ? raw('disabled') : ''}>${ic('right', 18)}</button></div>
<div class="card mt12 row gap16 kcalcard">${ring(132, 13, tot.kcal / s.kcalGoal, {
      color: leftK < 0 ? 'var(--warm)' : 'var(--accent)',
      label: `${fmtNum(tot.kcal)} / ${fmtNum(s.kcalGoal)} ${t('unit.kcal')}`,
      inner: html`<div class="xs b muted caps">${t('food.eaten')}</div><div class="xb num big24">${fmtNum(tot.kcal)}</div><div class="small b muted num">/ ${fmtNum(s.kcalGoal)} ${t('unit.kcal')}</div>`,
    })}
<div class="f1"><div class="chip ${leftK < 0 ? 'warm' : 'accent'}">${leftK < 0 ? t('food.over', { n: fmtNum(-leftK) }) : t('food.left', { n: fmtNum(leftK) })}</div>
${macros.map(([k, v, g, c], i) => {
  // 1.4.0: past the goal – protein gets a ✓ (more is fine), carbs and fat show how much over.
  const over = Number(v) - Number(g) >= 1;
  const cue = !over
    ? ''
    : k === 'protein'
      ? html` <span class="macrook">✓ ${t('food.goalHit')}</span>`
      : html` <span class="macroover">+${fmtNum(Math.round(Number(v) - Number(g)))} ${t('unit.g')}</span>`;
  return html`<div class="macro ${i ? 'mt8' : 'mt10'}${over ? ` over-${k}` : ''}"><div class="row between small b"><span>${t(`food.${k}`)}${cue}</span><span class="muted num">${fmtNum(Math.round(Number(v)))} / ${fmtNum(Number(g))} ${t('unit.g')}</span></div>${bar(Number(v) / Number(g), over && k === 'protein' ? 'var(--ok, #2fae6b)' : String(c))}</div>`;
})}
<div class="row wrap gap12 mt10 small b fibsalt"><span>${t('food.fiber')} <span class="num muted">${tot.fibN ? `${fmtNum(tot.fib, 1)} ${t('unit.g')}` : '—'}</span></span><span>${t('food.salt')} <span class="num muted">${tot.saltN ? `${fmtNum(tot.salt, 1)} ${t('unit.g')}` : '—'}</span></span><span class="satsum">${t('food.satFat')} <span class="num muted">${tot.satN ? `${fmtNum(tot.sat, 1)} ${t('unit.g')}` : '—'}</span></span><span class="sugsum">${t('food.sugar')} <span class="num muted">${tot.sugN ? `${fmtNum(tot.sug, 1)} ${t('unit.g')}` : '—'}</span></span></div></div></div>
${waterCard(view.date)}
${suppsCard(view.date)}
<div class="section-title"><h2 class="h3">${t('food.meals')}</h2><button class="link" data-go="food/meals">${t('food.regularMeals')}</button></div>
<div class="card meals">${mealsWithExtras(enabledMeals(), rows, view.date).map((m) => {
      const items = rows.filter((r) => r.meal === m),
        [emo, bg] = mealStyle(m);
      if (!items.length)
        return html`<button class="meal" data-go="food/add/${m}"><span class="mic muted-bg">${ic('plus', 20, 2.4)}</span><span class="f1"><span class="b muted block">${t(`meal.${m}`)}</span><span class="muted xs b">${t('food.nothing')}</span></span></button>`;
      return html`<button class="meal" data-act="meal" data-m="${m}"><span class="mic" style="background:${bg}">${emo}</span><span class="f1 minw0"><span class="row gap8"><span class="b">${mealName(m, view.date)}</span><span class="muted xs b mealhm">${mealHM(items, view.date, m)}</span></span>
<span class="muted small b ellip block">${items.map((r) => foodName(r)).join(', ')}</span>${mealTotalsLine(totals(items))}</span><span class="b num nowrap">${fmtNum(totals(items).kcal)} <span class="muted xs">${t('unit.kcal')}</span></span></button>`;
    })}<button class="meal addmeal" data-act="addExtra"><span class="mic muted-bg">${ic('plus', 20, 2.4)}</span><span class="f1"><span class="b block">${t('food.addMeal')}</span><span class="muted xs b">${t('food.addMealHint')}</span></span></button></div>
<button class="btn w100 mt12" data-go="food/add/${currentMeal()}">${ic('plus', 20, 2.8)}${t('food.add')}</button>
<div class="row center-j mt12"><button class="link trashlink" data-go="food/trash">${ic('trash', 16, 2.2)} ${t('trash.title')}${trashList().length ? ` (${trashList().length})` : ''}</button></div>
</div>`;
  },
  actions: {
    day: (el) => void (view.date = dayKey(addDays(parseDay(view.date), Number(el.dataset.d)))),
    pick: (el) =>
      void (/** @type {HTMLInputElement} */ (el).value && (view.date = /** @type {HTMLInputElement} */ (el).value)),
    water: cardActions(() => view.date).water, // 1.4.0: shared water card (− / glasses / +)
    ...suppActions(() => view.date), // 1.6.1: „Хранителни добавки“ (creatine since 1.4.2)
    meal: (el) => (openMeal(el.dataset.m ?? 'snack'), false),
    // 1.5.0: an unplanned meal – its own id; the time (and so its name) is set on the add page
    addExtra: () => (emit('nav', { path: `food/add/${newExtraId()}` }), false),
  },
});
