/**
 * Body sub-tab of Progress: latest weight with trend, measurement tiles with deltas
 * (vs. ~4 weeks earlier), per-field charts, the add-measurement form with hints, and
 * the progress photos section (see ./photos.js).
 * @module features/body/views/body
 */
import { html } from '../../../ui/dom.js';
import { L, fmtDate, t } from '../../../core/i18n.js';
import { addDays, dayKey, parseDay } from '../../../core/dates.js';
import { put, uid } from '../../../core/store.js';
import { emit, on } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { delta } from '../../../ui/components.js';
import { lineChart, mergeSameX, sparkline } from '../../../ui/chart.js';
import { closeSheet, confirmDialog, openSheet, whenSettled } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { MEASURE_FIELDS, checkMeasure } from '../../../data/measurements.js';
import { measurements } from '../api.js';
import { openCompare, openSession, openTimeline, photoSection } from './photos.js';

/** Tiles: single fields or L/R pairs. */
const TILES = MEASURE_FIELDS.filter((f) => f.id !== 'weight').reduce(
  (/** @type {{id: string, fields: string[], unit: string}[]} */ a, f) => {
    const ex = f.pair && a.find((x) => x.id === f.pair);
    if (ex) ex.fields.push(f.id);
    else a.push({ id: f.pair ?? f.id, fields: [f.id], unit: f.unit });
    return a;
  },
  [],
);

const fmt1 = (/** @type {number|undefined} */ v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1));

/** Latest value and the value ~4 weeks before it. @param {any[]} rows @param {string} f */
function latestAndBase(rows, f) {
  const has = rows.filter((r) => r[f] != null);
  const last = has[has.length - 1];
  if (!last) return { v: undefined, base: undefined, date: '' };
  const cut = dayKey(addDays(parseDay(last.date), -28));
  const base = [...has].reverse().find((r) => r.date <= cut) ?? has[0];
  return { v: Number(last[f]), base: base === last ? undefined : Number(base[f]), date: last.date };
}

/** Chart sheet for one field. @param {string} f */
function openChart(f) {
  const unit = MEASURE_FIELDS.find((x) => x.id === f)?.unit ?? '';
  // Two entries on one day → one point (the latest).
  const pts = mergeSameX(
    measurements()
      .filter((r) => r[f] != null)
      .map((r) => ({ x: fmtDate(parseDay(r.date), { day: 'numeric', month: 'numeric' }), y: Number(r[f]) })),
  );
  if (!pts.length && f === 'weight')
    // 1.2.1: no data yet → a helpful empty state with an "Add weight" action (not a blank sheet)
    return void openSheet({
      render:
        () => html`<h2 class="h2">${t('measure.weight')}</h2><div class="center wempty mt12">${ic('scale', 34, 2)}<p class="muted b small mt8 lh">${t('body.weightEmpty')}</p>
<button class="btn w100 mt14" data-act="addw">${ic('plus', 18, 2.8)}${t('body.addWeight')}</button></div>`,
      actions: { addw: () => (closeSheet(), whenSettled(() => openMeasureForm('weight')), false) },
    });
  openSheet({
    render:
      () => html`<h2 class="h2">${t(`measure.${f}`)}</h2><div class="mt12">${pts.length ? lineChart(pts, { unit, color: f === 'weight' ? '#1FB46B' : undefined, label: t(`measure.${f}`) }) : ''}</div>
<div class="list mt8">${measurements()
        .filter((r) => r[f] != null)
        .reverse()
        .map(
          (
            r,
          ) => html`<div class="lrow"><span class="f1 b">${fmtDate(parseDay(r.date), { day: 'numeric', month: 'short', year: 'numeric' })}</span><span class="b num">${fmt1(r[f])} ${unit}</span>
<button class="iconbtn flat sm" data-act="del" data-id="${r.id}" aria-label="${t('common.delete')}">${ic('trash', 18)}</button></div>`,
        )}</div>`,
    actions: {
      del: async (el) => {
        if (!(await confirmDialog({ title: t('body.deleteEntry'), ok: t('common.delete'), danger: true }))) return;
        const r = measurements().find((x) => x.id === el.dataset.id);
        if (!r) return;
        const label = `${t(`measure.${f}`)} · ${fmt1(r[f])} ${unit}`;
        deleteWithUndo(
          'measurement',
          [{ store: 'measurements', row: r }],
          { label, sub: fmtDate(parseDay(r.date), { day: 'numeric', month: 'short', year: 'numeric' }), emoji: '📏' },
          t('undo.deleted', { name: label }),
        );
      },
    },
  });
}

/**
 * Add-measurement form (all fields optional, hints shown, last values as placeholders).
 * @param {string} [focus] Field to focus first (e.g. 'weight' from the empty weight card).
 */
export function openMeasureForm(focus = '') {
  const last = Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, latestAndBase(measurements(), f.id).v]));
  /** @type {Record<string, string>} */
  const v = { date: dayKey() };
  /** @type {Record<string, {error?: string, range?: readonly [number, number]}>} */
  let bad = {};
  openSheet({
    kind: 'full',
    render:
      () => html`<div class="row between"><h2 class="h2">${t('body.addTitle')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<p class="muted small b mt4">${t('body.addHint')}</p>
<label class="field mt12"><span>${t('body.date')}</span><input class="input" type="date" id="mdate" data-input="v" data-k="date" value="${v.date}" max="${dayKey()}"></label>
${MEASURE_FIELDS.map(
  (f) => html`<label class="field mt10"><span>${t(`measure.${f.id}`)} <small class="muted">(${f.unit})</small></span>
<input class="input${bad[f.id] ? ' bad' : ''}" id="m_${f.id}" inputmode="decimal" data-input="v" data-k="${f.id}" value="${v[f.id] ?? ''}" placeholder="${last[f.id] != null ? fmt1(last[f.id]) : ''}" aria-describedby="h_${f.id}" aria-invalid="${String(!!bad[f.id])}">
${
  bad[f.id]
    ? html`<small class="ferr" id="h_${f.id}" role="alert">${t(String(bad[f.id].error), { min: bad[f.id].range?.[0] ?? '', max: bad[f.id].range?.[1] ?? '', unit: f.unit })}</small>`
    : html`<small class="hint" id="h_${f.id}">${L(f.hint)}</small>`
}</label>`,
)}
<button class="btn w100 mt16 sticky-b" data-act="save">${ic('check', 20, 3)}${t('common.save')}</button>`,
    actions: {
      v: (el) => ((v[el.dataset.k ?? ''] = /** @type {HTMLInputElement} */ (el).value), false),
      save: () => {
        /** @type {Record<string, any>} */
        const row = { id: uid('m'), date: v.date || dayKey(), ts: Date.now() };
        bad = {};
        for (const f of MEASURE_FIELDS) {
          const c = checkMeasure(f, v[f.id] ?? '');
          if (c.error) bad[f.id] = c;
          else if (c.value != null) row[f.id] = c.value;
        }
        if (Object.keys(bad).length) return; // re-render with the inline errors, nothing saved
        if (Object.keys(row).length <= 3) return (emit('toast', { key: 'body.needValue' }), false);
        put('measurements', /** @type {any} */ (row));
        closeSheet();
        emit('toast', { key: 'body.saved' });
        return false;
      },
    },
    mount: (el) => focus && /** @type {HTMLElement|null} */ (el.querySelector(`#m_${focus}`))?.focus(),
  });
}

/** @returns {import('../../../core/registry.js').View} */
export default () => {
  /** @type {(() => void)[]} */
  let offs = [];
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let tm;
  // 1.2.1 (C1): saving from a sheet re-renders the tab, so the newest weight shows at once.
  const refresh = () => (clearTimeout(tm), (tm = setTimeout(() => emit('ui:refresh'), 60)));
  return {
    mount: () => {
      offs = ['store:measurements', 'store:photos'].map((ev) => on(ev, refresh));
    },
    unmount: () => (offs.forEach((f) => f()), (offs = []), clearTimeout(tm)),
    render: () => {
      const rows = measurements(),
        w = latestAndBase(rows, 'weight');
      const weights = rows
        .filter((r) => r.weight != null)
        .slice(-12)
        .map((r) => Number(r.weight));
      const lastDate = rows.length ? rows[rows.length - 1].date : '';
      return html`<button class="card mt12 row between weightcard" data-act="chart" data-f="weight">
<div class="left"><div class="row gap6 muted xs b caps">${ic('scale', 15, 2.2)}${t('body.latestWeight')}${w.date ? ` · ${w.date === dayKey() ? t('common.today') : fmtDate(parseDay(w.date), { day: 'numeric', month: 'short' })}` : ''}</div>
<div class="row gap8 mt6 base"><span class="xb num big32">${fmt1(w.v)}</span><span class="muted b">kg</span></div>
<div class="row gap6 mt8">${w.base != null && w.v != null ? html`${delta(w.v - w.base, 'kg')}<span class="muted xs b">${t('body.vs4w')}</span>` : html`<span class="muted xs b">${t('body.noWeight')}</span>`}</div></div>
${sparkline(weights)}</button>
<div class="section-title"><h2 class="h3">${t('body.measurements')}</h2><span class="muted xs b">${lastDate ? t('body.vsDate', { date: fmtDate(parseDay(lastDate), { day: 'numeric', month: 'short' }) }) : ''}</span></div>
<div class="mgrid">${TILES.map((tile) => {
        const vals = tile.fields.map((f) => latestAndBase(rows, f));
        const d = vals.every((x) => x.v != null && x.base != null)
          ? vals.reduce((s, x) => s + (Number(x.v) - Number(x.base)), 0) / vals.length
          : null;
        return html`<button class="m" data-act="chart" data-f="${tile.fields[0]}"><div class="left"><div class="n">${t(`measure.${tile.id}`)}</div><div class="v num">${vals.map((x) => fmt1(x.v)).join(' / ')} <small>${tile.unit}</small></div></div>${d != null ? delta(d, '') : ''}</button>`;
      })}<button class="m addm" data-act="add">${ic('plus', 20, 2.8)}${t('body.add')}</button></div>
${photoSection()}`;
    },
    actions: {
      add: () => (openMeasureForm(), false),
      chart: (el) => (openChart(el.dataset.f ?? 'weight'), false),
      psNew: () => (openSession(), false),
      psEdit: (el) => (openSession(el.dataset.id), false),
      psTimeline: () => (openTimeline(), false),
      psCompare: () => (openCompare(), false),
    },
  };
};
