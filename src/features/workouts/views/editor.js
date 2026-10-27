/**
 * Plan editor: name, place, weekdays and exercises (sets, reps, weight, rest), with
 * reorder, remove, duplicate and delete. Works on a draft until Save.
 * @module features/workouts/views/editor
 */
import { html, num } from '../../../ui/dom.js';
import { L, t, weekdayName } from '../../../core/i18n.js';
import { get, put, uid } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { seg, stepper, topBar } from '../../../ui/components.js';
import { confirmDialog } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { exById, exName } from '../../library/api.js';
import { planName, plans } from '../api.js';

/** Editable numeric fields: [key, step, min, max, label key]. */
const FIELDS = /** @type {const} */ ([
  ['sets', 1, 1, 10, 'editor.sets'],
  ['reps', 1, 1, 100, 'editor.reps'],
  ['weight', 2.5, 0, 500, 'editor.weight'],
  ['rest', 15, 0, 600, 'editor.rest'],
]);

/** @param {{id: string}} p @returns {import('../../../core/registry.js').View} */
export default ({ id }) => {
  const src = id === 'new' ? null : get('plans', id);
  /** @type {any} */
  const d = src
    ? structuredClone(src)
    : { id: uid('plan'), name: '', sub: '', place: 'gym', days: [], items: [], order: plans().length };
  if (typeof d.name === 'object') d.name = L(d.name);
  if (typeof d.sub === 'object') d.sub = L(d.sub);
  const save = () => {
    if (!d.name.trim()) return (emit('toast', { key: 'editor.needName' }), false);
    const keep = src && typeof src.name === 'object' && L(src.name) === d.name ? src.name : d.name.trim();
    put('plans', {
      ...d,
      name: keep,
      sub: src && typeof src.sub === 'object' && L(src.sub) === d.sub ? src.sub : d.sub,
      builtin: false,
    });
    emit('nav', { back: 'workouts' });
    return false;
  };
  return {
    tab: 'workouts',
    render:
      () => html`<div class="content editor">${topBar(src ? t('editor.edit') : t('editor.new'), '', html`<button class="btn sm" data-act="save">${t('common.save')}</button>`)}
<label class="field mt12"><span>${t('editor.name')}</span><input class="input" id="pname" data-input="name" value="${d.name}" placeholder="${t('editor.namePh')}" autocomplete="off"></label>
<label class="field mt10"><span>${t('editor.sub')}</span><input class="input" id="psub" data-input="sub" value="${d.sub}" placeholder="${t('editor.subPh')}" autocomplete="off"></label>
<div class="mt12">${seg(
        [
          { value: 'gym', label: t('place.gym') },
          { value: 'home', label: t('place.home') },
        ],
        d.place,
        'place',
      )}</div>
<div class="field mt12"><span>${t('editor.days')}</span><div class="days7" role="group">${[0, 1, 2, 3, 4, 5, 6].map(
        (i) =>
          html`<button class="dbtn${d.days.includes(i) ? ' on' : ''}" data-act="day" data-i="${i}" aria-pressed="${String(d.days.includes(i))}" aria-label="${weekdayName(i, 'long')}">${weekdayName(i, 'narrow')}</button>`,
      )}</div></div>
<h2 class="sect mt16">${t('editor.exercises')} <span class="muted">${d.items.length}</span></h2>
${d.items.map(
  (/** @type {any} */ it, /** @type {number} */ i) => html`<div class="card mt10 eitem">
<div class="row between"><span class="b">${i + 1}. ${exName(it.exId)}</span><span class="row gap4">
<button class="iconbtn flat sm" data-act="mv" data-i="${i}" data-d="-1" aria-label="${t('editor.up')}" ${i === 0 ? 'disabled' : ''}>${ic('chevup', 18)}</button>
<button class="iconbtn flat sm" data-act="mv" data-i="${i}" data-d="1" aria-label="${t('editor.down')}" ${i === d.items.length - 1 ? 'disabled' : ''}>${ic('down', 18)}</button>
<button class="iconbtn flat sm" data-act="rm" data-i="${i}" aria-label="${t('common.remove')}">${ic('trash', 18)}</button></span></div>
<div class="egrid mt8">${FIELDS.filter(([k]) => k !== 'weight' || exById(it.exId)?.weighted !== false).map(
    ([k, , , , lbl]) =>
      html`<div><div class="xs b muted">${t(lbl)}</div>${stepper({ act: 'f', value: it[k], data: { i, k }, label: `${exName(it.exId)} ${t(lbl)}`, unit: k === 'weight' ? t('unit.kg') : k === 'rest' ? 's' : '' })}</div>`,
  )}</div></div>`,
)}
<button class="btn sec w100 mt12" data-act="add">${ic('plus', 18, 2.6)}${t('editor.addExercise')}</button>
${src ? html`<div class="row gap10 mt20"><button class="btn sec f1" data-act="dup">${ic('copy', 18)}${t('editor.duplicate')}</button><button class="btn sec danger-t f1" data-act="del">${ic('trash', 18)}${t('common.delete')}</button></div>` : ''}
</div>`,
    actions: {
      name: (el) => ((d.name = /** @type {HTMLInputElement} */ (el).value), false),
      sub: (el) => ((d.sub = /** @type {HTMLInputElement} */ (el).value), false),
      place: (el) => void (d.place = el.dataset.v),
      day: (el) => {
        const i = num(el, 'i');
        d.days = d.days.includes(i) ? d.days.filter((/** @type {number} */ x) => x !== i) : [...d.days, i].sort();
      },
      f: (el, ev) => {
        const it = d.items[num(el, 'i')],
          k = /** @type {string} */ (el.dataset.k),
          [, st, min, max] = /** @type {any} */ (FIELDS.find((f) => f[0] === k));
        const v =
          ev.type === 'change'
            ? parseFloat(/** @type {HTMLInputElement} */ (el).value.replace(',', '.')) || 0
            : it[k] + num(el, 'd') * st;
        it[k] = Math.min(max, Math.max(min, Math.round(v * 4) / 4));
      },
      mv: (el) => {
        const i = num(el, 'i'),
          j = i + num(el, 'd');
        [d.items[i], d.items[j]] = [d.items[j], d.items[i]];
      },
      rm: (el) => void d.items.splice(num(el, 'i'), 1),
      add: async () => {
        const { openPicker } = await import('../../library/views/picker.js');
        openPicker((exId) => {
          const ex = exById(exId);
          d.items.push({
            exId,
            sets: 3,
            reps: ex?.unit === 'sec' ? 30 : 10,
            weight: ex?.weighted ? 10 : 0,
            rest: ex?.rest ?? 60,
          });
          emit('ui:refresh');
        });
        return false;
      },
      save,
      dup: () => {
        put('plans', {
          ...structuredClone(d),
          id: uid('plan'),
          name: `${d.name} (${t('editor.copySuffix')})`,
          days: [],
          builtin: false,
          order: plans().length,
        });
        emit('nav', { back: 'workouts' });
        return false;
      },
      del: async () => {
        if (
          !(await confirmDialog({
            title: t('editor.deleteTitle', { plan: d.name }),
            body: t('editor.deleteBody'),
            ok: t('common.delete'),
            danger: true,
          }))
        )
          return false;
        const plan = get('plans', d.id);
        if (plan)
          deleteWithUndo(
            'plan',
            [{ store: 'plans', row: plan }],
            { label: planName(plan), emoji: '📋' },
            t('undo.deleted', { name: planName(plan) }),
            { follow: true },
          );
        emit('nav', { back: 'workouts' });
        return false;
      },
    },
  };
};
