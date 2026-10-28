/**
 * Progress › Sleep: last 14 nights — hours slept (bars), averages of sleep, mood and
 * energy, and a night-by-night list (estimated bedtimes are marked).
 * @module features/daily/views/sleep
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtDuration, t } from '../../../core/i18n.js';
import { parseDay } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { empty } from '../../../ui/components.js';
import { FACES } from './checkin.js';
import { sleepNights, sleepRun } from '../api.js';

const avg = (/** @type {(number|null)[]} */ xs) => {
  const v = /** @type {number[]} */ (xs.filter((x) => x != null));
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
const hm = (/** @type {number} */ ts) => fmtDate(ts, { hour: '2-digit', minute: '2-digit' });
const face = (/** @type {number|null} */ v) => (v ? FACES[Math.round(v) - 1] : '–');

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  render: () => {
    const list = sleepNights(14),
      week = list.slice(0, 7);
    const hrs = avg(week.map((n) => n.hours));
    const known = list.filter((n) => n.hours != null || n.mood || n.energy || n.bed);
    const max = Math.max(10, ...list.map((n) => n.hours ?? 0));
    return html`<div class="grid3 mt12 sleepstats">
<div class="stat"><div class="l">${ic('moon', 15, 2.3)}${t('sleep.avg')}</div><div class="v num">${hrs == null ? '–' : fmtDuration(hrs)}</div></div>
<div class="stat"><div class="l">🙂 ${t('sleep.mood')}</div><div class="v">${face(avg(week.map((n) => n.mood)))}</div></div>
<div class="stat"><div class="l">⚡ ${t('sleep.energy')}</div><div class="v">${face(avg(week.map((n) => n.energy)))}</div></div></div>
<div class="card mt12 pad16"><div class="row between"><h2 class="h3 xb">${t('sleep.hours')}</h2><span class="chip chip-sm">🌙 ${t('goodnight.streak', { n: sleepRun() })}</span></div>
<div class="sbars mt12" role="img" aria-label="${t('sleep.hours')}">${[...list].reverse().map(
      (n) =>
        // 1.4.0: the weekday letter and the day of the month under each bar (+ the range below)
        html`<div class="sb${n.bedEst ? ' est' : ''}" title="${fmtDate(parseDay(n.day), { weekday: 'long', day: 'numeric', month: 'long' })}${n.hours == null ? '' : ` · ${fmtDuration(n.hours)}`}"><i style="${raw(`height:${((n.hours ?? 0) / max) * 100}%`)}"></i><span>${fmtDate(parseDay(n.day), { weekday: 'narrow' })}</span><b class="num">${parseDay(n.day).getDate()}</b></div>`,
    )}</div>${
      list.length
        ? html`<div class="row between muted xs b mt6 num sbrange"><span>${fmtDate(parseDay(list[list.length - 1].day), { day: 'numeric', month: 'short' })}</span><span>${fmtDate(parseDay(list[0].day), { day: 'numeric', month: 'short' })}</span></div>`
        : ''
    }<div class="muted xs b mt8">${t('sleep.legend')}</div></div>
<div class="section-title"><h2 class="h3">${t('sleep.nights')}</h2></div>
${
  known.length
    ? html`<div class="card list">${known.map(
        (
          n,
        ) => html`<div class="lrow"><span class="f1 left"><span class="b block">${fmtDate(parseDay(n.day), { weekday: 'short', day: 'numeric', month: 'short' })}</span>
<span class="muted xs b">${n.bed ? hm(n.bed) : '–'}${n.bedEst ? ` (${t('sleep.estimated')})` : ''} → ${n.wake ? hm(n.wake) : '–'}</span></span>
<span class="row gap8"><span title="${t('sleep.quality')}">${face(n.sleepQ)}</span><span class="b num">${n.hours == null ? '' : fmtDuration(n.hours)}</span></span></div>`,
      )}</div>`
    : empty('moon', t('sleep.none'))
}`;
  },
});
