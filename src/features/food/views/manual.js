/**
 * Manual food entry (fallback for unknown barcodes / offline): name, kcal and macros per
 * 100 g, saved to the custom foods store for reuse.
 * @module features/food/views/manual
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { uid } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';

const FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'f']);

/**
 * @param {{name?: string, barcode?: string}} init
 * @param {(food: any) => void} onSave
 */
export function openManualForm(init, onSave) {
  /** @type {Record<string, string>} */
  const v = { name: init.name ?? '', kcal: '', p: '', c: '', f: '', portion: '100' };
  openSheet({
    render: () => html`<h2 class="h2">${t('food.manual')}</h2><p class="muted small b mt4">${t('manual.hint')}</p>
<label class="field mt12"><span>${t('manual.name')}</span><input class="input" id="mname" data-input="v" data-k="name" value="${v.name}" autocomplete="off"></label>
<div class="grid2 mt10">${FIELDS.map((k) => html`<label class="field"><span>${t(`manual.${k}`)}</span><input class="input" id="m${k}" inputmode="decimal" data-input="v" data-k="${k}" value="${v[k]}"></label>`)}
<label class="field"><span>${t('manual.portion')}</span><input class="input" id="mportion" inputmode="numeric" data-input="v" data-k="portion" value="${v.portion}"></label></div>
<button class="btn w100 mt16" data-act="save">${t('common.save')}</button>`,
    actions: {
      v: (el) => ((v[el.dataset.k ?? ''] = /** @type {HTMLInputElement} */ (el).value), false),
      save: () => {
        const n = (/** @type {string} */ k) => Math.max(0, parseFloat(v[k].replace(',', '.')) || 0);
        if (!v.name.trim() || !n('kcal')) return (emit('toast', { key: 'manual.need' }), false);
        const food = {
          id: uid('custom'),
          source: 'custom',
          cat: 'other',
          emoji: '🍽️',
          name: v.name.trim(),
          barcode: init.barcode || undefined,
          kcal: n('kcal'),
          p: n('p'),
          c: n('c'),
          f: n('f'),
          portion: n('portion') || 100,
        };
        closeSheet();
        setTimeout(() => onSave(food), 0);
        return false;
      },
    },
  });
}
