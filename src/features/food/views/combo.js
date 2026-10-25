/**
 * Save a combination ("regular meal") dialog: the default name is pre-selected so typing
 * replaces it; saving offers Undo. Used after finishing a meal in Add food and by
 * „Запази като комбинация“ in the meal sheet.
 * @module features/food/views/combo
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { remove } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { deleteWithUndo, undoEdit } from '../../../ui/undo.js';
import { foodName, logSavedMeal, saveMeal } from '../api.js';
import { totals } from '../logic.js';

/**
 * Open the dialog. Resolves with the saved meal, or null when dismissed.
 * @param {{rows: any[], meal: string, title?: string, body?: string, cancel?: string}} o
 * @returns {Promise<any>}
 */
export function openSaveCombo({ rows, meal, title, body, cancel }) {
  return new Promise((resolve) => {
    let name = t('food.usualMeal', { meal: t(`meal.${meal}`).toLowerCase() });
    let saved = /** @type {any} */ (null);
    openSheet({
      kind: 'dialog',
      onClose: () => resolve(saved),
      render:
        () => html`<div class="dlg-otter" id="saveotter"></div><h2 class="h2 center mt8">${title ?? t('food.saveTitle')}</h2>
<p class="muted b small mt6 center lh">${body ?? t('food.saveBody')}</p>
<label class="field mt16 hl">${ic('edit', 18, 2.2, 'var(--accent-d)')}<input class="bare" id="mealname" data-input="name" value="${name}" aria-label="${t('food.mealName')}" enterkeyhint="done" autocomplete="off"></label>
<div class="row gap8 mt10 wrap center-j">${rows.map((r) => html`<span class="chip">${foodName(r)} · ${r.grams} g</span>`)}<span class="chip accent">${totals(rows).kcal} kcal</span></div>
<div class="row gap10 mt16"><button class="btn sec f1" data-close>${cancel ?? t('food.notNow')}</button><button class="btn f1" data-act="save">${t('food.saveMeal')}</button></div>`,
      mount: async (el) => {
        const input = /** @type {HTMLInputElement|null} */ (el.querySelector('#mealname'));
        // Pre-select the suggested name: typing replaces it, a tap on Save keeps it.
        if (input) (input.focus({ preventScroll: true }), input.select());
        const { otter } = await import('../../mascot/api.js');
        const o = el.querySelector('#saveotter');
        if (o) o.innerHTML = String(otter({ size: 120, pose: 'wave' }));
      },
      actions: {
        name: (el) => ((name = /** @type {HTMLInputElement} */ (el).value), false),
        save: () => {
          saved = saveMeal(name.trim() || t(`meal.${meal}`), rows);
          const id = saved.id;
          closeSheet();
          undoEdit(t('food.comboSaved', { name: saved.name }), [], () => remove('meals', id));
          return false;
        },
      },
    });
  });
}

/**
 * Log a saved combination into a meal and offer Undo (removes the added rows and puts the
 * combination's use count back).
 * @param {string} id
 * @param {string} meal
 * @returns {boolean} false if the combination no longer exists.
 */
export function addCombo(id, meal) {
  const res = logSavedMeal(id, meal);
  if (!res) return false;
  undoEdit(t('food.comboAdded', { meal: t(`meal.${meal}`).toLowerCase(), items: res.rows.map(foodName).join(', ') }), [
    { store: 'food', added: res.rows.map((r) => r.id) },
    { store: 'meals', before: [res.before] },
  ]);
  return true;
}

/**
 * Delete a saved combination into "Recently deleted", with Undo.
 * @param {any} m
 */
export function deleteCombo(m) {
  deleteWithUndo('meal', [{ store: 'meals', row: m }], {
    label: m.name,
    sub: `${totals(m.items).kcal} kcal`,
    emoji: '⭐',
  });
}
