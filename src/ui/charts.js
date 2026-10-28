/**
 * Tiny SVG charts (1.3.4 Progress › Trends): bars with an optional goal line, and lines on a
 * fixed scale. No library; the SVG scales to the card width (viewBox) and stays crisp.
 * @module ui/charts
 */
import { raw } from './dom.js';

const W = 320,
  H = 112,
  PAD_B = 16,
  PAD_T = 8;

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const n1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;

/**
 * @typedef {{x: string, y: number|null}} Pt
 * @typedef {{label?: (x: string, i: number) => string, goal?: number|null, goalLabel?: string,
 *   color?: string, aria: string, max?: number, hit?: (y: number) => boolean}} BarOpts
 */

/** Labels for the first, middle and last points. @param {Pt[]} pts @param {(x: string, i: number) => string} [label] */
function xLabels(pts, label) {
  if (!label || !pts.length) return '';
  // 1.4.0: a week shows every day (Mon…Sun); longer ranges the first, middle and last.
  const idx =
    pts.length <= 8 ? pts.map((_, i) => i) : [...new Set([0, Math.floor((pts.length - 1) / 2), pts.length - 1])];
  const step = W / pts.length;
  return idx
    .map((i) => {
      const x = n1(step * i + step / 2);
      const edge = pts.length > 2 && pts.length > 8;
      const anchor = i === 0 && edge ? 'start' : i === pts.length - 1 && edge ? 'end' : 'middle';
      const xx = anchor === 'start' ? n1(step * i) : anchor === 'end' ? n1(step * (i + 1)) : x;
      return `<text x="${xx}" y="${H - 3}" text-anchor="${anchor}" class="chx">${esc(label(pts[i].x, i))}</text>`;
    })
    .join('');
}

/**
 * Bar chart. Missing days get a faint stub; bars reaching `goal` (or `hit`) use the full
 * colour, the rest are lighter.
 * @param {Pt[]} pts @param {BarOpts} o
 */
export function barChart(pts, o) {
  const ys = /** @type {number[]} */ (pts.map((p) => p.y).filter((y) => typeof y === 'number'));
  const max = o.max ?? Math.max(1, ...ys, (o.goal ?? 0) * 1.15);
  const ch = H - PAD_B - PAD_T;
  const step = W / Math.max(1, pts.length);
  const bw = Math.max(2, Math.min(22, step * 0.66));
  const yOf = (/** @type {number} */ v) => n1(PAD_T + ch - (Math.min(v, max) / max) * ch);
  const color = o.color ?? 'var(--accent)';
  const hit = o.hit ?? ((y) => o.goal == null || y >= o.goal);
  const bars = pts
    .map((p, i) => {
      const x = n1(step * i + (step - bw) / 2);
      if (p.y == null || p.y <= 0)
        return `<rect x="${x}" y="${PAD_T + ch - 2}" width="${n1(bw)}" height="2" rx="1" class="chnil"/>`;
      const y = yOf(p.y);
      return `<rect x="${x}" y="${y}" width="${n1(bw)}" height="${n1(PAD_T + ch - y)}" rx="${n1(Math.min(4, bw / 3))}" fill="${color}" opacity="${hit(p.y) ? 1 : 0.45}"/>`;
    })
    .join('');
  const goal =
    o.goal != null && o.goal > 0
      ? `<line x1="0" x2="${W}" y1="${yOf(o.goal)}" y2="${yOf(o.goal)}" class="chgoal"/>${o.goalLabel ? `<text x="${W - 2}" y="${yOf(o.goal) - 3}" text-anchor="end" class="chgl">${esc(o.goalLabel)}</text>` : ''}`
      : '';
  return raw(
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">${bars}${goal}${xLabels(pts, o.label)}</svg>`,
  );
}

/**
 * Lines on a fixed scale (e.g. mood and energy 1–5); gaps where a value is missing.
 * @param {{pts: Pt[], color: string}[]} lines @param {{min: number, max: number, aria: string, label?: (x: string, i: number) => string, gridStep?: number}} o
 *   `gridStep` (1.4.0): value between grid lines (default 1, e.g. the 1–5 mood scale).
 */
export function lineChart(lines, o) {
  const ch = H - PAD_B - PAD_T;
  const len = Math.max(1, ...lines.map((l) => l.pts.length));
  const step = W / len;
  const yOf = (/** @type {number} */ v) => n1(PAD_T + ch - ((v - o.min) / (o.max - o.min)) * ch);
  const gs = o.gridStep ?? 1;
  const grid = Array.from(
    { length: Math.floor((o.max - o.min) / gs) + 1 },
    (_, i) => `<line x1="0" x2="${W}" y1="${yOf(o.min + i * gs)}" y2="${yOf(o.min + i * gs)}" class="chgrid"/>`,
  ).join('');
  const paths = lines
    .map((l) => {
      let d = '',
        pen = false;
      /** @type {string[]} */
      const dots = [];
      l.pts.forEach((p, i) => {
        if (p.y == null) return void (pen = false);
        const x = n1(step * i + step / 2),
          y = yOf(p.y);
        d += `${pen ? 'L' : 'M'}${x} ${y}`;
        pen = true;
        if (len <= 31) dots.push(`<circle cx="${x}" cy="${y}" r="2.6" fill="${l.color}"/>`);
      });
      return `<path d="${d}" fill="none" stroke="${l.color}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>${dots.join('')}`;
    })
    .join('');
  return raw(
    `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(o.aria)}">${grid}${paths}${xLabels(lines[0]?.pts ?? [], o.label)}</svg>`,
  );
}
