/**
 * Check-ins: #checkin/morning (11:00 — how she feels + how she slept, two taps, plus a
 * one-tap fix for last night's bedtime) and #checkin/evening (19:30 — energy, one tap).
 * @module features/daily/views/checkin
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { topBar } from '../../../ui/components.js';
import { MIN, at } from '../logic.js';
import { closeNotifications } from '../notify.js';
import { checkinEvening, checkinMorning, day, lastNight, setLastBedtime } from '../api.js';

export const FACES = ['😫', '😕', '😐', '🙂', '🤩'];

/** A 1–5 row of big emoji buttons. @param {string} field @param {number|undefined} v @param {string} label */
export const scale = (field, v, label) =>
  html`<div class="scale" role="radiogroup" aria-label="${label}">${FACES.map(
    (f, i) =>
      html`<button class="${v === i + 1 ? 'on' : ''}" role="radio" aria-checked="${String(v === i + 1)}" data-act="rate" data-f="${field}" data-v="${i + 1}" aria-label="${i + 1}/5">${f}</button>`,
  )}</div>`;

const hm = (/** @type {number} */ ts) => fmtDate(ts, { hour: '2-digit', minute: '2-digit' });

/** Bedtime choices around the known/estimated one (or 22:00–00:30). */
function bedChoices() {
  const n = lastNight();
  if (n.bed) return [-60, -30, 0, 30, 60].map((d) => n.bed + d * MIN);
  return ['22:00', '22:30', '23:00', '23:30', '00:00', '00:30'].map((x) => at(n.id, x, x < '12' ? 1 : 0));
}

/** @param {string} kind morning | evening @returns {import('../../../core/registry.js').View} */
export default (kind) => ({
  render: () => {
    const r = day();
    if (kind === 'evening')
      return html`<div class="content checkin">${topBar(t('checkin.eveningTitle'))}
<div class="card mt12 pad16"><h2 class="h3 xb">${t('checkin.energy')}</h2>${scale('energy', r.energy, t('checkin.energy'))}</div>
${r.energy ? html`<p class="center b mt16">${t('checkin.thanks')}</p><button class="btn w100 mt12" data-go="home">${t('common.done')}</button>` : ''}</div>`;
    const n = lastNight();
    return html`<div class="content checkin">${topBar(t('checkin.morningTitle'))}
<div class="card mt12 pad16"><h2 class="h3 xb">${t('checkin.feel')}</h2>${scale('mood', r.mood, t('checkin.feel'))}</div>
<div class="card mt12 pad16"><h2 class="h3 xb">${t('checkin.sleep')}</h2>${scale('sleepQ', r.sleepQ, t('checkin.sleep'))}</div>
<div class="card mt12 pad16 bedfix"><div class="row between"><h2 class="h3 xb">${t('checkin.bedtime')}</h2>
${n.bed ? html`<span class="chip chip-sm${n.bedEst ? ' warm' : ' ok'}">${n.bedEst ? t('sleep.estimated') : ic('check', 13, 3)}</span>` : ''}</div>
<p class="muted xs b mt4">${n.bed ? t('checkin.bedtimeKnown', { time: hm(n.bed) }) : t('checkin.bedtimeUnknown')}</p>
<div class="chips mt8">${bedChoices().map(
      (ts) =>
        html`<button class="chip${n.bed === ts && !n.bedEst ? ' on' : ''}" data-act="bed" data-ts="${ts}">${hm(ts)}</button>`,
    )}</div></div>
${r.mood && r.sleepQ ? html`<button class="btn w100 mt16" data-go="home">${t('common.done')}</button>` : ''}</div>`;
  },
  mount: () => closeNotifications([kind === 'evening' ? 'checkinPm' : 'checkinAm']),
  actions: {
    rate: (el) => {
      const v = Number(el.dataset.v),
        f = el.dataset.f ?? '';
      if (f === 'energy') checkinEvening(v);
      else checkinMorning({ [f]: v });
    },
    bed: (el) => void setLastBedtime(Number(el.dataset.ts)),
  },
});
