/**
 * 1.4.3 Progress › Графики: per-day chart of the timed meal (the protein breakfast) for the
 * last 7 days — green on time, orange late with „+N мин“, grey missed — and the summary
 * („навреме 5/7 · средно закъснение 12 мин“). Plain SVG drawn here, same look as ui/charts.
 * @module features/daily/views/mealchart
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { all } from '../../../core/store.js';
import { timingDays, timingSummary } from '../mealtime.js';

const W = 320,
  H = 124,
  PAD_T = 18,
  PAD_B = 16,
  BASE = 30, // bar height of an on-time / missed day
  CAP = 120; // minutes of delay that reach the top

const COLORS = /** @type {const} */ ({ ontime: 'var(--ok)', late: '#f08a3c', missed: 'var(--muted)' });

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const n1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;

/**
 * The SVG: one bar per day; a late bar grows with the delay (capped) and carries „+N мин“.
 * @param {ReturnType<typeof timingDays>} days
 */
export function mealChartSvg(days) {
  const step = W / days.length,
    bw = Math.min(26, step * 0.6),
    ch = H - PAD_T - PAD_B;
  const bars = days
    .map(({ day, t: m }, i) => {
      const x = n1(step * i + (step - bw) / 2),
        cx = n1(step * i + step / 2);
      const lbl = `<text x="${cx}" y="${H - 3}" text-anchor="middle" class="chx">${esc(fmtDate(parseDay(day), { weekday: 'short' }))}</text>`;
      if (!m) return `<rect x="${x}" y="${PAD_T + ch - 2}" width="${n1(bw)}" height="2" rx="1" class="chnil"/>${lbl}`;
      if (m.status === 'pending')
        return `<rect x="${x}" y="${PAD_T + ch - BASE}" width="${n1(bw)}" height="${BASE}" rx="5" class="mcpend" data-s="pending"/>${lbl}`;
      const h = m.status === 'late' ? BASE + (Math.min(m.delayMin, CAP) / CAP) * (ch - BASE) : BASE;
      const y = n1(PAD_T + ch - h);
      const tag =
        m.status === 'late'
          ? `<text x="${cx}" y="${n1(y - 4)}" text-anchor="middle" class="mclate">${esc(t('mealChart.lateN', { n: m.delayMin }))}</text>`
          : '';
      return `<rect x="${x}" y="${y}" width="${n1(bw)}" height="${n1(h)}" rx="5" fill="${COLORS[m.status]}" opacity="${m.status === 'missed' ? 0.4 : 1}" data-s="${m.status}"/>${tag}${lbl}`;
    })
    .join('');
  return raw(
    `<svg class="chart mealchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('mealChart.title'))}">${bars}</svg>`,
  );
}

/** The whole card for Progress › Графики. @param {string} [today] */
export function mealChartCard(today = dayKey()) {
  /** @type {Record<string, any>} */
  const recs = Object.fromEntries(all('days').map((r) => [r.id, r]));
  const days = timingDays(recs, today, 7);
  const s = timingSummary(days);
  const any = days.some((d) => d.t);
  return html`<div class="card mt12 pad16 chcard ch-meals"><div class="row between"><h2 class="h3 xb">${t('mealChart.title')}</h2><span class="xs b muted">${t('mealChart.sub')}</span></div>
<div class="mt10">${
    any
      ? html`${mealChartSvg(days)}
<div class="row gap10 xs b mt6 mclegend"><span class="lg" style="--c:var(--ok)">${t('mealChart.onTime')}</span><span class="lg" style="--c:#f08a3c">${t('mealChart.late')}</span><span class="lg" style="--c:var(--muted)">${t('mealChart.missed')}</span></div>
<div class="row between small b mt8 mcsum"><span>${t('mealChart.summary', { n: s.onTime, total: s.total })}</span><span class="muted">${s.avgDelay == null ? t('mealChart.noDelay') : t('mealChart.avgDelay', { min: s.avgDelay })}</span></div>`
      : html`<p class="small muted b chempty">${t('mealChart.empty')}</p>`
  }</div></div>`;
}
