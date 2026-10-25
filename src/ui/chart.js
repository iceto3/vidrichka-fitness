/**
 * Lightweight SVG charts (line chart with area + sparkline). No dependencies.
 * @module ui/chart
 */
import { html, raw } from './dom.js';
import { fmtNum } from '../core/i18n.js';

/** Stable id from the chart's content, so re-renders produce identical markup. @param {string} s */
const gid = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
};

/**
 * One point per x label (per day): points sharing a label are merged — `last` keeps the
 * latest value (body measurements), `max` the best (lifts). Order is kept.
 * @param {{x: string, y: number}[]} pts @param {'last'|'max'} [how]
 */
export function mergeSameX(pts, how = 'last') {
  /** @type {{x: string, y: number}[]} */
  const out = [];
  for (const p of pts) {
    const i = out.findIndex((q) => q.x === p.x);
    if (i < 0) out.push({ ...p });
    else out[i].y = how === 'max' ? Math.max(out[i].y, p.y) : p.y;
  }
  return out;
}

/**
 * Line chart. Points with the same label are merged (see `mergeSameX`), so the x-axis never
 * shows the same date twice.
 * @param {{x: string, y: number}[]} pts  Points in order; `x` is the axis label.
 * @param {{w?: number, h?: number, unit?: string, color?: string, label?: string}} [o]
 */
export function lineChart(pts, o = {}) {
  const W = o.w ?? 340,
    H = o.h ?? 130,
    pl = 32,
    pr = 10,
    pt = 26,
    pb = 22,
    color = o.color ?? 'var(--accent)';
  pts = mergeSameX(pts);
  if (!pts.length) return html``;
  const ys = pts.map((p) => p.y);
  let lo = Math.min(...ys),
    hi = Math.max(...ys);
  const padv = (hi - lo) * 0.15 || Math.max(1, hi * 0.05);
  lo = Math.floor(lo - padv);
  hi = Math.ceil(hi + padv);
  const X = (/** @type {number} */ i) =>
    pl + (pts.length === 1 ? (W - pl - pr) / 2 : (i * (W - pl - pr)) / (pts.length - 1));
  const Y = (/** @type {number} */ v) => pt + ((hi - v) / (hi - lo)) * (H - pt - pb);
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)} ${Y(p.y).toFixed(1)}`).join(' ');
  const ticks = [lo, (lo + hi) / 2, hi].map((g) => Math.round(g * 10) / 10);
  const step = Math.ceil(pts.length / 8);
  const last = pts.length - 1,
    lx = X(last),
    ly = Y(pts[last].y),
    id = `ag${gid(d + color)}`;
  const tag = `${fmt(pts[last].y)}${o.unit ? ' ' + o.unit : ''}`,
    tw = tag.length * 6.4 + 14;
  return html`<svg class="chart" viewBox="0 0 ${W} ${H}" width="100%" role="img" aria-label="${o.label ?? ''}">
<defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#0B8F96" stop-opacity=".28"/><stop offset="1" stop-color="#0B8F96" stop-opacity="0"/></linearGradient></defs>
${ticks.map((g) => raw(`<line x1="${pl}" x2="${W - pr}" y1="${Y(g)}" y2="${Y(g)}" stroke="var(--line)" stroke-dasharray="3 4"/><text x="${pl - 6}" y="${Y(g) + 4}" text-anchor="end" font-size="10" font-weight="700" fill="var(--muted)">${fmt(g)}</text>`))}
${pts.length > 1 ? raw(`<path d="${d} L${lx} ${H - pb} L${X(0)} ${H - pb} Z" fill="url(#${id})"/>`) : ''}
<path d="${d}" fill="none" stroke="${color}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round"/>
${pts.slice(0, -1).map((p, i) => raw(`<circle cx="${X(i)}" cy="${Y(p.y)}" r="3.5" fill="var(--card)" stroke="${color}" stroke-width="2.5"/>`))}
<circle cx="${lx}" cy="${ly}" r="6" fill="${color}" stroke="#fff" stroke-width="3"/>
<rect x="${Math.min(lx - tw / 2, W - tw)}" y="${ly - 30}" width="${tw}" height="20" rx="7" fill="#13232C"/>
<text x="${Math.min(lx, W - tw / 2)}" y="${ly - 16}" text-anchor="middle" font-size="11" font-weight="800" fill="#fff">${tag}</text>
${pts.map((p, i) => (i % step === 0 || i === last ? raw(`<text x="${X(i)}" y="${H - 5}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--muted)">${p.x}</text>`) : ''))}
</svg>`;
}

/**
 * Small sparkline.
 * @param {number[]} vals
 * @param {string} [color]
 */
export function sparkline(vals, color = '#1FB46B') {
  if (vals.length < 2) return html``;
  const W = 140,
    H = 42,
    lo = Math.min(...vals),
    hi = Math.max(...vals) || 1,
    id = `sg${gid(vals.join() + color)}`;
  const pts = vals.map((v, i) => [(i * W) / (vals.length - 1), 4 + ((hi - v) / (hi - lo || 1)) * (H - 10)]);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [ex, ey] = pts[pts.length - 1];
  return html`<svg width="140" height="54" viewBox="-4 -6 150 54" aria-hidden="true"><defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${color}" stop-opacity=".25"/><stop offset="1" stop-color="${color}" stop-opacity="0"/></linearGradient></defs>
<path d="${d} L${W} ${H} L0 ${H}Z" fill="url(#${id})"/><path d="${d}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/><circle cx="${ex}" cy="${ey}" r="4" fill="${color}"/></svg>`;
}

/** @param {number} n */
const fmt = (n) => fmtNum(n, 1);
