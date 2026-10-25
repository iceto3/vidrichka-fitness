/**
 * Regular (saved) meals: log with one tap into the current meal slot, rename or delete.
 * @module features/food/views/meals
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { get } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { empty, topBar } from '../../../ui/components.js';
import { confirmDialog } from '../../../ui/sheet.js';
import { foodName, savedMeals } from '../api.js';
import { addCombo, deleteCombo, openRenameCombo } from './combo.js';
import { mealFor, totals } from '../logic.js';

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'food',
  render: () => {
    const list = savedMeals(),
      slot = mealFor();
    return html`<div class="content">${topBar(t('food.regularMeals'), t('food.logInto', { meal: t(`meal.${slot}`) }))}
${
  list.length
    ? list.map(
        (
          m,
        ) => html`<article class="card mt12"><div class="row between"><h2 class="h3 xb">⭐ ${m.name}</h2><span class="b num">${totals(m.items).kcal} kcal</span></div>
<div class="muted small b mt4">${m.items.map((/** @type {any} */ i) => `${foodName(i)} ${i.grams} ${t('unit.g')}`).join(' · ')}</div>
<div class="row gap8 mt10"><button class="btn sm f1" data-act="log" data-id="${m.id}">${ic('plus', 16, 2.6)}${t('food.logNow')}</button>
<button class="iconbtn flat sm" data-act="rename" data-id="${m.id}" aria-label="${t('food.rename')} ${m.name}">${ic('edit', 18)}</button>
<button class="iconbtn flat sm" data-act="del" data-id="${m.id}" aria-label="${t('common.delete')} ${m.name}">${ic('trash', 18)}</button></div></article>`,
      )
    : html`<div class="mt16">${empty('star', t('food.noMeals'))}</div>`
}</div>`;
  },
  actions: {
    log: (el) => {
      if (addCombo(el.dataset.id ?? '', mealFor())) emit('nav', { path: 'food' });
      return false;
    },
    rename: (el) => {
      const m = get('meals', el.dataset.id ?? '');
      if (m) openRenameCombo(m);
      return false;
    },
    del: async (el) => {
      const m = get('meals', el.dataset.id ?? '');
      if (m && (await confirmDialog({ title: t('food.deleteMeal'), ok: t('common.delete'), danger: true })))
        deleteCombo(m);
    },
  },
});
