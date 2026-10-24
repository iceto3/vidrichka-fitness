/**
 * Add food: search (local + Open Food Facts), barcode scan, quick picks, recents,
 * saved meals (one tap), 8 category tiles (most used first) → grams sheet → Done.
 * Items accumulate in a "basket" for the meal; finishing offers "Save as a regular meal?".
 * @module features/food/views/add
 */
import { html, patch } from '../../../ui/dom.js';
import { fmtDate, getLang, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { all } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { FOODS, categoriesByUse, foodName, logFood, logSavedMeal, quickPicks, recentFoods, savedMeals, searchLocal, unlog, view } from '../api.js';
import { signature, timesEaten, totals } from '../logic.js';
import { openGrams } from './grams.js';

/** One food result row. @param {any} f */
const foodRow = (f) => html`<button class="lrow" data-act="pick" data-id="${f.id}"><span class="fic">${f.emoji ?? '🍽️'}</span>
<span class="f1 left"><span class="b block">${foodName(f)}</span><span class="muted xs b">${Math.round(f.kcal)} kcal / 100 g</span></span>${ic('plus', 18, 2.6, 'var(--accent-d)')}</button>`;

/** @param {{meal: string}} p @returns {import('../../../core/registry.js').View} */
export default ({ meal }) => {
  /** @type {any[]} */
  const basket = [];
  /** @type {Map<string, any>} */
  const online = new Map();
  let q = '', showRecent = false, timer = 0, seq = 0;
  const findFood = (/** @type {string} */ id) => FOODS.find((f) => f.id === id) ?? online.get(id) ?? all('foods').find((f) => f.id === id);

  const add = (/** @type {any} */ food) => openGrams(food, (g) => {
    basket.push(logFood(food, g, meal));
    emit('toast', { text: t('food.added', { name: foodName(food), g }) });
    emit('ui:refresh');
  });

  const results = () => {
    const loc = searchLocal(q);
    return html`${loc.length ? html`<div class="card list mt10">${loc.map(foodRow)}</div>` : ''}
<div id="offres" aria-live="polite">${q.length >= 3 ? html`<div class="muted small b mt10 center">${t('food.searchingOnline')}</div>` : ''}</div>
${!loc.length && q ? html`<button class="btn sec w100 mt10" data-act="manual">${ic('edit', 18)}${t('food.manual')}</button>` : ''}`;
  };

  const searchOnline = async () => {
    const my = ++seq, { search } = await import('../off.js');
    const list = await search(q, getLang());
    if (my !== seq) return;
    list?.forEach((f) => f && online.set(f.id, f));
    patch('#offres', list == null ? html`<div class="muted small b mt10 center">${t('food.offlineSearch')}</div>`
      : list.length ? html`<div class="xs xb muted caps mt12">${t('food.onlineResults')}</div><div class="card list mt6">${list.map(foodRow)}</div>` : html`<div class="muted small b mt10 center">${t('food.noOnline')}</div>`);
  };

  /** Finish the meal: offer saving a repeated/multi-item meal. */
  const finish = async () => {
    const rows = basket.filter((r) => all('food').some((x) => x.id === r.id));
    const sig = signature(rows);
    const known = savedMeals().some((m) => signature(m.items) === sig);
    if (rows.length >= 2 && !known) await askSave(rows, timesEaten(all('food'), sig, view.date));
    emit('nav', { back: 'food' });
  };

  /** "Save this as a regular meal?" dialog. @param {any[]} rows @param {number} times */
  const askSave = (rows, times) => new Promise((resolve) => {
    let name = t('food.usualMeal', { meal: t(`meal.${meal}`).toLowerCase() });
    openSheet({
      kind: 'dialog',
      onClose: () => resolve(null),
      render: () => html`<div class="dlg-otter" id="saveotter"></div><h2 class="h2 center mt8">${t('food.saveTitle')}</h2>
<p class="muted b small mt6 center lh">${times >= 1 ? t('food.saveBodyTimes', { items: rows.map(foodName).join(' + '), meal: t(`meal.${meal}`).toLowerCase(), n: times + 1 }) : t('food.saveBody')}</p>
<label class="field mt16 hl">${ic('edit', 18, 2.2, 'var(--accent-d)')}<input class="bare" id="mealname" data-input="name" value="${name}" aria-label="${t('food.mealName')}"></label>
<div class="row gap8 mt10 wrap center-j">${rows.map((r) => html`<span class="chip">${foodName(r)}</span>`)}<span class="chip accent">${totals(rows).kcal} kcal</span></div>
<div class="row gap10 mt16"><button class="btn sec f1" data-close>${t('food.notNow')}</button><button class="btn f1" data-act="save">${t('food.saveMeal')}</button></div>`,
      mount: async (el) => {
        const { otter } = await import('../../mascot/api.js');
        const o = el.querySelector('#saveotter');
        if (o) o.innerHTML = String(otter({ size: 120, pose: 'wave' }));
      },
      actions: {
        name: (el) => ((name = /** @type {HTMLInputElement} */ (el).value), false),
        save: async () => {
          const { saveMeal } = await import('../api.js');
          saveMeal(name.trim() || t(`meal.${meal}`), rows);
          emit('toast', { key: 'food.mealSaved' });
          closeSheet();
          return false;
        },
      },
    });
  });

  const openCategory = (/** @type {string} */ cat) => openSheet({
    render: () => html`<h2 class="h2">${t(`foodcat.${cat}`)}</h2><div class="list mt8">${FOODS.filter((f) => f.cat === cat).map(foodRow)}</div>`,
    actions: { pick: (el) => { closeSheet(); setTimeout(() => add(findFood(el.dataset.id ?? '')), 0); return false; } },
  });

  return {
    tab: 'food',
    render: () => {
      const meals = savedMeals().slice(0, 4), picks = showRecent ? recentFoods() : quickPicks();
      const day = view.date === dayKey() ? t('common.today') : fmtDate(parseDay(view.date), { day: 'numeric', month: 'short' });
      return html`<div class="content add">
<header class="row between topbar"><button class="iconbtn" data-act="finish" aria-label="${t('common.back')}">${ic('back', 22)}</button>
<div class="center"><h1 class="h2">${t('food.add')}</h1><div class="muted xs b">${t('food.toMeal', { meal: t(`meal.${meal}`), day })}</div></div>
${basket.length ? html`<button class="btn sm" data-act="finish">${t('food.finishMeal')}</button>` : html`<span class="iconbtn ghost" aria-hidden="true"></span>`}</header>
<label class="search mt14">${ic('search', 20, 2.2)}<input id="fq" class="bare f1" type="search" data-input="q" value="${q}" placeholder="${t('food.searchPh')}" autocomplete="off" enterkeyhint="search" aria-label="${t('food.search')}">
<button class="iconbtn flat sm acc-bg" data-act="scan" aria-label="${t('food.scan')}">${ic('scan', 20, 2.2)}</button></label>
${basket.length ? html`<div class="card mt12 basket"><div class="row between"><span class="xs xb muted caps">${t('food.inMeal', { n: basket.length })}</span><span class="b num small">${totals(basket).kcal} kcal</span></div>
<div class="row gap6 wrap mt8">${basket.map((r, i) => html`<span class="chip">${r.emoji} ${foodName(r)} · ${r.grams} g<button class="x" data-act="undo" data-i="${i}" aria-label="${t('common.remove')} ${foodName(r)}">${ic('close', 14, 2.6)}</button></span>`)}</div></div>` : ''}
<div id="results">${q ? results() : ''}</div>
${q ? '' : html`
${meals.length ? html`<div class="section-title"><h2 class="h3">${t('food.regularMeals')}</h2><button class="link" data-go="food/meals">${t('common.all')}</button></div>
<div class="chips">${meals.map((m) => html`<button class="chip" data-act="logMeal" data-id="${m.id}">⭐ ${m.name} · ${totals(m.items).kcal}</button>`)}</div>` : ''}
<div class="section-title"><h2 class="h3">${showRecent ? t('food.recent') : t('food.quickPicks')}</h2><button class="link" data-act="recent" aria-pressed="${showRecent}">${showRecent ? t('food.quickPicks') : t('food.recent')}</button></div>
<div class="chips">${picks.length ? picks.map((f) => html`<button class="chip" data-act="pick" data-id="${f.id}">${f.emoji} ${foodName(f)}</button>`) : html`<span class="muted small b">${t('food.noRecent')}</span>`}</div>
<div class="section-title"><h2 class="h3">${t('food.categories')}</h2></div>
<div class="cats">${categoriesByUse().map((c) => html`<button class="cat" data-act="cat" data-id="${c.id}"><span class="e" style="background:${c.bg}">${c.emoji}</span>${t(`foodcat.${c.id}`)}</button>`)}</div>
<button class="btn sec w100 mt16" data-act="manual">${ic('edit', 18)}${t('food.manual')}</button>`}
</div>`;
    },
    mount: () => {
      const hash = location.hash;
      if (hash.endsWith('?scan')) setTimeout(() => document.querySelector('[data-act="scan"]')?.dispatchEvent(new MouseEvent('click', { bubbles: true })), 0);
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
      pick: (el) => (add(findFood(el.dataset.id ?? '')), false),
      cat: (el) => (openCategory(el.dataset.id ?? ''), false),
      recent: () => void (showRecent = !showRecent),
      undo: (el, ev) => {
        ev.stopPropagation();
        const [r] = basket.splice(Number(el.dataset.i), 1);
        if (r) unlog(r.id);
      },
      logMeal: (el) => {
        logSavedMeal(el.dataset.id ?? '', meal);
        emit('toast', { key: 'food.mealLogged' });
        emit('nav', { back: 'food' });
        return false;
      },
      finish: () => (finish(), false),
      scan: async () => {
        const { openScanner } = await import('./scan.js');
        openScanner((food) => add(food), () => openManual());
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
