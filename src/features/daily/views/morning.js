/**
 * #morning — full-screen "Good morning" page. Opening it (from either morning
 * notification, the Home card or a protein reminder) records the wake-up once and starts
 * the 30-min protein countdown; the countdown is computed from the stored start time, so
 * it survives reloads. The ring/clock tick with targeted DOM updates (no re-render).
 * @module features/daily/views/morning
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { dailySettings, settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { clock } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { rig } from '../../mascot/api.js';
import { PROTEIN_WINDOW, MIN } from '../logic.js';
import { closeNotifications } from '../notify.js';
import { BREAKFAST_LOGGER, day, isMorning, lastNight, proteinState, proteinYes, sleepHours, wakeUp } from '../api.js';

const R = 92,
  C = 2 * Math.PI * R;
const hm = (/** @type {number} */ ts) => fmtDate(ts, { hour: '2-digit', minute: '2-digit' });

/** Countdown ring (the arc and clock are updated in place every second). @param {number} left ms */
const countdown = (left) => {
  const p = left / (PROTEIN_WINDOW * MIN);
  return html`<div class="pring" role="timer" aria-label="${t('morning.left')}">
<svg viewBox="0 0 200 200" aria-hidden="true"><circle cx="100" cy="100" r="${R}" class="trk"/><circle cx="100" cy="100" r="${R}" class="arc" stroke-dasharray="${C * p} ${C}"/></svg>
<div class="pin"><div class="pclock num">${clock(Math.ceil(left / 1000))}</div><div class="xs b muted">${t('morning.left')}</div></div></div>`;
};

function proteinCard() {
  const rec = day(),
    ps = proteinState(rec, Date.now());
  if (!dailySettings().protein) return '';
  if (ps.state === 'done')
    return html`<div class="pcard done"><span class="sq green">${ic('check', 22, 3)}</span><div class="f1"><div class="b">${t('morning.proteinDone')}</div>
<div class="muted xs b">${ps.onTime ? t('morning.onTime', { time: hm(rec.proteinAt) }) : t('morning.late', { time: hm(rec.proteinAt) })}</div></div></div>`;
  if (ps.state === 'skipped')
    return html`<div class="pcard done"><span class="sq">${ic('skip', 22, 2.6)}</span><div class="f1 b">${t('home.proteinSkipped')}</div></div>`;
  if (ps.state === 'idle') return '';
  return html`<div class="pcard">
${ps.state === 'running' ? countdown(ps.left) : html`<div class="b center">${t('morning.stillCounts')}</div>`}
<div class="h3 xb center mt8">${t('morning.proteinQ')}</div>
<button class="btn big w100 mt12 yes" data-act="yes">${ic('check', 22, 3)}${t('morning.yes')}</button></div>`;
}

/** @returns {import('../../../core/registry.js').View} */
export default () => {
  /** @type {number|undefined} */
  let timer;
  let last = '';
  return {
    hideNav: true,
    render: () => {
      const rec = day(),
        name = settings().userName,
        night = lastNight(),
        hrs = sleepHours(night.bed, rec.wake);
      return html`<div class="content morning">
<div class="row between"><span></span><button class="iconbtn flat" data-go="home" aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<div class="sun" aria-hidden="true"></div>
<div class="center motter">${raw(rig({ w: 150, armR: -40 }))}</div>
<h1 class="h1 center">${t('morning.title')}${name ? `, ${name}` : ''}!</h1>
${
  rec.wake
    ? html`<p class="center muted b mt6">${t('morning.wokeAt', { time: hm(rec.wake) })}${hrs != null ? html` · ${t('morning.slept', { h: fmtNum(hrs, 1) })}${night.bedEst ? html` <span class="chip chip-sm">${t('sleep.estimated')}</span>` : ''}` : ''}</p>`
    : html`<button class="btn big w100 mt16" data-act="wake">${ic('sun', 20, 2.4)}${t('morning.justWoke')}</button>`
}
${proteinCard()}
</div>`;
    },
    mount: (el) => {
      if (isMorning(Date.now()) && wakeUp()) emit('ui:refresh');
      closeNotifications(['morning']);
      timer = window.setInterval(() => {
        const ps = proteinState(day(), Date.now());
        if (ps.state !== last && last) emit('ui:refresh');
        last = ps.state;
        if (ps.state !== 'running') return;
        const clk = el.querySelector('.pclock'),
          arc = el.querySelector('.pring .arc');
        if (clk) clk.textContent = clock(Math.ceil(ps.left / 1000));
        arc?.setAttribute('stroke-dasharray', `${(C * ps.left) / (PROTEIN_WINDOW * MIN)} ${C}`);
      }, 1000);
    },
    unmount: () => clearInterval(timer),
    actions: {
      wake: () => void wakeUp(),
      yes: () => {
        proteinYes();
        closeNotifications(['protein']);
        emit('nav', { path: BREAKFAST_LOGGER }); // what did she eat? (optional)
        return false;
      },
    },
  };
};
