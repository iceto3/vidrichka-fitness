/**
 * 1.4.4 „Ръчно добавени храни“: the foods the user entered by hand, in the add screen's
 * order (favorites, most used, the rest). Tap = add, ✎ = edit (values, creatine, package
 * photo, „Изтрий“), ☆ = favorite. „Изтрий храни“ switches to a delete mode with check boxes
 * and „Изтрий (N)“ → a confirmation → Recently deleted with the usual Undo. Diary rows are
 * copies, so editing or deleting a food never changes past days. Built-in foods never
 * appear here (they can't be edited or deleted).
 * @module features/food/views/custom
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, confirmDialog, openSheet, toast } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { emit } from '../../../core/bus.js';
import { customFoods, foodById, foodName, isCustom, toggleFav, updateCustomFood } from '../api.js';
import { foodIcon, foodRow, foodSub, groupedList } from './foodlist.js';
import { openEditForm, openManualForm } from './manual.js';

/**
 * Move custom foods to Recently deleted, with Undo (one pill for the whole batch).
 * @param {any[]} foods
 */
export function deleteCustomFoods(foods) {
  const list = foods.filter(isCustom);
  if (!list.length) return '';
  return deleteWithUndo(
    'customFood',
    list.map((row) => ({ store: 'foods', row })),
    {
      label: list.length === 1 ? foodName(list[0]) : t('custom.nFoods', { n: list.length }),
      sub: list.length === 1 ? foodSub(list[0]) : list.map(foodName).join(', ').slice(0, 80),
      emoji: '✍️',
    },
  );
}

/** Ask, then delete. @param {any[]} foods @returns {Promise<boolean>} */
async function confirmDelete(foods) {
  const n = foods.length;
  const ok = await confirmDialog({
    title: n === 1 ? t('custom.confirmOne', { name: foodName(foods[0]) }) : t('custom.confirmN', { n }),
    body: t('custom.confirmBody'),
    ok: t('common.delete'),
    danger: true,
  });
  if (ok) deleteCustomFoods(foods);
  return ok;
}

/**
 * Edit one custom food (also used from search results / Любими later).
 * @param {string} id
 */
export function editCustomFood(id) {
  const food = foodById(id);
  if (!isCustom(food)) return;
  openEditForm(food, {
    onSave: (change) => {
      if (updateCustomFood(id, change)) toast(t('custom.saved'));
    },
    onDelete: () => void confirmDelete([food]),
  });
}

/**
 * The „Ръчно добавени храни“ sheet.
 * @param {(food: any) => void} onPick Add the food (opens the grams sheet).
 */
export function openCustomFoods(onPick) {
  let del = false;
  /** @type {Set<string>} */
  const sel = new Set();
  const editBtn = (/** @type {any} */ f) =>
    html`<button class="iconbtn flat sm fedit" data-act="edit" data-id="${f.id}" aria-label="${t('custom.edit', { name: foodName(f) })}">${ic('edit', 18, 2.2)}</button>`;
  const checkRow = (/** @type {any} */ f) =>
    html`<label class="lrow frow delrow"><input type="checkbox" class="fchk" data-change="sel" data-id="${f.id}"${sel.has(f.id) ? ' checked' : ''} aria-label="${foodName(f)}">${foodIcon(f)}<span class="f1 left minw0"><span class="b block ellip">${foodName(f)}</span><span class="muted xs b">${foodSub(f)}</span></span></label>`;
  openSheet({
    render: () => {
      const foods = customFoods();
      for (const id of [...sel]) if (!foods.some((f) => f.id === id)) sel.delete(id);
      if (!foods.length) del = false;
      const head = html`<h2 class="h2">${t(del ? 'custom.deleteTitle' : 'food.customFoods')}</h2>`;
      if (!foods.length)
        return html`${head}<p class="muted small b mt8">${t('custom.empty')}</p><button class="btn sec w100 mt14" data-act="newFood">${ic('plus', 18, 2.4)}${t('custom.new')}</button>`;
      if (del)
        return html`${head}<p class="muted small b mt4">${t('custom.deleteHint')}</p><div class="list mt8 flist">${foods.map(checkRow)}</div>
<div class="row gap10 mt16 delbar"><button class="btn sec f1" data-act="delCancel">${t('common.cancel')}</button><button class="btn danger f1" data-act="delGo"${sel.size ? '' : ' disabled'}>${t('custom.deleteN', { n: sel.size })}</button></div>`;
      return html`${head}<div class="row gap10 mt4 customhead"><p class="muted small b f1">${t('custom.hint')}</p><button class="btn sec sm delmode" data-act="delMode">${ic('trash', 16, 2.2)}${t('custom.deleteMode')}</button></div><div class="list mt8 flist">${groupedList(foods, (f) => foodRow(f, editBtn(f)))}</div>
<button class="btn sec w100 mt14" data-act="newFood">${ic('plus', 18, 2.4)}${t('custom.new')}</button>`;
    },
    actions: {
      pick: (el) => {
        const food = foodById(el.dataset.id ?? '');
        closeSheet();
        if (food) setTimeout(() => onPick(food), 0);
        return false;
      },
      fav: (el) => {
        toast(t(toggleFav(el.dataset.id ?? '') ? 'food.favAdded' : 'food.favRemoved'));
        emit('ui:refresh');
        return false;
      },
      edit: (el) => (editCustomFood(el.dataset.id ?? ''), false),
      newFood: () => (openManualForm({}, (food) => (closeSheet(), onPick(food))), false),
      delMode: () => void ((del = true), sel.clear()),
      delCancel: () => void ((del = false), sel.clear()),
      sel: (el) => {
        const id = el.dataset.id ?? '';
        if (/** @type {HTMLInputElement} */ (el).checked) sel.add(id);
        else sel.delete(id);
      },
      delGo: async () => {
        const foods = [...sel].map(foodById).filter(isCustom);
        if (!foods.length) return false;
        if (await confirmDelete(foods)) ((del = false), sel.clear());
        emit('ui:refresh');
        return false;
      },
    },
  });
}
