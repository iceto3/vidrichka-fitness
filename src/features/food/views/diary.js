/**
 * Food diary: date picker, kcal ring with macro bars, water tracker and meals grouped
 * by time of day with timestamps.
 * @module features/food/views/diary
 */
import { emit } from '../../../core/bus.js';
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { addDays, dayKey, parseDay } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { bar, ring } from '../../../ui/components.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { trashList } from '../../../core/trash.js';
import { dayRows, foodName, view } from '../api.js';
import { cardActions, waterCard } from '../../day/views/cards.js';
import { MEALS, MEAL_STYLE, known, mealFor, totals } from '../logic.js';

export { MEAL_STYLE } from '../logic.js';

/** Fiber / salt of a row as a short suffix (only known values). @param {any} r */
const extras = (r) =>
  [
    known(r.fib) ? `${t('food.fiberShort')} ${fmtNum(r.fib, 1)} ${t('unit.g')}` : '',
    known(r.salt) ? `${t('food.saltShort')} ${fmtNum(r.salt, 1)} ${t('unit.g')}` : '',
  ]
    .filter(Boolean)
    .map((x) => ` · ${x}`)
    .join('');

/**
 * Meal detail sheet: tap an item to edit it, delete with Undo, save as a combination.
 * 1.3.4: also opened from Home's meal rows (for today), so both places show the same sheet.
 * @param {string} meal @param {string} [date] Day to show (default: the diary's day).
 */
export function openMeal(meal, date) {
  if (date) view.date = date;
  openSheet({
    render: () => {
      const rows = dayRows(view.date).filter((r) => r.meal === meal);
      return html`<div class="row between"><h2 class="h2">${t(`meal.${meal}`)}</h2><span class="b num">${fmtNum(totals(rows).kcal)} ${t('unit.kcal')}</span></div>
<div class="list mt8 mealitems">${rows.map(
        (r) =>
          html`<div class="lrow"><button class="f1 row gap10 left itembtn" data-act="edit" data-id="${r.id}" aria-label="${t('food.editItem')}: ${foodName(r)}"><span class="fic">${r.emoji ?? '🍽️'}</span><span class="f1 minw0"><span class="b block">${foodName(r)}</span><span class="muted xs b">${r.time} · ${r.grams} ${t('unit.g')}${extras(r)}</span></span>
<span class="b num small">${r.kcal}</span></button><button class="iconbtn flat sm" data-act="del" data-id="${r.id}" aria-label="${t('common.remove')} ${foodName(r)}">${ic('trash', 18)}</button></div>`,
      )}</div>
<div class="row gap10 mt12"><button class="btn sec f1 savecombo" data-act="combo">${ic('star', 18, 2.2)}${t('food.saveCombo')}</button></div>
<button class="btn w100 mt10" data-go="food/add/${meal}">${ic('plus', 20, 2.8)}${t('food.addTo', { meal: t(`meal.${meal}`) })}</button>`;
    },
    actions: {
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
  // Opened from a water reminder (#/food?water): jump to today's water tracker.
  mount: () => {
    if (!/[?&]water/.test(location.hash)) return;
    if (view.date !== dayKey()) ((view.date = dayKey()), emit('ui:refresh'));
    const card = document.querySelector('.food .water');
    card?.scrollIntoView({ block: 'center' });
    card?.classList.add('flash');
  },
  render: () => {
    const s = settings(),
      rows = dayRows(view.date),
      tot = totals(rows),
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
<div class="row between"><h1 class="h1">${t('food.title')}</h1><div class="row gap8"><button class="iconbtn" data-go="food/add/${mealFor()}?q" aria-label="${t('food.search')}">${ic('search', 21)}</button><button class="iconbtn" data-go="food/add/${mealFor()}?scan" aria-label="${t('food.scan')}">${ic('scan', 21)}</button></div></div>
<div class="card datebar row between mt12"><button class="iconbtn flat sm" data-act="day" data-d="-1" aria-label="${t('food.prevDay')}">${ic('left', 18)}</button>
<label class="row gap8 b datepick">${ic('calendar', 18)}<span>${isToday ? `${t('common.today')}, ` : ''}${fmtDate(d, { weekday: 'short', day: 'numeric', month: 'short' })}</span><input type="date" data-change="pick" value="${view.date}" max="${today}" aria-label="${t('food.pickDate')}"></label>
<button class="iconbtn flat sm" data-act="day" data-d="1" aria-label="${t('food.nextDay')}" ${isToday ? raw('disabled') : ''}>${ic('right', 18)}</button></div>
<div class="card mt12 row gap16 kcalcard">${ring(132, 13, tot.kcal / s.kcalGoal, {
      color: leftK < 0 ? 'var(--warm)' : 'var(--accent)',
      label: `${tot.kcal} / ${s.kcalGoal} ${t('unit.kcal')}`,
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
<div class="row gap12 mt10 small b fibsalt"><span>${t('food.fiber')} <span class="num muted">${tot.fibN ? `${fmtNum(tot.fib, 1)} ${t('unit.g')}` : '—'}</span></span><span>${t('food.salt')} <span class="num muted">${tot.saltN ? `${fmtNum(tot.salt, 1)} ${t('unit.g')}` : '—'}</span></span></div></div></div>
${waterCard(view.date)}
<div class="section-title"><h2 class="h3">${t('food.meals')}</h2><button class="link" data-go="food/meals">${t('food.regularMeals')}</button></div>
<div class="card meals">${MEALS.map(([m]) => {
      const items = rows.filter((r) => r.meal === m),
        [emo, bg] = MEAL_STYLE[m];
      if (!items.length)
        return html`<button class="meal" data-go="food/add/${m}"><span class="mic muted-bg">${ic('plus', 20, 2.4)}</span><span class="f1"><span class="b muted block">${t(`meal.${m}`)}</span><span class="muted xs b">${t('food.nothing')}</span></span></button>`;
      return html`<button class="meal" data-act="meal" data-m="${m}"><span class="mic" style="background:${bg}">${emo}</span><span class="f1 minw0"><span class="row gap8"><span class="b">${t(`meal.${m}`)}</span><span class="muted xs b">${items[0].time}</span></span>
<span class="muted small b ellip block">${items.map((r) => foodName(r)).join(', ')}</span></span><span class="b num nowrap">${fmtNum(totals(items).kcal)} <span class="muted xs">${t('unit.kcal')}</span></span></button>`;
    })}</div>
<button class="btn w100 mt12" data-go="food/add/${mealFor()}">${ic('plus', 20, 2.8)}${t('food.add')}</button>
<div class="row center-j mt12"><button class="link trashlink" data-go="food/trash">${ic('trash', 16, 2.2)} ${t('trash.title')}${trashList().length ? ` (${trashList().length})` : ''}</button></div>
</div>`;
  },
  actions: {
    day: (el) => void (view.date = dayKey(addDays(parseDay(view.date), Number(el.dataset.d)))),
    pick: (el) =>
      void (/** @type {HTMLInputElement} */ (el).value && (view.date = /** @type {HTMLInputElement} */ (el).value)),
    water: cardActions(() => view.date).water, // 1.4.0: shared water card (− / glasses / +)
    meal: (el) => (openMeal(el.dataset.m ?? 'snack'), false),
  },
});
