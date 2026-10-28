/**
 * Grams sheet: big ±10 g stepper (typed values allowed), portion shortcut, live
 * kcal/macros, one-tap Done.
 * @module features/food/views/grams
 */
import { html } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { stepper } from '../../../ui/components.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { FOOD_CATEGORIES, foodName } from '../api.js';
import { known, portion } from '../logic.js';

export const GRAM_STEP = 10;

/** Macro line (P / C / F). @param {{p: number, c: number, f: number}} n */
export const macroLine = (n) =>
  html`<span class="row gap12 small b num"><span><span class="cp">●</span> ${t('food.p')} ${Math.round(n.p)} ${t('unit.g')}</span><span><span class="cc">●</span> ${t('food.c')} ${Math.round(n.c)} ${t('unit.g')}</span><span><span class="cf">●</span> ${t('food.f')} ${Math.round(n.f)} ${t('unit.g')}</span></span>`;

/**
 * Fiber / salt line – only the values that are known (empty when neither is).
 * @param {{fib?: number, salt?: number}} n
 */
export const extraLine = (n) => {
  const parts = [];
  if (known(n.fib)) parts.push(`${t('food.fiber')} ${fmtNum(/** @type {number} */ (n.fib), 1)} ${t('unit.g')}`);
  if (known(n.salt)) parts.push(`${t('food.salt')} ${fmtNum(/** @type {number} */ (n.salt), 1)} ${t('unit.g')}`);
  return parts.length ? html`<div class="muted small b num px4 mt6 extra">${parts.join(' · ')}</div>` : '';
};

/**
 * Open the grams sheet.
 * @param {any} food Per-100 g food.
 * @param {(grams: number) => void} onDone
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
<div class="row between mt14 px4"><div class="num kcalbig">${fmtNum(n.kcal)} <small>${t('unit.kcal')}</small></div>${macroLine(n)}</div>
${extraLine(n)}
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
      done: () => {
        if (g <= 0) return false;
        closeSheet();
        onDone(g);
        return false;
      },
    },
  });
}
