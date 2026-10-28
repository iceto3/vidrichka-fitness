/**
 * Save / rename a combination ("regular meal"): the suggested name is pre-selected so typing
 * replaces it; an empty or already used name is refused with an inline message. Used after finishing a meal in Add food and by
 * „Запази като комбинация“ in the meal sheet.
 * @module features/food/views/combo
 */
import { html } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { comboNameError, foodName, logSavedMeal, renameMeal, saveMeal } from '../api.js';
import { totals } from '../logic.js';

/** Meals with their own suggested name (the BG article agrees with each meal's gender). */
const USUAL = ['breakfast', 'lunch', 'dinner', 'snack'];

/** Suggested name for a combination of this meal, e.g. „Обичайният ти обяд“. @param {string} meal */
export const usualName = (meal) => t(`food.usualMeal.${USUAL.includes(meal) ? meal : 'snack'}`);

/**
 * The name field + inline error shared by the save and rename dialogs.
 * @param {string} name @param {string} err i18n key of the current error, or ''
 */
const nameField = (name, err) =>
  html`<label class="field mt16 hl${err ? ' bad' : ''}">${ic('edit', 18, 2.2, 'var(--accent-d)')}<input class="bare" id="mealname" data-input="name" value="${name}" aria-label="${t('food.mealName')}" aria-invalid="${String(!!err)}" aria-describedby="nameerr" maxlength="40" enterkeyhint="done" autocomplete="off"></label>
<small class="ferr mt6 left" id="nameerr" role="alert">${err ? t(err) : ''}</small>`;

/** Focus the name field with its text selected (typing replaces it). @param {HTMLElement} el */
const selectName = (el) => {
  const input = /** @type {HTMLInputElement|null} */ (el.querySelector('#mealname'));
  if (input) (input.focus({ preventScroll: true }), input.select());
};

/**
 * Open the dialog. Resolves with the saved meal, or null when dismissed. The name is
 * required and must not repeat another combination's name.
 * @param {{rows: any[], meal: string, title?: string, body?: string, cancel?: string}} o
 * @returns {Promise<any>}
 */
export function openSaveCombo({ rows, meal, title, body, cancel }) {
  return new Promise((resolve) => {
    let name = usualName(meal);
    let err = '';
    let saved = /** @type {any} */ (null);
    openSheet({
      kind: 'dialog',
      onClose: () => resolve(saved),
      render:
        () => html`<div class="dlg-otter" id="saveotter"></div><h2 class="h2 center mt8">${title ?? t('food.saveTitle')}</h2>
<p class="muted b small mt6 center lh">${body ?? t('food.saveBody')}</p>
${nameField(name, err)}
<div class="row gap8 mt10 wrap center-j">${rows.map((r) => html`<span class="chip">${foodName(r)} · ${r.grams} ${t('unit.g')}</span>`)}<span class="chip accent">${fmtNum(totals(rows).kcal)} ${t('unit.kcal')}</span></div>
<div class="row gap10 mt16"><button class="btn sec f1" data-close>${cancel ?? t('food.notNow')}</button><button class="btn f1" data-act="save">${t('food.saveMeal')}</button></div>`,
      mount: async (el) => {
        selectName(el);
        const { otter } = await import('../../mascot/api.js');
        const o = el.querySelector('#saveotter');
        if (o) o.innerHTML = String(otter({ size: 120, pose: 'wave' }));
      },
      actions: {
        name: (el) => {
          name = /** @type {HTMLInputElement} */ (el).value;
          if (!err) return false;
          err = ''; // the error goes away as soon as the name is being fixed
        },
        save: (el) => {
          err = comboNameError(name) ?? '';
          if (err) return void selectName(/** @type {HTMLElement} */ (el.closest('.panel')));
          saved = saveMeal(name.trim(), rows);
          closeSheet();
          toast(t('food.comboSaved', { name: saved.name }));
          return false;
        },
      },
    });
  });
}

/**
 * Rename a saved combination (same rules as saving: required, no duplicates).
 * @param {any} m
 */
export function openRenameCombo(m) {
  let name = m.name;
  let err = '';
  openSheet({
    kind: 'dialog',
    render: () => html`<h2 class="h2">${t('food.renameTitle')}</h2>
${nameField(name, err)}
<div class="row gap10 mt12"><button class="btn sec f1" data-close>${t('common.cancel')}</button><button class="btn f1" data-act="save">${t('common.save')}</button></div>`,
    mount: selectName,
    actions: {
      name: (el) => {
        name = /** @type {HTMLInputElement} */ (el).value;
        if (!err) return false;
        err = '';
      },
      save: (el) => {
        err = comboNameError(name, m.id) ?? '';
        if (err) return void selectName(/** @type {HTMLElement} */ (el.closest('.panel')));
        const r = renameMeal(m.id, name);
        closeSheet();
        if (r && r.name !== m.name) toast(t('food.renamed', { name: r.name }));
        return false;
      },
    },
  });
}

/**
 * Log a saved combination into a meal (a short toast says what was added).
 * @param {string} id
 * @param {string} meal
 * @returns {boolean} false if the combination no longer exists.
 */
export function addCombo(id, meal) {
  const res = logSavedMeal(id, meal);
  if (!res) return false;
  toast(t('food.comboAdded', { meal: t(`meal.${meal}`).toLowerCase(), items: res.rows.map(foodName).join(', ') }));
  return true;
}

/**
 * Delete a saved combination into "Recently deleted", with Undo.
 * @param {any} m
 */
export function deleteCombo(m) {
  deleteWithUndo('meal', [{ store: 'meals', row: m }], {
    label: m.name,
    sub: `${fmtNum(totals(m.items).kcal)} ${t('unit.kcal')}`,
    emoji: '⭐',
  });
}
