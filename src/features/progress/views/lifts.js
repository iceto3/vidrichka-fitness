/**
 * Lifts sub-tab: per-exercise progress chart (4W/8W/6M), training-days heatmap,
 * personal records and badges.
 * @module features/progress/views/lifts
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtKg, fmtNum, t, weekdayName } from '../../../core/i18n.js';
import { addDays, dayKey, parseDay, startOfWeek } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { delta, empty, seg } from '../../../ui/components.js';
import { lineChart, mergeSameX } from '../../../ui/chart.js';
import { openSheet } from '../../../ui/sheet.js';
import { exById, exName } from '../../library/api.js';
import { sessions } from '../../workouts/api.js';
import { badges } from '../../motivation/api.js';

const RANGES = { '4w': 28, '8w': 56, '6m': 182 };
const state = { ex: '', range: /** @type {keyof RANGES} */ ('8w'), allPrs: false };

/** Heat level 0..3 from sets done that day. @param {number} n */
const heat = (n) => (n === 0 ? 0 : n < 10 ? 1 : n < 18 ? 2 : 3);
const HEAT = ['var(--soft)', '#B8E3E4', '#5FC0C4', '#0B8F96'];

/**
 * Training-days heatmap for the last `days` days. 1.4.0: weeks are rows starting on Monday
 * under weekday labels, days after today stay empty, and a legend explains the shades.
 * @param {number} days @param {Date} [now]
 */
export function heatmap(days = 28, now = new Date()) {
  /** @type {Record<string, number>} */
  const per = {};
  sessions().forEach((s) => (per[dayKey(s.endedAt)] = (per[dayKey(s.endedAt)] ?? 0) + s.setsDone));
  const today = dayKey(now),
    first = dayKey(addDays(now, -(days - 1))),
    start = startOfWeek(addDays(now, -(days - 1)));
  const weeks = Math.ceil((Math.round((startOfWeek(now).getTime() - start.getTime()) / 864e5) + 7) / 7);
  const cells = Array.from({ length: weeks * 7 }, (_, i) => dayKey(addDays(start, i)));
  const inRange = (/** @type {string} */ k) => k >= first && k <= today;
  const n = cells.filter((k) => inRange(k) && per[k]).length;
  return {
    n,
    html: html`<div class="heat mt10" role="img" aria-label="${t('progress.trainingDays')}: ${n}">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<b class="hd" aria-hidden="true">${weekdayName(i, 'narrow')}</b>`)}${cells.map((k) => (inRange(k) ? html`<i class="${k === today ? 'today' : ''}" style="background:${HEAT[heat(per[k] ?? 0)]}" title="${fmtDate(parseDay(k), { weekday: 'short', day: 'numeric', month: 'short' })}"></i>` : html`<i class="off" aria-hidden="true"></i>`))}</div>
<div class="row gap6 mt8 xs b muted heatlegend" aria-hidden="true"><span>${t('progress.heatLess')}</span>${HEAT.map((c) => html`<i style="background:${c}"></i>`)}<span>${t('progress.heatMore')}</span></div>`,
  };
}

/** Badge medal; with `how`, a locked one says how to unlock it (1.4.0). @param {any} b @param {boolean} [how] */
export const medal = (b, how = false) =>
  html`<div class="badge${b.at ? '' : ' locked'}"><div class="m" style="background:${b.at ? b.color : 'var(--soft)'}">${b.icon.startsWith('@') ? ic(b.icon.slice(1), 26, 2.4, b.at ? '#fff' : 'var(--muted)') : b.icon}</div>${t(b.label)}${how && !b.at ? html`<span class="xs muted bhow">${t(`badgeHow.${b.id}`)}</span>` : ''}</div>`;

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  render: () => {
    const all = sessions();
    if (!all.length) return html`<div class="mt16">${empty('chart', t('progress.noData'))}</div>${badgeRow()}`;
    const trained = [
      ...new Set(
        all.flatMap((s) =>
          s.items
            .filter((/** @type {any} */ i) => i.sets.some((/** @type {any} */ x) => x.done))
            .map((/** @type {any} */ i) => i.exId),
        ),
      ),
    ];
    if (!trained.includes(state.ex)) state.ex = trained.find((id) => exById(id)?.weighted) ?? trained[0];
    const weighted = exById(state.ex)?.weighted ?? true;
    const since = Date.now() - RANGES[state.range] * 864e5;
    let pts = [...all]
      .reverse()
      .filter((s) => s.endedAt >= since)
      .map((s) => {
        const sets = s.items
          .filter((/** @type {any} */ i) => i.exId === state.ex)
          .flatMap((/** @type {any} */ i) => i.sets.filter((/** @type {any} */ x) => x.done));
        return sets.length
          ? {
              x: fmtDate(s.endedAt, { day: 'numeric', month: 'numeric' }),
              y: Math.max(...sets.map((/** @type {any} */ x) => (weighted ? x.w : x.r))),
            }
          : null;
      })
      .filter((p) => p != null);
    pts = mergeSameX(pts, 'max'); // two workouts on one day → one point (the best)
    const best = pts.length ? Math.max(...pts.map((p) => p.y)) : 0;
    const unit = weighted ? t('unit.kg') : t('unit.repsShort');
    const hm = heatmap();
    const prs = all
      .flatMap((s) => s.prs.map((/** @type {any} */ p) => ({ ...p, at: s.endedAt })))
      .slice(0, state.allPrs ? 50 : 3);
    const colors = ['var(--warm)', 'var(--accent)', '#7C5CFF'];
    return html`<div class="card mt12 chartcard">
<div class="row between top-al"><div><label class="selwrap b"><select data-change="ex" aria-label="${t('progress.exercise')}">${trained.map((id) => html`<option value="${id}" ${id === state.ex ? 'selected' : ''}>${exName(id)}</option>`)}</select>${ic('down', 16, 2.4)}</label>
<div class="row gap8 mt6"><span class="xb num big24">${fmtNum(best, 1)} ${unit}</span>${pts.length > 1 ? delta(pts[pts.length - 1].y - pts[0].y, unit) : ''}</div></div>
${seg(
  Object.keys(RANGES).map((r) => ({ value: r, label: t(`progress.range.${r}`) })),
  state.range,
  'range',
  'mini',
)}</div>
<div class="mt8">${pts.length ? lineChart(pts, { unit, label: exName(state.ex) }) : html`<p class="muted small b center pad14">${t('progress.noRange')}</p>`}</div></div>
<div class="card mt12 pad1214"><div class="row between"><h2 class="h3 xb">${t('progress.trainingDays')}</h2><span class="muted xs b">${t('progress.last4', { n: hm.n })}</span></div>${hm.html}</div>
<div class="card mt12 prs"><div class="row between prhead"><h2 class="h3 xb">${t('progress.records')}</h2>${prs.length >= 3 ? html`<button class="link" data-act="allPrs">${state.allPrs ? t('common.less') : t('common.seeAll')}</button>` : ''}</div>
${
  prs.length
    ? prs.map(
        (p, i) =>
          html`<div class="pr"><div class="sq soft" style="color:${colors[i % 3]}">${ic('trophy', 19, 2.2)}</div><div class="f1"><div class="b">${exName(p.exId)}</div><div class="muted xs b">${dayKey(p.at) === dayKey() ? t('common.today') : fmtDate(p.at, { day: 'numeric', month: 'short' })}</div></div><div class="xb num">${p.w ? `${fmtKg(p.w)} × ${p.r}` : `× ${p.r}`}</div></div>`,
      )
    : html`<p class="muted small b pad10">${t('progress.noPrs')}</p>`
}</div>
${badgeRow()}`;
  },
  actions: {
    ex: (el) => void (state.ex = /** @type {HTMLSelectElement} */ (el).value),
    range: (el) => void (state.range = /** @type {any} */ (el.dataset.v)),
    allPrs: () => void (state.allPrs = !state.allPrs),
    badges: () => {
      openSheet({
        render: () =>
          html`<h2 class="h2">${t('progress.badges')}</h2><p class="small muted b mt4">${t('progress.badgesHow')}</p><div class="badgegrid mt12">${badges().map((b) => medal(b, true))}</div>`,
      });
      return false;
    },
  },
});

/** Badges preview row (earned first). */
function badgeRow() {
  const list = badges().sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  const earned = list.filter((b) => b.at).length;
  return html`<div class="section-title"><h2 class="h3">${t('progress.badges')}</h2><button class="link" data-act="badges">${t('progress.earned', { n: earned, total: list.length })}</button></div>
<div class="row badges4">${list.slice(0, 4).map((b) => medal(b))}</div>`;
}
