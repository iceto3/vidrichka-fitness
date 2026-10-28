/**
 * 1.4.0: the notice shown wherever a food from Open Food Facts lacks values (grams sheet,
 * diary item, fill-in form): "Липсва стойност за … – брои се като 0. Попълни я." plus an
 * optional "Попълни" button (`data-act="fix"`) that opens the fill-in form.
 * @module features/food/views/notice
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';

/**
 * @param {string[]} miss Keys from logic.NUTRIENTS (see logic.missingValues).
 * @param {{button?: boolean}} [o]
 */
export const missingNotice = (miss, o = {}) =>
  miss.length
    ? html`<div class="card mt12 missnote" role="alert"><p class="fwarn">⚠ ${t('food.missingValues', {
        n: miss.length,
        what: miss.map((k) => t(`nutrient.${k}`)).join(', '),
      })}</p>${o.button === false ? '' : html`<button class="btn sm mt8" data-act="fix">${t('food.fillIn')}</button>`}</div>`
    : '';
