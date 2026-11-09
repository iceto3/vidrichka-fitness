/**
 * 1.4.3 Progress › Графики: per-day chart of the timed meal (the protein breakfast) for the
 * last 7 days — green on time, orange late with „+N мин“, grey „пропусната“ — and the summary.
 * Part A: each eaten breakfast also shows its protein (grams under the day); one with less
 * than 30 g is hatched („малко протеин · N г“), and the summary counts the protein breakfasts:
 * „навреме 5/7 · протеинови 6/7 · средно закъснение 14 мин“. Hidden while the protein
 * breakfast is switched off in Profile. Plain SVG drawn here, same look as ui/charts.
 * @module features/daily/views/mealchart
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { all } from '../../../core/store.js';
import { proteinBreakfastOn } from '../../../core/settings.js';
import { isLowProtein, timingDays, timingSummary } from '../mealtime.js';

const W = 320,
  H = 140,
  PAD_T = 18,
  PAD_B = 30, // weekday + protein grams under the bars
  BASE = 30, // bar height of an on-time / missed day
  CAP = 120; // minutes of delay that reach the top

const COLORS = /** @type {const} */ ({ ontime: 'var(--ok)', late: '#f08a3c', missed: 'var(--muted)' });

/** @param {string} s */
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c);
const n1 = (/** @type {number} */ v) => Math.round(v * 10) / 10;

/**
 * What a day's bar says, for its tooltip / screen readers.
 * @param {ReturnType<typeof timingDays>[number]} d
 */
function dayText(d) {
  const m = d.t;
  if (!m) return '';
  const parts = [
    m.status === 'pending'
      ? t('mealChart.pending')
      : m.status === 'missed'
        ? t('mealChart.missed')
        : m.status === 'late'
          ? `${t('mealChart.late')} ${t('mealChart.lateN', { n: m.delayMin })}`
          : t('mealChart.onTime'),
  ];
  if (isLowProtein(d)) parts.push(t('mealChart.lowProtein', { n: d.protein }));
  else if (d.protein != null && m.status !== 'missed' && m.status !== 'pending')
    parts.push(`${d.protein} ${t('unit.g')}`);
  return `${fmtDate(parseDay(d.day), { weekday: 'short' })}: ${parts.join(' · ')}`;
}

/**
 * The SVG: one bar per day; a late bar grows with the delay (capped) and carries „+N мин“;
 * a breakfast with little protein is hatched; under each day its protein in grams.
 * @param {ReturnType<typeof timingDays>} days
 */
export function mealChartSvg(days) {
  const step = W / days.length,
    bw = Math.min(26, step * 0.6),
    ch = H - PAD_T - PAD_B;
  const bars = days
    .map((d, i) => {
      const { day, t: m } = d;
      const x = n1(step * i + (step - bw) / 2),
        cx = n1(step * i + step / 2);
      const eaten = !!m && (m.status === 'ontime' || m.status === 'late');
      const low = isLowProtein(d);
      const lbl = `<text x="${cx}" y="${H - 17}" text-anchor="middle" class="chx">${esc(fmtDate(parseDay(day), { weekday: 'short' }))}</text>${
        eaten && d.protein != null
          ? `<text x="${cx}" y="${H - 4}" text-anchor="middle" class="mcg${low ? ' low' : ''}">${esc(`${d.protein} ${t('unit.g')}`)}</text>`
          : ''
      }`;
      if (!m) return `<rect x="${x}" y="${PAD_T + ch - 2}" width="${n1(bw)}" height="2" rx="1" class="chnil"/>${lbl}`;
      const title = `<title>${esc(dayText(d))}</title>`;
      if (m.status === 'pending')
        return `<g><rect x="${x}" y="${PAD_T + ch - BASE}" width="${n1(bw)}" height="${BASE}" rx="5" class="mcpend" data-s="pending"/>${title}</g>${lbl}`;
      const h = m.status === 'late' ? BASE + (Math.min(m.delayMin, CAP) / CAP) * (ch - BASE) : BASE;
      const y = n1(PAD_T + ch - h);
      const tag =
        m.status === 'late'
          ? `<text x="${cx}" y="${n1(y - 4)}" text-anchor="middle" class="mclate">${esc(t('mealChart.lateN', { n: m.delayMin }))}</text>`
          : '';
      const hatch = low
        ? `<rect x="${x}" y="${y}" width="${n1(bw)}" height="${n1(h)}" rx="5" fill="url(#mchatch)" class="mclow"/>`
        : '';
      return `<g data-s="${m.status}"${low ? ' data-low="1"' : ''}><rect x="${x}" y="${y}" width="${n1(bw)}" height="${n1(h)}" rx="5" fill="${COLORS[m.status]}" opacity="${m.status === 'missed' ? 0.4 : low ? 0.55 : 1}"/>${hatch}${title}</g>${tag}${lbl}`;
    })
    .join('');
  const defs = `<defs><pattern id="mchatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width="6" height="6" fill="none"/><line x1="0" y1="0" x2="0" y2="6" class="mchl"/></pattern></defs>`;
  return raw(
    `<svg class="chart mealchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(t('mealChart.title'))}">${defs}${bars}</svg>`,
  );
}

/** Food rows by day (water left out), for the breakfast protein. */
function foodByDay() {
  /** @type {Record<string, any[]>} */
  const out = {};
  for (const r of all('food')) if (r.type !== 'water') (out[r.date] ??= []).push(r);
  return out;
}

/** The whole card for Progress › Графики (none while the protein breakfast is off). @param {string} [today] */
export function mealChartCard(today = dayKey()) {
  if (!proteinBreakfastOn()) return '';
  /** @type {Record<string, any>} */
  const recs = Object.fromEntries(all('days').map((r) => [r.id, r]));
  const days = timingDays(recs, today, 7, foodByDay());
  const s = timingSummary(days);
  const any = days.some((d) => d.t);
  const sum = [
    t('mealChart.summary', { n: s.onTime, total: s.total }),
    t('mealChart.proteinSum', { n: s.protein, total: s.total }),
    s.avgDelay == null ? t('mealChart.noDelay') : t('mealChart.avgDelay', { min: s.avgDelay }),
  ];
  return html`<div class="card mt12 pad16 chcard ch-meals"><div class="row between"><h2 class="h3 xb">${t('mealChart.title')}</h2><span class="xs b muted">${t('mealChart.sub')}</span></div>
<div class="mt10">${
    any
      ? html`${mealChartSvg(days)}
<div class="row gap10 xs b mt6 mclegend wrap"><span class="lg" style="--c:var(--ok)">${t('mealChart.onTime')}</span><span class="lg" style="--c:#f08a3c">${t('mealChart.late')}</span><span class="lg" style="--c:var(--muted)">${t('mealChart.missed')}</span><span class="lg hatch">${t('mealChart.lowLegend')}</span></div>
<div class="small b mt8 mcsum">${sum.join(' · ')}</div>`
      : html`<p class="small muted b chempty">${t('mealChart.empty')}</p>`
  }</div></div>`;
}
