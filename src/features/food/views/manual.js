/**
 * Manual food entry (fallback for unknown barcodes / offline): name, kcal and macros per
 * 100 g (1.3.1: plus optional fiber and salt – left empty they stay unknown), saved to the custom foods store for reuse.
 * @module features/food/views/manual
 */
import { shareFood } from '../../improve/share.js';
import { confirmDataNotice } from '../../improve/notice.js';
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { uid } from '../../../core/store.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { validateFood } from '../logic.js';

const FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'f', 'fib', 'salt']);

/**
 * @param {{name?: string, barcode?: string}} init
 * @param {(food: any) => void} onSave
 */
export function openManualForm(init, onSave) {
  /** @type {Record<string, string>} */
  const v = { name: init.name ?? '', kcal: '', p: '', c: '', f: '', fib: '', salt: '', portion: '100' };
  /** @type {Record<string, string>} */
  let errors = {};
  /** @type {string|null} The kcal warning that was shown (a second Save confirms it). */
  let warned = null;
  const err = (/** @type {string} */ k) =>
    errors[k] ? html`<small class="ferr" id="e_${k}" role="alert">${t(errors[k])}</small>` : '';
  openSheet({
    render: () => html`<h2 class="h2">${t('food.manual')}</h2><p class="muted small b mt4">${t('manual.hint')}</p>
<label class="field mt12"><span>${t('manual.name')}</span><input class="input${errors.name ? ' bad' : ''}" id="mname" data-input="v" data-k="name" value="${v.name}" autocomplete="off">${err('name')}</label>
<div class="grid2 mt10">${FIELDS.map((k) => html`<label class="field"><span>${t(`manual.${k}`)}</span><input class="input${errors[k] ? ' bad' : ''}" id="m${k}" inputmode="decimal" data-input="v" data-k="${k}" value="${v[k]}"${k === 'fib' || k === 'salt' ? html` placeholder="${t('manual.optional')}"` : ''} aria-invalid="${String(!!errors[k])}">${err(k)}</label>`)}
<label class="field"><span>${t('manual.portion')}</span><input class="input${errors.portion ? ' bad' : ''}" id="mportion" inputmode="numeric" data-input="v" data-k="portion" value="${v.portion}" aria-invalid="${String(!!errors.portion)}">${err('portion')}</label></div>
${warned ? html`<p class="fwarn mt10" role="alert">${t(warned, { est: validateFood(v).est })}</p>` : ''}
<button class="btn w100 mt16" data-act="save">${warned ? t('manual.saveAnyway') : t('common.save')}</button>`,
    actions: {
      v: (el) => ((v[el.dataset.k ?? ''] = /** @type {HTMLInputElement} */ (el).value), false),
      save: () => {
        const r = validateFood(v);
        errors = { ...r.errors };
        if (!v.name.trim()) errors.name = 'manual.errName';
        if (!errors.kcal && !r.values.kcal) errors.kcal = 'manual.errKcal';
        if (Object.keys(errors).length) return void (warned = null); // re-render with inline errors
        if (r.warn && warned !== r.warn) return void (warned = r.warn); // ask once, then "Save anyway"
        const n = (/** @type {'kcal'|'p'|'c'|'f'|'portion'} */ k) => r.values[k];
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
          ...(r.values.fib != null ? { fib: r.values.fib } : {}),
          ...(r.values.salt != null ? { salt: r.values.salt } : {}),
        };
        closeSheet();
        // 1.4.0: the first manual food says what is shared (once) before anything is sent.
        setTimeout(
          () =>
            void confirmDataNotice().then(() => {
              shareFood(food); // name + per-100 g values only, anonymous, off in Profile
              onSave(food);
            }),
          0,
        );
        return false;
      },
    },
  });
}
