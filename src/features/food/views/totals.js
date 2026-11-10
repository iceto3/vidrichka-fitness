/**
 * 1.4.3: the meal totals line, shared by the Храна meals overview and the Home / Day
 * „Хранения днес“ card (small module, no catalog import, so Home stays light).
 * @module features/food/views/totals
 */
import { html } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';

/**
 * 1.4.3 (part A): a meal's protein / carbs / fat under its foods:
 * „● пр 42 · ● вх 1 · ● мз 44“ (whole grams, no unit, the macro colours of the grams sheet).
 * @param {{p: number, c: number, f: number}} tot
 */
export const mealTotalsLine = (tot) =>
  html`<span class="muted small b num block ellip mtot">${[
    ['cp', 'nutr.p', tot.p],
    ['cc', 'nutr.c', tot.c],
    ['cf', 'nutr.f', tot.f],
  ].map(
    ([cls, k, v], i) =>
      html`${i ? ' · ' : ''}<span class="${String(cls)}">●</span> ${t(String(k))} ${fmtNum(Math.round(Number(v) || 0))}`,
  )}</span>`;
