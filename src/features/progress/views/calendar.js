/**
 * Calendar sub-tab: month grid with workout days, month stats and session history.
 * @module features/progress/views/calendar
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtVolume, t, weekdayName } from '../../../core/i18n.js';
import { dayKey, durationMin, monthKey, totalMin, weekdayMon } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { empty } from '../../../ui/components.js';
import { planName, sessions } from '../../workouts/api.js';

const state = { y: new Date().getFullYear(), m: new Date().getMonth() };

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  render: () => {
    const first = new Date(state.y, state.m, 1),
      mk = monthKey(first),
      days = new Date(state.y, state.m + 1, 0).getDate();
    const list = sessions().filter((s) => monthKey(new Date(s.endedAt)) === mk);
    // 1.2.1: partial workouts are listed and marked, but not counted as workouts.
    const full = list.filter((s) => !s.partial),
      partial = list.length - full.length,
      vol = list.reduce((a, s) => a + (s.volume || 0), 0);
    const byDay = new Set(full.map((s) => dayKey(s.endedAt))),
      partDay = new Set(list.filter((s) => s.partial).map((s) => dayKey(s.endedAt)));
    const today = dayKey(),
      isNow = mk === monthKey();
    return html`<div class="card mt12 cal">
<div class="row between"><button class="iconbtn flat sm" data-act="mon" data-d="-1" aria-label="${t('calendar.prev')}">${ic('left', 18)}</button>
<h2 class="h3 xb">${fmtDate(first, { month: 'long', year: 'numeric' })}</h2>
<button class="iconbtn flat sm" data-act="mon" data-d="1" aria-label="${t('calendar.next')}" ${isNow ? 'disabled' : ''}>${ic('right', 18)}</button></div>
<div class="calgrid mt8">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<span class="xs b muted">${weekdayName(i, 'narrow')}</span>`)}
${Array.from({ length: weekdayMon(first) }, () => html`<span></span>`)}
${Array.from({ length: days }, (_, i) => {
  const k = dayKey(new Date(state.y, state.m, i + 1));
  return html`<span class="cd${byDay.has(k) ? ' on' : partDay.has(k) ? ' part' : ''}${k === today ? ' today' : ''}">${i + 1}</span>`;
})}</div></div>
<div class="grid3 mt12"><div class="stat"><div class="l">${ic('dumbbell', 15, 2.3)}${t('calendar.workouts')}</div><div class="v num">${full.length}${partial ? html` <small class="partn">${t('calendar.partialN', { n: partial })}</small>` : ''}</div></div>
<div class="stat"><div class="l">${ic('clock', 15, 2.3)}${t('calendar.time')}</div><div class="v num">${totalMin(list)} <small>${t('unit.min')}</small></div></div>
<div class="stat"><div class="l">${ic('bolt', 15, 2.3)}${t('summary.volume')}</div><div class="v num">${fmtVolume(vol).value} <small>${fmtVolume(vol).unit}</small></div></div></div>
${list.length && !isNow ? html`<button class="btn sec w100 mt12" data-act="recap">${ic('gift', 18, 2.2)}${t('calendar.recap', { month: fmtDate(first, { month: 'long' }) })}</button>` : ''}
<div class="section-title"><h2 class="h3">${t('calendar.history')}</h2></div>
${
  list.length
    ? html`<div class="card list">${list.map(
        (
          s,
        ) => html`<button class="lrow" data-go="history/${s.id}"><span class="f1 left"><span class="b block">${planName(s)}</span>
<span class="muted xs b">${fmtDate(s.endedAt, { weekday: 'short', day: 'numeric', month: 'short' })} · ${durationMin(s.durationSec)} ${t('unit.min')} · ${fmtVolume(s.volume).text}</span></span>
${s.partial ? html`<span class="chip chip-sm">${t('summary.partial')}</span>` : ''}
${s.prs.length ? html`<span class="chip warm chip-sm">${ic('trophy', 13, 2.4)}${s.prs.length}</span>` : ''}${ic('right', 16, 2.2, 'var(--muted)')}</button>`,
      )}</div>`
    : empty('calendar', t('calendar.none'))
}`;
  },
  actions: {
    mon: (el) => {
      const d = new Date(state.y, state.m + Number(el.dataset.d), 1);
      Object.assign(state, { y: d.getFullYear(), m: d.getMonth() });
    },
    recap: () => (emit('nav', { path: `recap/${monthKey(new Date(state.y, state.m, 1))}` }), false),
  },
});
