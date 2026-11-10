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
import { applyFix, known, missingValues, parseCreatine, safePhoto, validateFood } from '../logic.js';
import { saveCustomFood } from '../api.js';
import { missingNotice } from './notice.js';
import { voiceUrl } from '../../voice/config.js';

const FIELDS = /** @type {const} */ (['kcal', 'p', 'c', 'sug', 'f', 'sat', 'fib', 'salt']); // 1.5.1: + sugar, saturated fat

/**
 * The form sheet shared by "new food", "edit a custom food" and "fill in missing values".
 * `custom` (1.4.4) adds the creatine field and the package photo; `onDelete` a delete button.
 * @param {{v: Record<string, string>, title: string, intro: any, miss: string[], requireKcal: boolean,
 *   label?: boolean, custom?: {photo: string}, onDelete?: () => void, saveText?: string,
 *   onValid: (r: ReturnType<typeof validateFood>) => void}} o
 */
function openForm(o) {
  const { v, miss } = o;
  /** 1.4.4 package photo state. */
  const pkg = { busy: false, err: false };
  const photoBox = () => {
    if (!o.custom) return '';
    const url = safePhoto(o.custom.photo);
    const pick = (/** @type {string} */ key) =>
      html`<label class="btn sec sm f1 pkgpick">${ic('camera', 16, 2.2)}${t(key)}<input type="file" accept="image/*" class="sr-only" data-change="pkgFile" aria-label="${t(key)}"></label>`;
    return html`<div class="pkgbox mt12">${
      url
        ? html`<div class="row gap12"><img class="pkgthumb" src="${url}" alt="${t('custom.photoAlt')}"><div class="col gap8 f1">${pick('custom.photoChange')}<button class="btn sec sm danger-t" data-act="pkgDel">${ic('trash', 16, 2.2)}${t('custom.photoRemove')}</button></div></div>`
        : pkg.busy
          ? html`<div class="row gap10 center-j pad8"><span class="spin" aria-hidden="true"></span></div>`
          : html`<div class="row">${pick('custom.photoPick')}</div>`
    }${pkg.err ? html`<p class="verr small b mt8" role="alert">${t('label.err.image')}</p>` : ''}<p class="muted xs b mt6">${t('custom.photoPrivacy')}</p></div>`;
  };
  const crField = () =>
    !o.custom
      ? ''
      : html`<label class="field"><span>${t('manual.cr')}</span><input class="input${errors.cr ? ' bad' : ''}" id="mcr" inputmode="decimal" data-input="v" data-k="cr" value="${v.cr ?? ''}" placeholder="${t('manual.optional')}" aria-invalid="${String(!!errors.cr)}">${err('cr')}</label>`;
  /** @type {Record<string, string>} */
  let errors = {};
  /** 1.4.2 label photo state; `scan` = the values the last reading put in. @type {{phase: 'idle'|'busy'|'done'|'error', err: string, filled: string[], cleared: string[], scan: Record<string, string>}} */
  const lab = { phase: 'idle', err: '', filled: [], cleared: [], scan: {} };
  const labelBox = () =>
    !o.label
      ? ''
      : html`<div class="labelbox mt12">${
          lab.phase === 'busy'
            ? html`<div class="row gap10 center-j pad8"><span class="spin" aria-hidden="true"></span><span class="b" role="status">${t('label.reading')}</span></div>`
            : html`<label class="btn sec w100 labelpick">${ic('camera', 18, 2.2)}${t('label.pick')}<input type="file" accept="image/*" class="sr-only" data-change="labelFile" aria-label="${t('label.pick')}"></label>`
        }
${lab.phase === 'done' ? html`<p class="okc small b mt8 labelok" role="status">${t('label.filled')}</p>` : ''}
${lab.phase === 'error' ? html`<p class="verr small b mt8 labelerr" role="alert">${t(`label.err.${lab.err}`)}${lab.cleared.length ? html` <span class="labelcleared">${t('label.cleared')}</span>` : ''}</p>` : ''}
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
      : k === 'fib' || k === 'salt' || k === 'sat' || k === 'sug'
        ? html` placeholder="${t('manual.optional')}"`
        : '';
  openSheet({
    render: () => html`<h2 class="h2">${o.title}</h2>${o.intro}${photoBox()}${labelBox()}
<label class="field mt12"><span>${t('manual.name')}</span><input class="input${errors.name ? ' bad' : ''}${fromLabel('name')}" id="mname" data-input="v" data-k="name" value="${v.name}" autocomplete="off">${err('name')}</label>
<div class="grid2 mt10">${FIELDS.map((k) => html`<label class="field${miss.includes(k) ? ' miss' : ''}"><span>${t(`manual.${k}`)}</span><input class="input${errors[k] ? ' bad' : ''}${miss.includes(k) && !v[k] ? ' missing' : ''}${fromLabel(k)}" id="m${k}" inputmode="decimal" data-input="v" data-k="${k}" value="${v[k]}"${ph(k)} aria-invalid="${String(!!errors[k])}">${err(k)}</label>`)}
<label class="field"><span>${t('manual.portion')}</span><input class="input${errors.portion ? ' bad' : ''}" id="mportion" inputmode="numeric" data-input="v" data-k="portion" value="${v.portion}" aria-invalid="${String(!!errors.portion)}">${err('portion')}</label>${crField()}</div>
<div id="kcalhint" aria-live="polite">${hint()}</div>
<button class="btn w100 mt16" data-act="save">${o.saveText ?? t('common.save')}</button>
${o.onDelete ? html`<button class="btn sec w100 mt10 danger-t" data-act="delFood">${ic('trash', 18, 2.2)}${t('custom.deleteOne')}</button>` : ''}`,
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
          const [{ prepareImage }, { readLabel }, { labelToForm, applyScan }] = await Promise.all([
            import('../../improve/images.js'),
            import('../../voice/api.js'),
            import('../label.js'),
          ]);
          /** @type {{err: string|null, v: Record<string, string>}} */
          let res;
          try {
            const img = await prepareImage(f);
            URL.revokeObjectURL(img.url); // the photo itself is dropped right away
            res = labelToForm(await readLabel(img.blob), getLang());
          } catch (e) {
            const m = /** @type {Error} */ (e).message;
            res = { err: ['offline', 'limit', 'rate-limit', 'image'].includes(m) ? m : 'server', v: {} };
          }
          // nothing from an older photo may stay after a failed or blocked reading
          const done = applyScan(
            v,
            lab.scan,
            res.err ? { err: res.err, v: res.v.name ? { name: res.v.name } : {} } : res,
          );
          Object.assign(lab, { scan: done.scan, filled: done.filled, cleared: done.cleared });
          if (res.err) Object.assign(lab, { phase: 'error', err: res.err });
          else ((lab.phase = 'done'), (errors = {}));
        } catch {
          Object.assign(lab, { phase: 'error', err: 'server' });
        }
        input.value = '';
        emit('ui:refresh');
        return false;
      },
      pkgFile: async (el) => {
        const input = /** @type {HTMLInputElement} */ (el),
          f = input.files?.[0];
        if (!f || !o.custom || pkg.busy) return false;
        Object.assign(pkg, { busy: true, err: false });
        emit('ui:refresh');
        try {
          const { thumbnail } = await import('../../improve/images.js');
          o.custom.photo = await thumbnail(f); // on the device only, never sent
        } catch {
          pkg.err = true;
        }
        pkg.busy = false;
        input.value = '';
        emit('ui:refresh');
        return false;
      },
      pkgDel: () => {
        if (o.custom) o.custom.photo = '';
      },
      delFood: () => {
        closeSheet();
        o.onDelete?.();
        return false;
      },
      save: () => {
        const r = validateFood(v);
        errors = { ...r.errors };
        if (o.custom && Number.isNaN(parseCreatine(v.cr))) errors.cr = 'manual.errCr';
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
  const v = {
    name: init.name ?? '',
    kcal: '',
    p: '',
    c: '',
    f: '',
    fib: '',
    salt: '',
    sat: '',
    sug: '',
    portion: '100',
    cr: '',
  };
  const custom = { photo: '' };
  openForm({
    v,
    title: t('food.manual'),
    intro: html`<p class="muted small b mt4">${t('manual.hint')}</p>`,
    miss: [],
    requireKcal: true,
    label: !!voiceUrl(), // needs the voice server (it reads the photo)
    custom,
    onValid: (r) => {
      const n = (/** @type {'kcal'|'p'|'c'|'f'|'portion'} */ k) => r.values[k];
      const cr = parseCreatine(v.cr);
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
        ...(r.values.sat != null ? { sat: r.values.sat } : {}),
        ...(r.values.sug != null ? { sug: r.values.sug } : {}),
        ...(cr != null ? { cr } : {}),
        ...(safePhoto(custom.photo) ? { photo: custom.photo } : {}),
      };
      if (!food.barcode) delete food.barcode;
      // 1.4.0: the first manual food says what is shared (once) before anything is sent.
      setTimeout(
        () =>
          void confirmDataNotice().then(() => {
            const saved = saveCustomFood(food); // 1.4.4: in Ръчно добавени храни right away
            shareFood(saved); // name + per-100 g values only (never the photo), anonymous, off in Profile
            onSave(saved);
          }),
        0,
      );
    },
  });
}

/**
 * 1.4.4: edit a saved custom food (name, values, creatine, package photo). Diary rows logged
 * before keep their values. Nothing is shared.
 * @param {any} food
 * @param {{onSave: (change: Record<string, any>) => void, onDelete?: () => void}} cb
 */
export function openEditForm(food, cb) {
  const str = (/** @type {string} */ k) => (known(food[k]) ? String(food[k]) : '');
  /** @type {Record<string, string>} */
  const v = {
    name: typeof food.name === 'string' ? food.name : String(food.name?.bg ?? food.name?.en ?? ''),
    ...Object.fromEntries(FIELDS.map((k) => [k, str(k)])),
    portion: String(food.portion ?? 100),
    cr: str('cr'),
  };
  const custom = { photo: safePhoto(food.photo) };
  openForm({
    v,
    title: t('custom.editTitle'),
    intro: html`<p class="muted small b mt4">${t('custom.editHint')}</p>`,
    miss: [],
    requireKcal: true,
    custom,
    onDelete: cb.onDelete,
    onValid: (r) => {
      const cr = parseCreatine(v.cr);
      cb.onSave({
        name: v.name.trim(),
        kcal: r.values.kcal,
        p: r.values.p,
        c: r.values.c,
        f: r.values.f,
        portion: r.values.portion || 100,
        fib: r.values.fib,
        salt: r.values.salt,
        sat: r.values.sat,
        sug: r.values.sug,
        cr,
        photo: safePhoto(custom.photo) || undefined,
      });
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
