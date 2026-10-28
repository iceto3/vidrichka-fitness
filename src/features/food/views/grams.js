/**
 * Grams sheet: big ±10 g stepper (typed values allowed), portion shortcut, live
 * kcal/macros, one-tap Done.
 * @module features/food/views/grams
 */
import { FOOD_NOTES } from '../../../data/foods.js';
import { emit } from '../../../core/bus.js';
import { html } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { stepper } from '../../../ui/components.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import { FOOD_CATEGORIES, foodName, saveFoodFix } from '../api.js';
import { known, missingValues, portion } from '../logic.js';
import { missingNotice } from './notice.js';

export const GRAM_STEP = 10;

/**
 * Macro line (П / В / М). A macro the product does not list (`food.missing`, e.g. an Open Food
 * Facts entry without carbs) shows "–" instead of a misleading 0.
 * @param {{p: number, c: number, f: number}} n @param {{missing?: string[]}} [food]
 */
export const macroLine = (n, food) => {
  const v = (/** @type {'p'|'c'|'f'} */ k) =>
    food?.missing?.includes(k) ? '–' : `${fmtNum(Math.round(n[k]))} ${t('unit.g')}`;
  return html`<span class="row gap12 small b num"><span><span class="cp">●</span> ${t('food.p')} ${v('p')}</span><span><span class="cc">●</span> ${t('food.c')} ${v('c')}</span><span><span class="cf">●</span> ${t('food.f')} ${v('f')}</span></span>`;
};

/**
 * Fiber / salt line (1.4.0: always both; an unknown one shows "–", never 0).
 * @param {{fib?: number, salt?: number}} n
 */
export const extraLine = (n) => {
  const g = (/** @type {number|undefined} */ v) =>
    known(v) ? `${fmtNum(/** @type {number} */ (v), 1)} ${t('unit.g')}` : '–';
  return html`<div class="muted small b num px4 mt6 extra">${t('food.fiber')} ${g(n.fib)} · ${t('food.salt')} ${g(n.salt)}</div>`;
};

/**
 * 1.4.0: open the fill-in form over the current sheet; the corrected food is saved with the
 * food (and its diary rows, see api.saveFoodFix) and handed to `then`.
 * @param {any} food @param {(fixed: any) => void} then @param {string} [rowId]
 */
export async function fixFood(food, then, rowId) {
  const { openFixForm } = await import('./manual.js');
  openFixForm(food, (fixed) => {
    saveFoodFix(fixed, rowId);
    toast(t('food.valuesFixed', { name: foodName(fixed) }));
    then(fixed);
  });
}

/**
 * Open the grams sheet.
 * @param {any} food Per-100 g food.
 * @param {(grams: number, food: any) => void} onDone Gets the food as finally used (1.4.0:
 *   with the values the user filled in).
 * @param {number} [initial]
 */
export function openGrams(food, onDone, initial) {
  let g = initial ?? food.portion ?? 100;
  const cat = FOOD_CATEGORIES.find((c) => c.id === food.cat);
  openSheet({
    render: () => {
      const n = portion(food, g);
      return html`<div class="row gap12"><div class="fic lg" style="background:${cat?.bg ?? 'var(--soft)'}">${food.emoji ?? '🍽️'}</div>
<div class="f1"><h2 class="h2">${foodName(food)}</h2><div class="muted small b">${cat ? `${t(`foodcat.${cat.id}`)} · ` : ''}${t('food.per100', { n: Math.round(food.kcal) })}</div></div></div>
<div class="mt14">${stepper({ act: 'g', value: g, unit: t('unit.g'), label: t('food.grams'), big: true, id: 'grams' })}</div>
${food.portion && food.portion !== g ? html`<div class="row center-j mt8"><button class="chip" data-act="portion">${t('food.portion', { n: food.portion })}</button></div>` : ''}
<div class="row between mt14 px4"><div class="num kcalbig">${fmtNum(n.kcal)} <small>${t('unit.kcal')}</small></div>${macroLine(n, food)}</div>
${extraLine(n)}
${FOOD_NOTES[food.id] ? html`<p class="muted xs b px4 mt6 fnote">${t(FOOD_NOTES[food.id])}</p>` : ''}
${missingNotice(missingValues(food))}
<button class="btn w100 mt14" data-act="done">${ic('check', 20, 3)}${t('workout.done')}</button>`;
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
      portion: () => void (g = food.portion),
      fix: () => {
        void fixFood(food, (fixed) => {
          food = fixed;
          emit('ui:refresh');
        });
        return false;
      },
      done: () => {
        if (g <= 0) return false;
        closeSheet();
        onDone(g, food);
        return false;
      },
    },
  });
}
