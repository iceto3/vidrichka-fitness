/**
 * Edit one diary item (from the meal sheet): grams with live nutrition, move to another
 * meal, delete. Every change offers Undo.
 * @module features/food/views/item
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { get } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { seg, stepper } from '../../../ui/components.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { deleteWithUndo, undoEdit } from '../../../ui/undo.js';
import { editRow, foodName } from '../api.js';
import { MEALS, scaleRow } from '../logic.js';
import { GRAM_STEP, extraLine, macroLine } from './grams.js';

/**
 * Delete a diary row into "Recently deleted", with Undo.
 * @param {any} r
 */
export function deleteFoodRow(r) {
  deleteWithUndo(
    'food',
    [{ store: 'food', row: r }],
    {
      label: foodName(r),
      sub: `${t(`meal.${r.meal}`)} · ${fmtDate(`${r.date}T12:00`, { day: 'numeric', month: 'short' })} · ${r.grams} g`,
      emoji: r.emoji ?? '🍽️',
    },
    t('undo.deleted', { name: `${foodName(r)} · ${r.grams} g` }),
  );
}

/**
 * Open the item editor.
 * @param {string} id Diary row id.
 */
export function openItemEdit(id) {
  const row = get('food', id);
  if (!row) return;
  let g = row.grams,
    meal = row.meal;
  openSheet({
    render: () => {
      const n = scaleRow(row, g || 1);
      return html`<div class="itemedit"><div class="row gap12"><div class="fic lg">${row.emoji ?? '🍽️'}</div>
<div class="f1 minw0"><h2 class="h2">${foodName(row)}</h2><div class="muted small b">${row.time} · ${t('food.editItem')}</div></div></div>
<div class="mt14">${stepper({ act: 'g', value: g, unit: 'g', label: t('food.grams'), big: true, id: 'egrams' })}</div>
<div class="row between mt14 px4"><div class="num kcalbig">${n.kcal} <small>kcal</small></div>${macroLine(n)}</div>
${extraLine(n)}
<div class="xs xb muted caps mt16">${t('food.moveTo')}</div>
<div class="mt6">${seg(
        MEALS.map(([m]) => ({ value: m, label: t(`meal.${m}`) })),
        meal,
        'meal',
        'seg mealseg',
      )}</div>
<div class="row gap10 mt16"><button class="btn sec danger-t f1" data-act="del">${ic('trash', 18, 2.2)}${t('common.delete')}</button><button class="btn f2" data-act="save">${ic('check', 20, 3)}${t('common.save')}</button></div></div>`;
    },
    actions: {
      g: (el, ev) =>
        void (g = Math.min(
          5000,
          Math.max(
            0,
            ev.type === 'change'
              ? Math.round(parseFloat(/** @type {HTMLInputElement} */ (el).value) || 0)
              : g + Number(el.dataset.d) * GRAM_STEP,
          ),
        )),
      meal: (el) => void (meal = el.dataset.v ?? meal),
      del: () => {
        const r = get('food', id);
        closeSheet();
        if (r) deleteFoodRow(r);
        return false;
      },
      save: () => {
        if (g <= 0) return false;
        const res = editRow(id, { grams: g, meal });
        closeSheet();
        if (!res) return false;
        const { before, after } = res;
        if (before.grams === after.grams && before.meal === after.meal) return false;
        const name = foodName(after),
          to = t(`meal.${after.meal}`);
        const what =
          before.meal === after.meal
            ? t('food.gramsChanged', { name, from: before.grams, to: after.grams })
            : before.grams === after.grams
              ? t('food.movedTo', { name, meal: to })
              : t('food.itemChanged', { name, g: after.grams, meal: to });
        undoEdit(what, [{ store: 'food', before: [before] }]);
        return false;
      },
    },
  });
}
