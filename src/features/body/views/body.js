/**
 * Body sub-tab of Progress: latest weight with trend, measurement tiles with deltas
 * (vs. ~4 weeks earlier), per-field charts, the add-measurement form with hints, and
 * the progress photos section (see ./photos.js).
 * @module features/body/views/body
 */
import { html } from '../../../ui/dom.js';
import { L, fmtDate, locale, t, unitText } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { put, uid } from '../../../core/store.js';
import { emit, on } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { delta, toggle, dateField } from '../../../ui/components.js';
import { lineChart, mergeSameX, sparkline } from '../../../ui/chart.js';
import { closeSheet, confirmDialog, openSheet, whenSettled } from '../../../ui/sheet.js';
import { deleteWithUndo } from '../../../ui/undo.js';
import { MEASURE_FIELDS, checkMeasure } from '../../../data/measurements.js';
import { measurements } from '../api.js';
import { ALL_TILES, measureRow, tileGroups, tileOf } from '../fields.js';
import { customTiles, resetToGender, showTile, visibleFields, visibleTiles } from '../fields-api.js';
import { settings } from '../../../core/settings.js';
import { latestAndBase } from '../trend.js';
import { openCompare, openSession, openTimeline, photoSection } from './photos.js';

/** Tiles shown (single fields or L/R pairs; 1.6.1: by gender or the user's own set). */
const tiles = () => {
  const on = new Set(visibleTiles());
  return ALL_TILES.filter((x) => x.id !== 'weight' && on.has(x.id));
};

/**
 * 1.6.1 „Кои измервания да следя“: the profile gender's set first, then the rest; a switch
 * each, with the short "where to measure" cue. Hidden values are never deleted.
 */
function openTileSetup() {
  openSheet({
    render: () => {
      const g = tileGroups(settings().gender),
        on = new Set(visibleTiles());
      const row = (/** @type {string} */ id) => {
        const tile = ALL_TILES.find((x) => x.id === id),
          f = MEASURE_FIELDS.find((x) => x.id === tile?.fields[0]);
        return html`<div class="lrow msetrow" data-tile="${id}"><span class="f1 minw0"><span class="b block">${t(`measure.${id}`)}</span><span class="xs b muted block">${f ? L(f.hint) : ''}</span></span>${toggle(on.has(id), 'mtile', t(`measure.${id}`), { id })}</div>`;
      };
      return html`<h2 class="h2">${t('body.setupTitle')}</h2><p class="muted small b mt4">${t('body.setupHint')}</p>
<h3 class="b mt12">${t('body.setMine')}</h3><div class="list mset">${g.mine.filter((id) => id !== 'weight').map(row)}</div>
<h3 class="b mt12">${t('body.setMore')}</h3><div class="list mset">${g.more.map(row)}</div>
${customTiles() ? html`<p class="xs b muted mt10">${t('body.setCustom')}</p><button class="btn sec w100 mt8 msetreset" data-act="mreset">${t('body.setReset')}</button>` : ''}
<button class="btn w100 mt12" data-close>${t('common.done')}</button>`;
    },
    actions: {
      mtile: (el) => void showTile(el.dataset.id ?? '', el.getAttribute('aria-checked') !== 'true'),
      mreset: () => void resetToGender(),
    },
    onClose: () => emit('ui:refresh'),
  });
}

const fmt1 = (/** @type {number|undefined} */ v) =>
  v == null ? '–' : new Intl.NumberFormat(locale(), { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);

/**
 * 1.6.2 (tester: „Седалище“ opened a sheet with no field and no save – 1.6.1 tiles with no
 * value yet had only an empty chart/list): every tile's sheet has a quick entry for its
 * field(s) (both sides of a pair), today, with the where-to-measure cue and „Запази“.
 * Pure render, unit tested. @param {string} f first field of the tile
 * @param {{typed: Record<string, string>, bad: Record<string, {error?: string, range?: readonly [number, number]}>}} st
 */
export function chartHtml(f, st) {
  const tile = tileOf(f) ?? { id: f, fields: [f], unit: 'cm' },
    unit = unitText(tile.unit);
  // Two entries on one day → one point (the latest).
  const pts = mergeSameX(
    measurements()
      .filter((r) => r[f] != null)
      .map((r) => ({ x: fmtDate(parseDay(r.date), { day: 'numeric', month: 'numeric' }), y: Number(r[f]) })),
  );
  const quick = tile.fields.map((id) => {
    const mf = MEASURE_FIELDS.find((x) => x.id === id),
      b = st.bad[id];
    return html`<label class="field mt10"><span>${t(`measure.${id}`)} <small class="muted">(${unit})</small></span>
<input class="input mqin${b ? ' bad' : ''}" id="q_${id}" inputmode="decimal" data-input="qv" data-k="${id}" value="${st.typed[id] ?? ''}" aria-describedby="qh_${id}" aria-invalid="${String(!!b)}">
${
  b
    ? html`<small class="ferr" id="qh_${id}" role="alert">${t(String(b.error), { min: b.range?.[0] ?? '', max: b.range?.[1] ?? '', unit })}</small>`
    : html`<small class="hint" id="qh_${id}">${mf ? L(mf.hint) : ''}</small>`
}</label>`;
  });
  return html`<h2 class="h2">${t(`measure.${tile.id}`)}</h2><div class="mquick mt8">${quick}
<button class="btn w100 mt12 mqsave" data-act="qsave">${ic('check', 18, 3)}${t('common.save')}</button></div>
<div class="mt12">${pts.length ? lineChart(pts, { unit, color: f === 'weight' ? '#1FB46B' : undefined, label: t(`measure.${f}`) }) : ''}</div>
<div class="list mt8">${measurements()
    .filter((r) => tile.fields.some((x) => r[x] != null))
    .reverse()
    .map(
      (
        r,
      ) => html`<div class="lrow"><span class="f1 b">${fmtDate(parseDay(r.date), { day: 'numeric', month: 'short', year: 'numeric' })}</span><span class="b num">${tile.fields.map((x) => fmt1(r[x])).join(' / ')} ${unit}</span>
<button class="iconbtn flat sm" data-act="del" data-id="${r.id}" aria-label="${t('common.delete')}">${ic('trash', 18)}</button></div>`,
    )}</div>`;
}

/** Chart sheet for one tile (by its first field) with the 1.6.2 quick entry. @param {string} f */
function openChart(f) {
  const pts = measurements().filter((r) => r[f] != null);
  if (!pts.length && f === 'weight')
    // 1.2.1: no data yet → a helpful empty state with an "Add weight" action (not a blank sheet)
    return void openSheet({
      render:
        () => html`<h2 class="h2">${t('measure.weight')}</h2><div class="center wempty mt12">${ic('scale', 34, 2)}<p class="muted b small mt8 lh">${t('body.weightEmpty')}</p>
<button class="btn w100 mt14" data-act="addw">${ic('plus', 18, 2.8)}${t('body.addWeight')}</button></div>`,
      actions: { addw: () => (closeSheet(), whenSettled(() => openMeasureForm('weight')), false) },
    });
  const tile = tileOf(f);
  /** @type {{typed: Record<string, string>, bad: Record<string, any>}} */
  const st = { typed: {}, bad: {} };
  openSheet({
    render: () => chartHtml(f, st),
    actions: {
      qv: (el) => ((st.typed[el.dataset.k ?? ''] = /** @type {HTMLInputElement} */ (el).value), false),
      qsave: () => {
        const { row, bad } = measureRow(tile?.fields ?? [f], st.typed, dayKey(), Date.now());
        st.bad = bad;
        if (Object.keys(bad).length) return; // re-render with the inline errors
        if (!row) return (emit('toast', { key: 'body.needValue' }), false);
        put('measurements', /** @type {any} */ ({ id: uid('m'), ...row }));
        st.typed = {};
        emit('toast', { key: 'body.saved' });
      },
      del: async (el) => {
        if (!(await confirmDialog({ title: t('body.deleteEntry'), ok: t('common.delete'), danger: true }))) return;
        const r = measurements().find((x) => x.id === el.dataset.id);
        if (!r) return;
        const unit = unitText(tile?.unit ?? '');
        const label = `${t(`measure.${tile?.id ?? f}`)} · ${(tile?.fields ?? [f]).map((x) => fmt1(r[x])).join(' / ')} ${unit}`;
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
  // 1.6.1: the shown measurements (by gender or the user's own set) – plus a field opened directly
  const fields = visibleFields();
  const focused = MEASURE_FIELDS.find((f) => f.id === focus);
  if (focused && !fields.includes(focused)) fields.push(focused);
  /** @type {Record<string, string>} */
  const v = { date: dayKey() };
  /** @type {Record<string, {error?: string, range?: readonly [number, number]}>} */
  let bad = {};
  openSheet({
    kind: 'full',
    render:
      () => html`<div class="row between"><h2 class="h2">${t('body.addTitle')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<p class="muted small b mt4">${t('body.addHint')}</p>
<label class="field mt12"><span>${t('body.date')}</span>${dateField({ value: v.date, act: 'v', k: 'date', id: 'mdate', max: dayKey(), label: t('body.date'), input: true })}</label>
${fields.map(
  (
    f,
  ) => html`<label class="field mt10"><span>${t(`measure.${f.id}`)} <small class="muted">(${unitText(f.unit)})</small></span>
<input class="input${bad[f.id] ? ' bad' : ''}" id="m_${f.id}" inputmode="decimal" data-input="v" data-k="${f.id}" value="${v[f.id] ?? ''}" placeholder="${last[f.id] != null ? fmt1(last[f.id]) : ''}" aria-describedby="h_${f.id}" aria-invalid="${String(!!bad[f.id])}">
${
  bad[f.id]
    ? html`<small class="ferr" id="h_${f.id}" role="alert">${t(String(bad[f.id].error), { min: bad[f.id].range?.[0] ?? '', max: bad[f.id].range?.[1] ?? '', unit: unitText(f.unit) })}</small>`
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
        for (const f of fields) {
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
<div class="row gap8 mt6 base"><span class="xb num big32">${fmt1(w.v)}</span><span class="muted b">${t('unit.kg')}</span></div>
<div class="row gap6 mt8">${w.base != null && w.v != null ? html`${delta(w.v - w.base, t('unit.kg'))}<span class="muted xs b">${t('body.vs4w')}</span>` : html`<span class="muted xs b">${t(w.v != null ? 'body.vs4wSoon' : 'body.noWeight')}</span>`}</div></div>
${sparkline(weights)}</button>
<div class="section-title"><h2 class="h3">${t('body.measurements')}</h2><span class="row gap8"><span class="muted xs b">${lastDate ? t('body.vsDate', { date: fmtDate(parseDay(lastDate), { day: 'numeric', month: 'short' }) }) : ''}</span><button class="link msetup" data-act="mset">${t('body.setup')}</button></span></div>
<div class="mgrid">${tiles().map((tile) => {
        const vals = tile.fields.map((f) => latestAndBase(rows, f));
        const d = vals.every((x) => x.v != null && x.base != null)
          ? vals.reduce((s, x) => s + (Number(x.v) - Number(x.base)), 0) / vals.length
          : null;
        return html`<button class="m" data-act="chart" data-f="${tile.fields[0]}"><div class="left"><div class="n">${t(`measure.${tile.id}`)}</div><div class="v num">${vals.map((x) => fmt1(x.v)).join(' / ')} <small>${unitText(tile.unit)}</small></div></div>${d != null ? delta(d, '') : ''}</button>`;
      })}<button class="m addm" data-act="add">${ic('plus', 20, 2.8)}${t('body.add')}</button></div>
${photoSection()}`;
    },
    actions: {
      add: () => (openMeasureForm(), false),
      mset: () => (openTileSetup(), false),
      chart: (el) => (openChart(el.dataset.f ?? 'weight'), false),
      psNew: () => (openSession(), false),
      psEdit: (el) => (openSession(el.dataset.id), false),
      psTimeline: () => (openTimeline(), false),
      psCompare: () => (openCompare(), false),
    },
  };
};
