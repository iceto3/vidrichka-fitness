/**
 * Edit one diary item (from the meal sheet): grams with live nutrition, move to another
 * meal, (1.4.4) its time („Час“), delete. Every change offers Undo.
 * @module features/food/views/item
 */
import { emit } from '../../../core/bus.js';
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { get } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { seg, time24 } from '../../../ui/components.js';
import { closeSheet, openSheet, refreshSheet, toast } from '../../../ui/sheet.js';
import { hhmm, hmComplete, parseHM, stepHM } from '../../../core/dates.js';
import { checkFoodTime, foodTimeFloor, setFoodTime } from '../../daily/api.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { editRow, foodById, foodName } from '../api.js';
import { MEALS, missingValues, scaleRow } from '../logic.js';
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
      sub: `${t(`meal.${r.meal}`)} · ${fmtDate(`${r.date}T12:00`, { day: 'numeric', month: 'short' })} · ${r.grams} ${t('unit.g')}`,
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
  /** 1.4.4 (time): the entry's time – checked only once changed (older data may be off). */
  const time0 = row.time ?? hhmm(new Date(row.ts));
  /** @type {{hm: string, typed?: string}} */
  const tm = { hm: time0 };
  const timeErr = () => {
    if (tm.typed != null) return 'time24.bad';
    if (tm.hm === time0) return '';
    const r = checkFoodTime(row.date, tm.hm);
    return 'err' in r ? `mealTime.err.${r.err}` : '';
  };
  openSheet({
    render: () => {
      const n = scaleRow(row, g || 1, food()),
        terr = timeErr();
      return html`<div class="itemedit"><div class="row gap12"><div class="fic lg">${row.emoji ?? '🍽️'}</div>
<div class="f1 minw0"><h2 class="h2">${foodName(row)}</h2><div class="muted small b">${t('food.editItem')}</div></div></div>
<div class="mt14">${gramStepper({ act: 'g', value: g, id: 'egrams' })}</div>
<div class="row between mt14 px4"><div class="num kcalbig">${fmtNum(n.kcal)} <small>${t('unit.kcal')}</small></div>${macroLine(n, row)}</div>
${extraLine(n)}
${missingNotice(missingValues(food() ?? row), { button: !!food() })}
<div class="xs xb muted caps mt16">${t('food.moveTo')}</div>
<div class="mt6">${seg(
        // 1.4.3 (part B): the meals in use (+ the row's own meal), short names so five fit
        MEALS.map(([m]) => m)
          .filter((m) => m === row.meal || m === meal || enabledMeals().includes(m))
          .map((m) => ({ value: m, label: t(`mealShort.${m}`) })),
        meal,
        'meal',
        'seg mealseg',
      )}</div>
<div class="field mt14 itemtime"><span>${t('food.time')}</span>${time24({ value: tm.typed ?? tm.hm, act: 'hm', step: 'hmstep', mins: 5, label: t('food.time'), bad: !!terr })}</div>
${
  terr
    ? html`<p class="small b danger-t mt8 timeerr" role="alert">${t(terr)}</p>`
    : html`<p class="xs b muted mt6">${t('food.timeMeal')}</p>`
}
<div class="row gap10 mt16"><button class="btn sec danger-t f1" data-act="del">${ic('trash', 18, 2.2)}${t('common.delete')}</button><button class="btn f2" data-act="save"${terr ? ' disabled' : ''}>${ic('check', 20, 3)}${t('common.save')}</button></div></div>`;
    },
    actions: {
      g: (el, ev) => void (g = gramsFrom(g, el, ev)),
      meal: (el) => void (meal = el.dataset.v ?? meal),
      // 1.4.4 (time): typed 24 h like „Кога яде?“, ±5 min; − stops at the wake-up
      hm: (el, ev) => {
        const txt = /** @type {HTMLInputElement} */ (el).value,
          v = parseHM(txt);
        if (ev?.type === 'input') {
          if (!hmComplete(txt) || !v) return false;
          ((tm.hm = v), (tm.typed = undefined));
        } else if (v) {
          ((tm.hm = v), (tm.typed = undefined));
          /** @type {HTMLInputElement} */ (el).value = v;
        } else tm.typed = txt;
        refreshSheet();
        return false;
      },
      hmstep: (el) => {
        tm.hm = stepHM(tm.hm, Number(el.dataset.d));
        tm.typed = undefined;
        const floor = foodTimeFloor(row.date),
          c = checkFoodTime(row.date, tm.hm);
        if (floor && 'err' in c && c.err === 'early') tm.hm = floor;
        refreshSheet();
        return false;
      },
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
        if (g <= 0 || timeErr()) return false;
        const res = editRow(id, { grams: g, meal });
        // 1.4.4 (time): the new time after the grams / meal (1.5.0: every meal moves as one;
        // today's graded protein breakfast re-grades with its own result toast)
        const moved = res && tm.hm !== time0 ? setFoodTime(id, tm.hm) : null;
        closeSheet();
        if (!res) return false;
        const { before, after } = res;
        const name = foodName(after),
          to = t(`meal.${after.meal}`);
        if (moved?.ok && 'graded' in moved && moved.graded) return false;
        if (before.grams === after.grams && before.meal === after.meal) {
          if (moved?.ok) toast(t('food.timeChanged', { name, time: tm.hm }));
          return false;
        }
        const what =
          before.meal === after.meal
            ? t('food.gramsChanged', { name, from: before.grams, to: after.grams })
            : before.grams === after.grams
              ? t('food.movedTo', { name, meal: to })
              : t('food.itemChanged', { name, g: after.grams, meal: to });
        toast(what);
        return false;
      },
    },
  });
}
