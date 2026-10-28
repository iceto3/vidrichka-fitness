/**
 * Add food: search (local + Open Food Facts), barcode scan, quick picks, recents,
 * saved combinations (tap to select, tap again to add – with Undo), 8 category tiles (most used first) → grams sheet → Done.
 * Items accumulate in a "basket" for the meal; finishing offers "Save as a regular meal?".
 * 1.2: `food/add/breakfast?protein` (after "Ate it" on the protein breakfast) logs to
 * today's breakfast and shows a hint; closing without adding anything is fine.
 * @module features/food/views/add
 */
import { html, patch } from '../../../ui/dom.js';
import { fmtDate, fmtNum, getLang, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { all } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import {
  FOODS,
  categoriesByUse,
  foodName,
  logFood,
  quickPicks,
  recentFoods,
  savedMeals,
  searchLocal,
  view,
} from '../api.js';
import { known, signature, timesEaten, totals } from '../logic.js';
import { openGrams } from './grams.js';
import { SEARCH_TIMEOUT, offView, search, within } from '../off.js';
import { deleteFoodRow } from './item.js';
import { openVoice, voiceReady } from '../../voice/api.js';

/** One food result row. @param {any} f */
/**
 * Second line of a food row: kcal / 100 g, then fibre and salt when the food lists them (1.4.0).
 * @param {any} f
 */
export const foodSub = (f) =>
  [
    `${fmtNum(f.kcal)} ${t('unit.kcal')} / 100 ${t('unit.g')}`,
    known(f.fib) ? `${t('food.fiberShort')} ${fmtNum(f.fib, 1)} ${t('unit.g')}` : '',
    known(f.salt) ? `${t('food.saltShort')} ${fmtNum(f.salt, 1)} ${t('unit.g')}` : '',
  ]
    .filter(Boolean)
    .join(' · ');

const foodRow = (
  f,
) => html`<button class="lrow" data-act="pick" data-id="${f.id}"><span class="fic">${f.emoji ?? '🍽️'}</span>
<span class="f1 left"><span class="b block">${foodName(f)}</span><span class="muted xs b">${foodSub(f)}</span></span>${ic('plus', 18, 2.6, 'var(--accent-d)')}</button>`;

/** @param {{meal: string}} p @returns {import('../../../core/registry.js').View} */
export default ({ meal }) => {
  const protein = /[?&]protein\b/.test(location.hash);
  if (protein) view.date = dayKey(); // always today's breakfast
  /** @type {any[]} */
  const basket = [];
  /** @type {Map<string, any>} */
  const online = new Map();
  /** Online search state (1.4.0): rendered from here, so a re-render never restarts "Searching…". */
  const off = { q: '', state: /** @type {'idle'|'busy'|'done'|'fail'} */ ('idle'), list: /** @type {any[]} */ ([]) };
  let q = '',
    picked = '',
    showRecent = false,
    timer = 0,
    seq = 0;
  const findFood = (/** @type {string} */ id) =>
    FOODS.find((f) => f.id === id) ?? online.get(id) ?? all('foods').find((f) => f.id === id);

  const add = (/** @type {any} */ food) =>
    openGrams(food, (g) => {
      const row = logFood(food, g, meal);
      basket.push(row);
      toast(t('food.added', { name: foodName(food), g }));
      emit('ui:refresh');
    });

  const results = () => {
    const loc = searchLocal(q);
    return html`${loc.length ? html`<div class="card list mt10">${loc.map(foodRow)}</div>` : ''}
<div id="offres" aria-live="polite">${offBlock()}</div>
${!loc.length && q ? html`<button class="btn sec w100 mt10" data-act="manual">${ic('edit', 18)}${t('food.manual')}</button>` : ''}`;
  };

  /** The online part under the local results: searching / list / nothing found / not available + retry. */
  const offBlock = () => {
    const v = offView(off, q);
    if (v === 'busy')
      return html`<div class="muted small b mt10 center offbusy"><span class="spin sm" aria-hidden="true"></span> ${t('food.searchingOnline')}</div>`;
    if (v === 'fail')
      return html`<div class="muted small b mt10 center offfail">${t('food.offlineSearch')} <button class="link" data-act="retryOff">${t('food.retryOnline')}</button></div>`;
    if (v === 'none') return html`<div class="muted small b mt10 center">${t('food.noOnline')}</div>`;
    if (v === 'list')
      return html`<div class="xs xb muted caps mt12">${t('food.onlineResults')}</div><div class="card list mt6">${off.list.map(foodRow)}</div>`;
    return '';
  };

  const searchOnline = async () => {
    const my = ++seq,
      query = q.trim();
    if (query.length < 3) return;
    Object.assign(off, { q: query, state: 'busy', list: [] });
    /** @type {any[]|null} */
    let list = null;
    try {
      // hard cap: whatever the network does, the spinner ends
      list = await within(search(query, getLang()), SEARCH_TIMEOUT + 1500, null);
    } catch {
      list = null;
    }
    if (my !== seq) return;
    list?.forEach((f) => f && online.set(f.id, f));
    Object.assign(off, { state: list == null ? 'fail' : 'done', list: list ?? [] });
    patch('#offres', offBlock());
  };

  /** Finish the meal: offer saving a repeated/multi-item meal. */
  const finish = async () => {
    const rows = basket.filter((r) => all('food').some((x) => x.id === r.id));
    const sig = signature(rows);
    const known = savedMeals().some((m) => signature(m.items) === sig);
    if (rows.length >= 2 && !known) {
      const times = timesEaten(all('food'), sig, view.date);
      const { openSaveCombo } = await import('./combo.js');
      await openSaveCombo({
        rows,
        meal,
        body:
          times >= 1
            ? t('food.saveBodyTimes', {
                items: rows.map(foodName).join(' + '),
                meal: t(`meal.${meal}`).toLowerCase(),
                n: times + 1,
              })
            : undefined,
      });
    }
    emit('nav', { back: 'food' });
  };

  const openCategory = (/** @type {string} */ cat) =>
    openSheet({
      render: () =>
        html`<h2 class="h2">${t(`foodcat.${cat}`)}</h2><div class="list mt8">${FOODS.filter((f) => f.cat === cat).map(foodRow)}</div>`,
      actions: {
        pick: (el) => {
          closeSheet();
          setTimeout(() => add(findFood(el.dataset.id ?? '')), 0);
          return false;
        },
      },
    });

  return {
    tab: 'food',
    render: () => {
      const meals = savedMeals().slice(0, 4),
        picks = showRecent ? recentFoods() : quickPicks();
      const day =
        view.date === dayKey() ? t('common.today') : fmtDate(parseDay(view.date), { day: 'numeric', month: 'short' });
      return html`<div class="content add">
<header class="row between topbar"><button class="iconbtn" data-act="finish" aria-label="${t('common.back')}">${ic('back', 22)}</button>
<div class="center"><h1 class="h2">${t('food.add')}</h1><div class="muted xs b">${t('food.toMeal', { meal: t(`meal.${meal}`), day })}</div></div>
${basket.length ? html`<button class="btn sm" data-act="finish">${t('food.finishMeal')}</button>` : html`<span class="iconbtn ghost" aria-hidden="true"></span>`}</header>
<label class="search mt14">${ic('search', 20, 2.2)}<input id="fq" class="bare f1" type="search" data-input="q" value="${q}" placeholder="${t('food.searchPh')}" autocomplete="off" enterkeyhint="search" aria-label="${t('food.search')}">
${voiceReady() ? html`<button class="iconbtn flat sm" data-act="voice" aria-label="${t('voice.say')}">${ic('mic', 20, 2.2)}</button>` : ''}<button class="iconbtn flat sm acc-bg" data-act="scan" aria-label="${t('food.scan')}">${ic('scan', 20, 2.2)}</button></label>
${
  basket.length
    ? html`<div class="card mt12 basket"><div class="row between"><span class="xs xb muted caps">${t('food.inMeal', { n: basket.length })}</span><span class="b num small">${fmtNum(totals(basket).kcal)} ${t('unit.kcal')}</span></div>
<div class="row gap6 wrap mt8">${basket.map((r, i) => html`<span class="chip">${r.emoji} ${foodName(r)} · ${r.grams} ${t('unit.g')}<button class="x" data-act="undo" data-i="${i}" aria-label="${t('common.remove')} ${foodName(r)}">${ic('close', 14, 2.6)}</button></span>`)}</div></div>`
    : ''
}
${protein ? html`<div class="card mt12 row gap10 phint" role="note"><span class="sq">🍳</span><span class="f1 b small">${t('food.proteinHint')}</span></div>` : ''}
<div id="results">${q ? results() : ''}</div>
${
  q
    ? ''
    : html`
${
  meals.length
    ? html`<div class="section-title"><h2 class="h3">${t('food.regularMeals')}</h2><button class="link" data-go="food/meals">${t('common.all')}</button></div>
<div class="chips combos" role="group" aria-label="${t('food.regularMeals')}">${meals.map((m) => html`<button class="chip${picked === m.id ? ' on' : ''}" data-act="logMeal" data-id="${m.id}" aria-pressed="${String(picked === m.id)}">${picked === m.id ? '✓' : '⭐'} ${m.name} · ${fmtNum(totals(m.items).kcal)}</button>`)}</div>
${(() => {
  const m = meals.find((x) => x.id === picked);
  return m
    ? html`<div class="combohint muted small b mt6" role="status">${m.items.map((/** @type {any} */ i) => `${foodName(i)} ${i.grams} ${t('unit.g')}`).join(' · ')}<br><span class="acc">${t('food.tapAgain', { meal: t(`mealTo.${meal}`) })}</span></div>`
    : '';
})()}`
    : ''
}
<div class="section-title"><h2 class="h3">${showRecent ? t('food.recent') : t('food.quickPicks')}</h2><button class="link" data-act="recent" aria-pressed="${String(showRecent)}">${showRecent ? t('food.quickPicks') : t('food.recent')}</button></div>
<div class="chips">${picks.length ? picks.map((f) => html`<button class="chip" data-act="pick" data-id="${f.id}">${f.emoji} ${foodName(f)}</button>`) : html`<span class="muted small b">${t('food.noRecent')}</span>`}</div>
<div class="section-title"><h2 class="h3">${t('food.categories')}</h2></div>
<div class="cats">${categoriesByUse().map((c) => html`<button class="cat" data-act="cat" data-id="${c.id}"><span class="e" style="background:${c.bg}">${c.emoji}</span>${t(`foodcat.${c.id}`)}</button>`)}</div>
<button class="btn sec w100 mt16" data-act="manual">${ic('edit', 18)}${t('food.manual')}</button>`
}
</div>`;
    },
    mount: () => {
      const hash = location.hash;
      if (hash.endsWith('?scan'))
        setTimeout(
          () => document.querySelector('[data-act="scan"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })),
          0,
        );
      if (hash.endsWith('?q')) document.getElementById('fq')?.focus();
    },
    unmount: () => clearTimeout(timer),
    actions: {
      q: (el) => {
        q = /** @type {HTMLInputElement} */ (el).value;
        patch('#results', q ? results() : '');
        clearTimeout(timer);
        if (q.trim().length >= 3) timer = /** @type {any} */ (setTimeout(searchOnline, 450));
        if (!q || q.length === 1) emit('ui:refresh');
        return false;
      },
      retryOff: () => (void searchOnline(), patch('#offres', offBlock()), false),
      voice: () => (openVoice({ meal }), false),
      pick: (el) => (add(findFood(el.dataset.id ?? '')), false),
      cat: (el) => (openCategory(el.dataset.id ?? ''), false),
      recent: () => void (showRecent = !showRecent),
      undo: (el, ev) => {
        ev.stopPropagation();
        const [r] = basket.splice(Number(el.dataset.i), 1);
        const row = r && all('food').find((x) => x.id === r.id);
        if (row) deleteFoodRow(row);
      },
      // Saved combinations: the first tap selects (shows what's in it), the second adds it.
      logMeal: async (el) => {
        const id = el.dataset.id ?? '';
        if (picked !== id) return void (picked = id);
        picked = '';
        const { addCombo } = await import('./combo.js');
        if (addCombo(id, meal)) emit('nav', { back: 'food' });
        return false;
      },
      finish: () => (finish(), false),
      scan: async () => {
        const { openScanner } = await import('./scan.js');
        openScanner(
          (food) => add(food),
          (barcode) => openManual(barcode),
        );
        return false;
      },
      manual: () => (openManual(), false),
    },
  };

  /** Manual entry form. @param {string} [barcode] */
  async function openManual(barcode = '') {
    const { openManualForm } = await import('./manual.js');
    openManualForm({ name: q, barcode }, (food) => add(food));
  }
};
