/**
 * Manual food entry (fallback for unknown barcodes / offline): name, kcal and macros per
 * 100 g (1.3.1: plus optional fiber and salt – left empty they stay unknown), saved to the custom foods store for reuse.
 * 1.4.0: the same form fills in a product's missing values ({@link openFixForm}): the fields
 * it lacks are marked, the first one is focused, and the corrected food keeps its id/barcode.
 * @module features/food/views/manual
 */
import { shareFood } from '../../improve/share.js';
import { confirmDataNotice } from '../../improve/notice.js';
import { html, patch } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { uid } from '../../../core/store.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { applyFix, known, missingValues, validateFood } from '../logic.js';
import { missingNotice } from './notice.js';

const FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'f', 'fib', 'salt']);

/**
 * The form sheet shared by "new food" and "fill in missing values".
 * @param {{v: Record<string, string>, title: string, intro: any, miss: string[], requireKcal: boolean,
 *   onValid: (r: ReturnType<typeof validateFood>) => void}} o
 */
function openForm(o) {
  const { v, miss } = o;
  /** @type {Record<string, string>} */
  let errors = {};
  /** 1.4.0: a live, non-blocking hint when the calories do not match the macros. */
  const hint = () => {
    const r = validateFood(v);
    return r.warn && v.kcal.trim()
      ? html`<p class="fwarn mt10">${t('manual.warnKcal', { est: fmtNum(r.est), kcal: fmtNum(r.values.kcal) })}</p>`
      : '';
  };
  const err = (/** @type {string} */ k) =>
    errors[k] ? html`<small class="ferr" id="e_${k}" role="alert">${t(errors[k])}</small>` : '';
  const ph = (/** @type {string} */ k) =>
    miss.includes(k) && !v[k]
      ? html` placeholder="${t('manual.missingPh')}"`
      : k === 'fib' || k === 'salt'
        ? html` placeholder="${t('manual.optional')}"`
        : '';
  openSheet({
    render: () => html`<h2 class="h2">${o.title}</h2>${o.intro}
<label class="field mt12"><span>${t('manual.name')}</span><input class="input${errors.name ? ' bad' : ''}" id="mname" data-input="v" data-k="name" value="${v.name}" autocomplete="off">${err('name')}</label>
<div class="grid2 mt10">${FIELDS.map((k) => html`<label class="field${miss.includes(k) ? ' miss' : ''}"><span>${t(`manual.${k}`)}</span><input class="input${errors[k] ? ' bad' : ''}${miss.includes(k) && !v[k] ? ' missing' : ''}" id="m${k}" inputmode="decimal" data-input="v" data-k="${k}" value="${v[k]}"${ph(k)} aria-invalid="${String(!!errors[k])}">${err(k)}</label>`)}
<label class="field"><span>${t('manual.portion')}</span><input class="input${errors.portion ? ' bad' : ''}" id="mportion" inputmode="numeric" data-input="v" data-k="portion" value="${v.portion}" aria-invalid="${String(!!errors.portion)}">${err('portion')}</label></div>
<div id="kcalhint" aria-live="polite">${hint()}</div>
<button class="btn w100 mt16" data-act="save">${t('common.save')}</button>`,
    mount: (el) => {
      // 1.4.0: take the user straight to the first value that is missing
      const first = FIELDS.find((k) => miss.includes(k));
      if (first) /** @type {HTMLInputElement|null} */ (el.querySelector(`#m${first}`))?.focus({ preventScroll: false });
    },
    actions: {
      v: (el) => {
        const k = el.dataset.k ?? '';
        v[k] = /** @type {HTMLInputElement} */ (el).value;
        if (['kcal', 'p', 'c', 'f'].includes(k)) patch('#kcalhint', hint());
        return false;
      },
      save: () => {
        const r = validateFood(v);
        errors = { ...r.errors };
        if (!v.name.trim()) errors.name = 'manual.errName';
        if (o.requireKcal && !errors.kcal && !r.values.kcal) errors.kcal = 'manual.errKcal';
        if (Object.keys(errors).length) return; // re-render with inline errors (the kcal hint never blocks)
        closeSheet();
        o.onValid(r);
        return false;
      },
    },
  });
}

/**
 * New custom food.
 * @param {{name?: string, barcode?: string}} init
 * @param {(food: any) => void} onSave
 */
export function openManualForm(init, onSave) {
  /** @type {Record<string, string>} */
  const v = { name: init.name ?? '', kcal: '', p: '', c: '', f: '', fib: '', salt: '', portion: '100' };
  openForm({
    v,
    title: t('food.manual'),
    intro: html`<p class="muted small b mt4">${t('manual.hint')}</p>`,
    miss: [],
    requireKcal: true,
    onValid: (r) => {
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
      // 1.4.0: the first manual food says what is shared (once) before anything is sent.
      setTimeout(
        () =>
          void confirmDataNotice().then(() => {
            shareFood(food); // name + per-100 g values only, anonymous, off in Profile
            onSave(food);
          }),
        0,
      );
    },
  });
}

/**
 * 1.4.0: fill in (or correct) the values of a scanned / online product. Known values are
 * prefilled, missing ones are empty, marked and the first is focused. Nothing is shared.
 * @param {any} food Per-100 g food (Open Food Facts).
 * @param {(fixed: any) => void} onSave Gets the corrected food (see logic.applyFix).
 */
export function openFixForm(food, onSave) {
  const miss = missingValues(food);
  const str = (/** @type {string} */ k) => (miss.includes(k) || !known(food[k]) ? '' : String(food[k]));
  /** @type {Record<string, string>} */
  const v = {
    name: String(food.name ?? ''),
    ...Object.fromEntries(FIELDS.map((k) => [k, str(k)])),
    portion: String(food.portion ?? 100),
  };
  openForm({
    v,
    title: t('manual.fixTitle'),
    intro: missingNotice(miss, { button: false }),
    miss,
    requireKcal: false,
    onValid: () => onSave(applyFix(food, v)),
  });
}
