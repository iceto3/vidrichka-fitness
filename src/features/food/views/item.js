/**
 * Edit one diary item (from the meal sheet): grams with live nutrition, move to another
 * meal, delete. Every change offers Undo. 1.5.1 (user decision): an item has no time of its
 * own – the meal's clock (in the meal sheet) is the time of all its foods; an item moved to
 * another meal takes that meal's time (editRow).
 * @module features/food/views/item
 */
import { emit } from '../../../core/bus.js';
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { get } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { seg } from '../../../ui/components.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { editRow, foodById, foodName, mealName } from '../api.js';
import { MEALS, isExtra, missingValues, scaleRow } from '../logic.js';
import { enabledMeals } from '../../../core/settings.js';
import { extraLine, fixFood, gramStepper, gramsFrom, macroLine } from './grams.js';
import { missingNotice } from './notice.js';

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
      sub: `${mealName(r.meal, r.date)} · ${fmtDate(`${r.date}T12:00`, { day: 'numeric', month: 'short' })} · ${r.grams} ${t('unit.g')}`,
      emoji: r.emoji ?? '🍽️',
    },
    t('undo.deleted', { name: `${foodName(r)} · ${r.grams} ${t('unit.g')}` }),
  );
}

/**
 * Open the item editor.
 * @param {string} id Diary row id.
 */
export function openItemEdit(id) {
  let row = get('food', id);
  if (!row) return;
  /** 1.4.0: the food behind the row (Open Food Facts products: what it still lacks). */
  const food = () => (row.foodId ? foodById(row.foodId) : null);
  let g = row.grams,
    meal = row.meal;
  openSheet({
    render: () => {
      const n = scaleRow(row, g || 1, food());
      return html`<div class="itemedit"><div class="row gap12"><div class="fic lg">${row.emoji ?? '🍽️'}</div>
<div class="f1 minw0"><h2 class="h2">${foodName(row)}</h2><div class="muted small b">${t('food.editItem')}</div></div></div>
<div class="mt14">${gramStepper({ act: 'g', value: g, id: 'egrams' })}</div>
<div class="row between mt14 px4"><div class="num kcalbig">${fmtNum(n.kcal)} <small>${t('unit.kcal')}</small></div>${macroLine(n, row)}</div>
${extraLine(n)}
${missingNotice(missingValues(food() ?? row), { button: !!food() })}
<div class="xs xb muted caps mt16">${t('food.moveTo')}</div>
<div class="mt6">${seg(
        // 1.4.3 (part B): the meals in use (+ the row's own meal), short names so five fit
        [
          // 1.5.0: an unplanned meal's entry can go back to it after being moved
          ...(isExtra(row.meal) ? [{ value: row.meal, label: mealName(row.meal, row.date) }] : []),
          ...MEALS.map(([m]) => m)
            .filter((m) => m === row.meal || m === meal || enabledMeals().includes(m))
            .map((m) => ({ value: m, label: t(`mealShort.${m}`) })),
        ],
        meal,
        'meal',
        'seg mealseg',
      )}</div>
<div class="row gap10 mt16"><button class="btn sec danger-t f1" data-act="del">${ic('trash', 18, 2.2)}${t('common.delete')}</button><button class="btn f2" data-act="save">${ic('check', 20, 3)}${t('common.save')}</button></div></div>`;
    },
    actions: {
      g: (el, ev) => void (g = gramsFrom(g, el, ev)),
      meal: (el) => void (meal = el.dataset.v ?? meal),
      // 1.4.0: fill in a value the product lacks – saved with the food and this row
      fix: () => {
        const f = food();
        if (!f) return false;
        void fixFood(
          f,
          () => {
            row = get('food', id) ?? row;
            emit('ui:refresh');
          },
          id,
        );
        return false;
      },
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
        const name = foodName(after),
          to = mealName(after.meal, after.date);
        if (before.grams === after.grams && before.meal === after.meal) return false;
        const what =
          before.meal === after.meal
            ? t('food.gramsChanged', { name, from: before.grams, to: after.grams })
            : before.grams === after.grams
              ? t('food.movedTo', { name, meal: to })
              : t('food.itemChanged', { name, g: after.grams, meal: to });
        toast(what);
        // 1.5.1: no `return false` – the meal sheet under the editor re-renders at once
      },
    },
  });
}
