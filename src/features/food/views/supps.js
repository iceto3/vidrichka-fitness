/**
 * 1.6.1 „Хранителни добавки“ card in Храна (replaces the 1.4.2 creatine card – creatine is
 * its first row, with the day's creatine total from food + supplement as before). Each row:
 * name, last dose and days in a row, ✎ (dose / reminder / settings sheet) and a one-tap
 * „Взех“ with the last dose. „Добави“ lists the ready supplements (one tap) and an own one.
 * @module features/food/views/supps
 */
import { emit } from '../../../core/bus.js';
import { html, raw } from '../../../ui/dom.js';
import { fmtNum, t } from '../../../core/i18n.js';
import { dayKey, hmComplete, parseHM, stepHM } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { stepper, time24 } from '../../../ui/components.js';
import { closeSheet, openSheet, refreshSheet, snack, toast } from '../../../ui/sheet.js';
import { readDay } from '../../day/api.js';
import { safely } from '../../day/views/cards.js';
import { SUPP_KINDS, SUPP_UNITS } from '../../../data/supplements.js';
import { kindOf, proteinOf } from '../supps.js';
import {
  addCustom,
  addReady,
  readyToAdd,
  removeSupp,
  restoreSupp,
  setTaken,
  streak,
  suppName,
  supplements,
  taken,
  updateSupp,
} from '../supps-api.js';

/** @typedef {import('../supps.js').Supp} Supp */

const unitText = (/** @type {string} */ u) => t(`supp.unit.${u}`);
const amount = (/** @type {Supp} */ s, /** @type {number} */ v) =>
  `${fmtNum(v, kindOf(s).step < 1 ? 1 : 0)} ${unitText(s.unit)}`;
const byId = (/** @type {string|undefined} */ id) => supplements().find((s) => s.id === id);

/** Second line of a row. @param {Supp} s @param {string} date */
function subLine(s, date) {
  const n = streak(s, dayKey()),
    run = n > 1 && date === dayKey() ? t('supp.streak', { n }) : '';
  if (s.kind === 'creatine') {
    const c = readDay(date).creatine,
      parts = [
        c.rows ? `${t('creatine.fromFood')} ${fmtNum(c.foodG, 1)} ${t('unit.g')}` : '',
        c.suppG ? `${t('creatine.supp')} ${fmtNum(c.suppG, 1)} ${t('unit.g')}` : '',
        run,
      ].filter(Boolean);
    return parts.length ? parts.join(' · ') : t('creatine.none');
  }
  const v = taken(s, date),
    p = proteinOf(s, v || s.dose);
  return [
    `${t('supp.dose')} ${amount(s, v || s.dose)}`,
    p ? t('supp.proteinPart', { g: fmtNum(p, 1) }) : '',
    s.remind ? `🔔 ${s.remind}` : '',
    run,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** „Отмени“ text after unticking (creatine keeps its 1.4.2 text). @param {Supp} s */
const removedText = (s) =>
  s.kind === 'creatine' ? t('creatine.removed') : t('supp.removedDay', { name: suppName(s) });

/** One supplement row. @param {Supp} s @param {string} date */
function row(s, date) {
  const v = taken(s, date),
    cr = s.kind === 'creatine',
    name = suppName(s);
  const title = cr
    ? html`${t('creatine.title')} <span class="num crtotal">${fmtNum(readDay(date).creatine.totalG, 1)} ${t('unit.g')}</span>`
    : name;
  return html`<div class="row gap10 supprow${cr ? ' creatinecard' : ''}" data-supp="${s.id}"><div class="mic sm creaic" aria-hidden="true">${kindOf(s).emoji}</div>
<div class="f1 minw0"><div class="b ellip crtitle">${title}</div><div class="muted xs b suppsub">${subLine(s, date)}</div></div>
<button class="iconbtn sm flat suppedit${cr ? ' creaadd' : ''}" data-act="suppSheet" data-id="${s.id}" aria-label="${t('supp.edit', { name })}">${ic('edit', 16, 2.4)}</button>
<button class="chip chip-sm supptake${v ? ' on ok' : ' accent'}" data-act="suppTake" data-id="${s.id}" aria-pressed="${v ? 'true' : 'false'}" aria-label="${t(v ? 'supp.untakeA' : 'supp.takeA', { name, dose: amount(s, s.dose) })}">${v ? ic('check', 13, 3) : ''}${t(v ? 'supp.took' : 'supp.take')}</button></div>`;
}

/** The card. @param {string} date */
export function suppsCard(date) {
  return html`<section class="card mt12 supps" aria-label="${t('supp.title')}"><div class="row between gap8"><h2 class="h3 xb">${t('supp.title')}</h2><button class="chip chip-sm suppnew" data-act="suppAdd">${ic('plus', 13, 2.6)}${t('supp.add')}</button></div>
<div class="supplist mt8">${supplements().map((s) => row(s, date))}</div></section>`;
}

/** Tick with the last dose / untick (with „Отмени“). @param {string} date @param {string} id */
function toggleTaken(date, id) {
  const s = byId(id);
  if (!s) return;
  const was = taken(s, date);
  if (!was) {
    safely(() => setTaken(s, date, s.dose));
    toast(t('supp.saved', { name: suppName(s), dose: amount(s, s.dose) }));
  } else {
    safely(() => setTaken(s, date, null));
    snack(removedText(s), () => {
      safely(() => setTaken(s, date, was));
      emit('ui:refresh');
    });
  }
  emit('ui:refresh');
}

/**
 * Dose / reminder / settings sheet (for creatine it is the 1.4.2 sheet: default 3 g or the
 * last dose, ½ g steps). Save logs the dose for the day and remembers it.
 * @param {string} date @param {string} id
 */
export function openSuppSheet(date, id) {
  const s0 = byId(id);
  if (!s0) return;
  const k = kindOf(s0),
    had = taken(s0, date);
  const st = {
    dose: had || s0.dose,
    remind: s0.remind ?? '',
    typed: /** @type {string|undefined} */ (undefined),
    pct: s0.proteinPct ?? 75,
    unit: s0.unit,
  };
  const saveSettings = () => {
    const s = byId(id);
    if (!s) return;
    updateSupp(id, {
      remind: st.remind,
      ...(s.kind === 'protein' ? { proteinPct: st.pct } : {}),
      ...(s.kind === 'custom' ? { unit: st.unit } : {}),
    });
  };
  const name = suppName(s0);
  openSheet({
    render: () => {
      const s = byId(id) ?? s0,
        p = proteinOf({ ...s, proteinPct: st.pct }, st.dose);
      return html`<h2 class="h2">${s.kind === 'creatine' ? t('creatine.add') : name}</h2><p class="muted small b mt4">${s.kind === 'creatine' ? t('creatine.hint') : t(`supp.hint.${s.kind}`)}</p>
<div class="row between mt12"><span class="b">${t('supp.dose')}</span>${stepper({ act: 'suppG', value: fmtNum(st.dose, k.step < 1 ? 1 : 0), unit: unitText(st.unit), label: t('supp.dose'), wide: true })}</div>
${s.kind === 'custom' ? html`<div class="row wrap gap6 mt10 suppunits" role="group" aria-label="${t('supp.unit')}">${SUPP_UNITS.map((u) => html`<button class="chip chip-sm${u === st.unit ? ' on' : ''}" data-act="suppUnit" data-u="${u}" aria-pressed="${u === st.unit ? 'true' : 'false'}">${unitText(u)}</button>`)}</div>` : ''}
${s.kind === 'protein' ? html`<div class="row between mt10"><span class="b">${t('supp.proteinPct')}</span>${stepper({ act: 'suppPct', value: String(st.pct), unit: '%', label: t('supp.proteinPct') })}</div><p class="xs b muted mt4 suppp">${t('supp.proteinPart', { g: fmtNum(p, 1) })} – ${t('supp.proteinGoal')}</p>` : ''}
<div class="field mt12 suppremind"><span>${t('supp.remind')}</span><div class="row gap8">${time24({ value: st.typed ?? (st.remind || '09:00'), act: 'suppHM', step: 'suppHMstep', mins: 15, label: t('supp.remind'), cls: st.remind ? '' : 'off' })}<button class="chip chip-sm${st.remind ? ' on' : ''} suppremon" data-act="suppRemind" aria-pressed="${st.remind ? 'true' : 'false'}">${t(st.remind ? 'supp.remindOn' : 'supp.remindOff')}</button></div><span class="xs b muted">${t('supp.remindHint')}</span></div>
<div class="row gap10 mt16">${had ? html`<button class="btn sec f1" data-act="suppClear">${ic('trash', 16, 2.2)}${t('common.remove')}</button>` : ''}<button class="btn f1" data-act="suppSave">${t(had ? 'common.save' : 'supp.saveTake')}</button></div>
${s.kind !== 'creatine' ? html`<button class="linkbtn w100 mt8 suppdrop" data-act="suppDrop">${t('supp.drop')}</button>` : ''}`;
    },
    actions: {
      suppG: (el, ev) => {
        const typed = Number(String(/** @type {HTMLInputElement} */ (el).value ?? '').replace(',', '.'));
        const v =
          ev.type === 'change' ? (Number.isFinite(typed) ? typed : st.dose) : st.dose + Number(el.dataset.d) * k.step;
        const max = SUPP_KINDS[s0.kind]?.max ?? kindOf({ ...s0, unit: st.unit }).max;
        st.dose = Math.round(Math.min(max, Math.max(k.step, v)) * 10) / 10;
      },
      suppUnit: (el) => void (st.unit = /** @type {any} */ (el.dataset.u ?? st.unit)),
      suppPct: (el, ev) => {
        const typed = Number(/** @type {HTMLInputElement} */ (el).value);
        const v = ev.type === 'change' ? typed : st.pct + Number(el.dataset.d) * 5;
        st.pct = Math.min(100, Math.max(1, Math.round(Number.isFinite(v) ? v : st.pct)));
      },
      suppRemind: () => {
        st.remind = st.remind ? '' : (st.typed && parseHM(st.typed)) || '09:00';
        st.typed = undefined;
        // the browser asks for notifications once a reminder is set (existing permission flow)
        if (st.remind) import('../../profile/reminders.js').then((m) => m.requestPermission()).catch(() => {});
      },
      suppHM: (el, ev) => {
        const txt = /** @type {HTMLInputElement} */ (el).value,
          v = parseHM(txt);
        if (ev?.type === 'input' && !hmComplete(txt)) return false;
        if (v) ((st.remind = v), (st.typed = undefined));
        else st.typed = txt;
        refreshSheet();
        return false;
      },
      suppHMstep: (el) => {
        st.remind = stepHM(st.remind || '09:00', Number(el.dataset.d));
        st.typed = undefined;
      },
      suppSave: () => {
        saveSettings();
        const s = byId(id);
        if (s) {
          const v = safely(() => setTaken({ ...s, unit: st.unit }, date, st.dose));
          if (v)
            toast(
              s.kind === 'creatine'
                ? t('creatine.saved', { g: fmtNum(v, 1) })
                : t('supp.saved', { name, dose: amount({ ...s, unit: st.unit }, v) }),
            );
        }
        closeSheet();
        emit('ui:refresh');
        return false;
      },
      suppClear: () => {
        // removing is one tap, with „Отмени“ like every other deletion (1.4.2 tester round)
        saveSettings();
        const s = byId(id);
        closeSheet();
        if (s && had) {
          safely(() => setTaken(s, date, null));
          snack(removedText(s), () => {
            safely(() => setTaken(s, date, had));
            emit('ui:refresh');
          });
        }
        emit('ui:refresh');
        return false;
      },
      suppDrop: () => {
        const at = supplements().findIndex((x) => x.id === id),
          gone = removeSupp(id);
        closeSheet();
        emit('ui:refresh');
        if (gone)
          snack(t('supp.dropped', { name }), () => {
            restoreSupp(gone, at);
            emit('ui:refresh');
          });
        return false;
      },
    },
  });
}

/** „Добави“: ready supplements (one tap) and an own one. */
export function openSuppAdd() {
  const st = { name: '', unit: /** @type {string} */ ('caps'), dose: 1 };
  openSheet({
    render: () => {
      const ready = readyToAdd();
      return html`<h2 class="h2">${t('supp.addTitle')}</h2><p class="muted small b mt4">${t('supp.addHint')}</p>
<div class="suppready mt12">${ready.length ? ready.map((kind) => html`<button class="row gap10 w100 left supppick" data-act="suppPick" data-k="${kind}"><span class="mic sm" aria-hidden="true">${SUPP_KINDS[kind].emoji}</span><span class="f1 minw0"><span class="b block">${t(`supp.${kind}`)}</span><span class="xs b muted block">${fmtNum(SUPP_KINDS[kind].dose)} ${unitText(SUPP_KINDS[kind].unit)}</span></span>${ic('plus', 18, 2.6)}</button>`) : html`<p class="small b muted">${t('supp.allAdded')}</p>`}</div>
<h3 class="b mt16">${t('supp.custom')}</h3>
<label class="field mt8"><span>${t('supp.customName')}</span><input class="input suppname" maxlength="40" value="${st.name}" data-input="suppName" data-change="suppName" placeholder="${t('supp.customPh')}"></label>
<div class="row wrap gap6 mt10 suppunits" role="group" aria-label="${t('supp.unit')}">${SUPP_UNITS.map((u) => html`<button class="chip chip-sm${u === st.unit ? ' on' : ''}" data-act="suppNewUnit" data-u="${u}" aria-pressed="${u === st.unit ? 'true' : 'false'}">${unitText(u)}</button>`)}</div>
<label class="field mt10"><span>${t('supp.dose')}</span><input class="input num suppdose" inputmode="decimal" value="${String(st.dose)}" data-change="suppNewDose" data-input="suppNewDose"></label>
<button class="btn w100 mt12 suppcustom" data-act="suppCustom" ${st.name.trim() ? '' : raw('disabled')}>${ic('plus', 18, 2.6)}${t('supp.addCustom')}</button>`;
    },
    actions: {
      suppPick: (el) => {
        const s = addReady(el.dataset.k ?? '');
        if (s) toast(t('supp.added', { name: suppName(s) }));
        emit('ui:refresh');
        if (!readyToAdd().length) closeSheet();
      },
      suppName: (el, ev) => {
        const had = !!st.name.trim();
        st.name = /** @type {HTMLInputElement} */ (el).value;
        if (ev?.type === 'input' && had === !!st.name.trim()) return false;
        refreshSheet();
        return false;
      },
      suppNewUnit: (el) => void (st.unit = el.dataset.u ?? 'caps'),
      suppNewDose: (el) => {
        st.dose = Number(String(/** @type {HTMLInputElement} */ (el).value).replace(',', '.')) || st.dose;
        return false;
      },
      suppCustom: () => {
        const s = addCustom(st.name, st.unit, st.dose);
        if (!s) return false;
        toast(t('supp.added', { name: suppName(s) }));
        closeSheet();
        emit('ui:refresh');
        return false;
      },
    },
  });
}

/** Card actions (Food diary). @param {() => string} dateOf */
export const suppActions = (dateOf) => ({
  suppTake: (/** @type {HTMLElement} */ el) => (toggleTaken(dateOf(), el.dataset.id ?? ''), false),
  suppSheet: (/** @type {HTMLElement} */ el) => (openSuppSheet(dateOf(), el.dataset.id ?? ''), false),
  suppAdd: () => (openSuppAdd(), false),
});
