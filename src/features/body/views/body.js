/**
 * Body sub-tab of Progress: latest weight with trend, measurement tiles with deltas
 * (vs. ~4 weeks earlier), per-field charts, the add-measurement form with hints, and
 * progress photos with a before/now comparison.
 * @module features/body/views/body
 */
import { html, raw } from '../../../ui/dom.js';
import { L, fmtDate, t } from '../../../core/i18n.js';
import { addDays, dayKey, parseDay } from '../../../core/dates.js';
import { put, remove, uid } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { delta } from '../../../ui/components.js';
import { lineChart, sparkline } from '../../../ui/chart.js';
import { closeSheet, confirmDialog, openSheet } from '../../../ui/sheet.js';
import { MEASURE_FIELDS } from '../../../data/measurements.js';
import { measurements, photos } from '../api.js';
import { addPhoto, photoUrl } from '../photos.js';

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
  const pts = measurements()
    .filter((r) => r[f] != null)
    .map((r) => ({ x: fmtDate(parseDay(r.date), { day: 'numeric', month: 'numeric' }), y: Number(r[f]) }));
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
        if (await confirmDialog({ title: t('body.deleteEntry'), ok: t('common.delete'), danger: true }))
          remove('measurements', el.dataset.id ?? '');
      },
    },
  });
}

/** Add-measurement form (all fields optional, hints shown, last values as placeholders). */
export function openMeasureForm() {
  const last = Object.fromEntries(MEASURE_FIELDS.map((f) => [f.id, latestAndBase(measurements(), f.id).v]));
  /** @type {Record<string, string>} */
  const v = { date: dayKey() };
  openSheet({
    kind: 'full',
    render:
      () => html`<div class="row between"><h2 class="h2">${t('body.addTitle')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<p class="muted small b mt4">${t('body.addHint')}</p>
<label class="field mt12"><span>${t('body.date')}</span><input class="input" type="date" id="mdate" data-input="v" data-k="date" value="${v.date}" max="${dayKey()}"></label>
${MEASURE_FIELDS.map(
  (f) => html`<label class="field mt10"><span>${t(`measure.${f.id}`)} <small class="muted">(${f.unit})</small></span>
<input class="input" id="m_${f.id}" inputmode="decimal" data-input="v" data-k="${f.id}" value="${v[f.id] ?? ''}" placeholder="${last[f.id] != null ? fmt1(last[f.id]) : ''}" aria-describedby="h_${f.id}">
<small class="hint" id="h_${f.id}">${L(f.hint)}</small></label>`,
)}
<button class="btn w100 mt16 sticky-b" data-act="save">${ic('check', 20, 3)}${t('common.save')}</button>`,
    actions: {
      v: (el) => ((v[el.dataset.k ?? ''] = /** @type {HTMLInputElement} */ (el).value), false),
      save: () => {
        /** @type {Record<string, any>} */
        const row = { id: uid('m'), date: v.date || dayKey(), ts: Date.now() };
        for (const f of MEASURE_FIELDS) {
          const n = parseFloat((v[f.id] ?? '').replace(',', '.'));
          if (Number.isFinite(n) && n > 0 && n < 400) row[f.id] = n;
        }
        if (Object.keys(row).length <= 3) return (emit('toast', { key: 'body.needValue' }), false);
        put('measurements', /** @type {any} */ (row));
        closeSheet();
        emit('toast', { key: 'body.saved' });
        return false;
      },
    },
  });
}

/** Before/now photo comparison with selectable photos. */
function openCompare() {
  const list = photos();
  let a = 0,
    b = list.length - 1;
  const pick = (/** @type {number} */ i, /** @type {string} */ act) =>
    html`<div class="row gap6 hscroll mt6">${list.map((p, k) => html`<button class="thumb${k === i ? ' on' : ''}" data-act="${act}" data-i="${k}" aria-label="${fmtDate(parseDay(p.date), { day: 'numeric', month: 'short' })}"><img src="${photoUrl(p)}" alt=""></button>`)}</div>`;
  openSheet({
    kind: 'full',
    render:
      () => html`<div class="row between"><h2 class="h2">${t('body.compare')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<div class="row gap10 mt12 cmp">${[a, b].map((i, k) => html`<figure class="f1"><img src="${photoUrl(list[i])}" alt="${t(k ? 'body.now' : 'body.before')}"><figcaption class="lb">${t(k ? 'body.now' : 'body.before')} · ${fmtDate(parseDay(list[i].date), { day: 'numeric', month: 'short' })}</figcaption></figure>`)}</div>
<div class="xs xb muted caps mt12">${t('body.before')}</div>${pick(a, 'a')}<div class="xs xb muted caps mt10">${t('body.now')}</div>${pick(b, 'b')}
<button class="btn sec danger-t w100 mt16" data-act="del">${ic('trash', 18)}${t('body.deletePhoto')}</button>`,
    actions: {
      a: (el) => void (a = Number(el.dataset.i)),
      b: (el) => void (b = Number(el.dataset.i)),
      del: async () => {
        if (!(await confirmDialog({ title: t('body.deletePhotoQ'), ok: t('common.delete'), danger: true })))
          return false;
        remove('photos', list[b].id);
        closeSheet();
        return false;
      },
    },
  });
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  render: () => {
    const rows = measurements(),
      w = latestAndBase(rows, 'weight'),
      ph = photos();
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
<div class="section-title"><h2 class="h3">${t('body.photos')}</h2>${ph.length >= 2 ? html`<button class="link" data-act="compare">${t('body.compare')}</button>` : ''}</div>
<div class="row gap10 photos">${
      ph.length
        ? [ph[0], ...(ph.length > 1 ? [ph[ph.length - 1]] : [])].map(
            (p, k) =>
              html`<button class="ph" data-act="${ph.length > 1 ? 'compare' : 'noop'}"><img src="${photoUrl(p)}" alt="${t(k ? 'body.now' : 'body.before')}"><span class="lb">${t(k ? 'body.now' : 'body.before')} · ${fmtDate(parseDay(p.date), { day: 'numeric', month: 'short' })}</span></button>`,
          )
        : html`<div class="ph empty-ph"><span class="lb">${t('body.before')}</span>${raw('<svg width="70" height="100" viewBox="0 0 70 100" aria-hidden="true"><circle cx="35" cy="16" r="11" fill="#C3CDD3"/><path d="M14 100 Q12 50 20 34 Q35 28 50 34 Q58 50 56 100Z" fill="#C3CDD3"/></svg>')}</div>`
    }
<label class="ph addph">${ic('camera', 24, 2.2)}${t('body.addPhoto')}<input type="file" accept="image/*" data-change="photo" class="sr-only"></label></div>
<p class="muted xs b mt8">${t('body.photosPrivate')}</p>`;
  },
  actions: {
    add: () => (openMeasureForm(), false),
    chart: (el) => (openChart(el.dataset.f ?? 'weight'), false),
    compare: () => (openCompare(), false),
    noop: () => false,
    photo: async (el) => {
      const input = /** @type {HTMLInputElement} */ (el),
        file = input.files?.[0];
      if (!file) return false;
      await addPhoto(file);
      input.value = '';
      emit('toast', { key: 'body.photoSaved' });
    },
  },
});
