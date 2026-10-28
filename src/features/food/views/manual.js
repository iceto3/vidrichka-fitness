/**
 * Manual food entry (fallback for unknown barcodes / offline): name, kcal and macros per
 * 100 g (1.3.1: plus optional fiber and salt – left empty they stay unknown), saved to the custom foods store for reuse.
 * 1.4.0: the same form fills in a product's missing values ({@link openFixForm}): the fields
 * it lacks are marked, the first one is focused, and the corrected food keeps its id/barcode.
 * 1.4.2: "Снимай етикета" in the new-food form – a photo of the nutrition label (camera or
 * gallery) is read once by the voice server and pre-fills the per-100 g values and the name
 * for the user to check; the photo is never stored.
 * @module features/food/views/manual
 */
import { shareFood } from '../../improve/share.js';
import { confirmDataNotice } from '../../improve/notice.js';
import { html, patch } from '../../../ui/dom.js';
import { fmtNum, getLang, t } from '../../../core/i18n.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { uid } from '../../../core/store.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { applyFix, known, missingValues, validateFood } from '../logic.js';
import { missingNotice } from './notice.js';
import { voiceUrl } from '../../voice/config.js';

const FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'f', 'fib', 'salt']);

/**
 * The form sheet shared by "new food" and "fill in missing values".
 * @param {{v: Record<string, string>, title: string, intro: any, miss: string[], requireKcal: boolean,
 *   label?: boolean, onValid: (r: ReturnType<typeof validateFood>) => void}} o
 */
function openForm(o) {
  const { v, miss } = o;
  /** @type {Record<string, string>} */
  let errors = {};
  /** 1.4.2 label photo state. @type {{phase: 'idle'|'busy'|'done'|'error', err: string, filled: string[]}} */
  const lab = { phase: 'idle', err: '', filled: [] };
  const labelBox = () =>
    !o.label
      ? ''
      : html`<div class="labelbox mt12">${
          lab.phase === 'busy'
            ? html`<div class="row gap10 center-j pad8"><span class="spin" aria-hidden="true"></span><span class="b" role="status">${t('label.reading')}</span></div>`
            : html`<label class="btn sec w100 labelpick">${ic('camera', 18, 2.2)}${t('label.pick')}<input type="file" accept="image/*" class="sr-only" data-change="labelFile" aria-label="${t('label.pick')}"></label>`
        }
${lab.phase === 'done' ? html`<p class="okc small b mt8 labelok" role="status">${t('label.filled')}</p>` : ''}
${lab.phase === 'error' ? html`<p class="verr small b mt8 labelerr" role="alert">${t(`label.err.${lab.err}`)}</p>` : ''}
<p class="muted xs b mt6">${t('label.privacy')}</p></div>`;
  const fromLabel = (/** @type {string} */ k) => (lab.filled.includes(k) ? ' fromlabel' : '');
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
    render: () => html`<h2 class="h2">${o.title}</h2>${o.intro}${labelBox()}
<label class="field mt12"><span>${t('manual.name')}</span><input class="input${errors.name ? ' bad' : ''}${fromLabel('name')}" id="mname" data-input="v" data-k="name" value="${v.name}" autocomplete="off">${err('name')}</label>
<div class="grid2 mt10">${FIELDS.map((k) => html`<label class="field${miss.includes(k) ? ' miss' : ''}"><span>${t(`manual.${k}`)}</span><input class="input${errors[k] ? ' bad' : ''}${miss.includes(k) && !v[k] ? ' missing' : ''}${fromLabel(k)}" id="m${k}" inputmode="decimal" data-input="v" data-k="${k}" value="${v[k]}"${ph(k)} aria-invalid="${String(!!errors[k])}">${err(k)}</label>`)}
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
      labelFile: async (el) => {
        const input = /** @type {HTMLInputElement} */ (el),
          f = input.files?.[0];
        if (!f || lab.phase === 'busy') return false;
        Object.assign(lab, { phase: 'busy', err: '' });
        emit('ui:refresh');
        try {
          const [{ prepareImage }, { readLabel }, { labelToForm }] = await Promise.all([
            import('../../improve/images.js'),
            import('../../voice/api.js'),
            import('../label.js'),
          ]);
          const img = await prepareImage(f);
          URL.revokeObjectURL(img.url); // the photo itself is dropped right away
          const res = labelToForm(await readLabel(img.blob), getLang());
          Object.assign(v, res.v);
          lab.filled = res.filled;
          if (res.err) Object.assign(lab, { phase: 'error', err: res.err });
          else ((lab.phase = 'done'), (errors = {}));
        } catch (e) {
          const m = /** @type {Error} */ (e).message;
          Object.assign(lab, {
            phase: 'error',
            err: ['offline', 'limit', 'rate-limit', 'image'].includes(m) ? m : 'server',
          });
        }
        input.value = '';
        emit('ui:refresh');
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
    label: !!voiceUrl(), // needs the voice server (it reads the photo)
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
