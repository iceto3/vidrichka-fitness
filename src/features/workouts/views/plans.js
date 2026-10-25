/**
 * Workouts tab: plan cards with one-tap Start, plan editor entry, library link and
 * recent sessions.
 * @module features/workouts/views/plans
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, t, weekdayName } from '../../../core/i18n.js';
import { weekdayMon, durationMin } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { confirmDialog } from '../../../ui/sheet.js';
import { EXERCISES } from '../../library/api.js';
import { activeWorkout, planMinutes, planName, plans, sessions, startWorkout } from '../api.js';
import { L } from '../../../core/i18n.js';

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'workouts',
  render: () => {
    const a = activeWorkout(),
      today = weekdayMon(new Date());
    return html`<div class="content">
<div class="row between"><h1 class="h1">${t('workouts.title')}</h1><button class="iconbtn" data-go="plan/new" aria-label="${t('workouts.newPlan')}">${ic('plus', 22, 2.4)}</button></div>
${a ? html`<button class="card resume mt12 row gap12" data-go="workout"><span class="live"><i></i></span><span class="f1 b">${t('home.resume', { plan: planName(a) })}</span>${ic('right', 18, 2.4)}</button>` : ''}
<h2 class="sect mt16">${t('workouts.yourPlans')}</h2>
${plans().map(
  (p) => html`<article class="card plan mt10${p.days.includes(today) ? ' today' : ''}">
<div class="row between top-al"><div><h3 class="h2">${planName(p)}</h3><div class="muted small b mt4">${L(p.sub) || ''}</div></div>
<button class="iconbtn flat" data-go="plan/${p.id}" aria-label="${t('workouts.editPlan', { plan: planName(p) })}">${ic('edit', 19)}</button></div>
<div class="row gap6 mt10 wrap">${p.days.map((d) => html`<span class="chip${d === today ? ' accent' : ''}">${weekdayName(d)}</span>`)}<span class="chip">${t(`place.${p.place}`)}</span></div>
<div class="row between mt12"><span class="muted small b">${t('workouts.meta', { n: p.items.length, min: planMinutes(p) })}</span>
<button class="btn sm" data-act="start" data-id="${p.id}">${ic('play', 16, 2.4)}${t('workouts.start')}</button></div></article>`,
)}
<button class="card row gap12 mt12 libcard" data-go="library"><span class="sic acc">${ic('list', 20, 2.2)}</span><span class="f1"><span class="b">${t('library.title')}</span><span class="muted small b block">${t('library.count', { n: EXERCISES.length })}</span></span>${ic('right', 18, 2.2, 'var(--muted)')}</button>
${
  sessions().length
    ? html`<h2 class="sect mt16">${t('workouts.recent')}</h2><div class="card list">${sessions()
        .slice(0, 5)
        .map(
          (s) => html`<button class="lrow" data-go="workouts/history/${s.id}">
<span class="f1"><span class="b">${planName(s)}</span><span class="muted xs b block">${fmtDate(s.endedAt, { weekday: 'short', day: 'numeric', month: 'short' })} · ${durationMin(s.durationSec)} ${t('unit.min')}</span></span>
<span class="muted small b">${t('workouts.setsN', { n: s.setsDone })}</span>${ic('right', 16, 2.2, 'var(--muted)')}</button>`,
        )}</div>`
    : ''
}
</div>`;
  },
  actions: {
    start: async (el) => {
      const a = activeWorkout();
      if (
        a &&
        a.planId !== el.dataset.id &&
        !(await confirmDialog({
          title: t('workouts.inProgress'),
          body: t('workouts.inProgressBody', { plan: planName(a) }),
          ok: t('workouts.resume'),
        }))
      )
        return;
      startWorkout(el.dataset.id ?? '');
      emit('nav', { path: 'workout' });
      return false;
    },
  },
});
