/**
 * #goodnight — the bedtime ritual. "Goodnight, Vidrichka" records the bedtime; the otter
 * yawns, curls up under her blanket and Zzz float up. Opened from the Home moon button
 * (which already recorded the bedtime) or the 22:30 nudge.
 * @module features/daily/views/goodnight
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, t } from '../../../core/i18n.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { otterName, rig, sleepingOtter } from '../../mascot/api.js';
import { closeNotifications } from '../notify.js';
import { GOODNIGHT_XP, day, eveningKey, goodnight, sleepRun, tuckedIn, undoGoodnight } from '../api.js';

/** Bedtime recorded just now (play the hand-over animation)? */
const fresh = () => Date.now() - (day(eveningKey(Date.now())).bed ?? 0) < 4000;
const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Yawn, then cross-fade to the sleeping otter with the blanket sliding up. @param {HTMLElement} el */
function play(el) {
  const awake = el.querySelector('.gn-awake'),
    asleep = el.querySelector('.gn-asleep');
  if (!awake || !asleep || reduce()) return;
  const o = { fill: /** @type {const} */ ('both'), easing: 'ease-in-out' };
  awake.querySelector('.o-smile')?.animate([{ opacity: 1 }, { opacity: 0 }], { ...o, duration: 200 });
  awake.querySelector('.o-yawn')?.animate(
    [
      { opacity: 0, transform: 'scale(.3)' },
      { opacity: 1, transform: 'scale(1.15)', offset: 0.5 },
      { opacity: 1, transform: 'scale(.9)' },
    ],
    { ...o, duration: 1100 },
  );
  awake
    .querySelector('.o-head')
    ?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-8deg)' }, { transform: 'rotate(0)' }], {
      ...o,
      duration: 1100,
    });
  awake
    .querySelector('.o-armL')
    ?.animate([{ transform: 'rotate(0)' }, { transform: 'rotate(-120deg)' }, { transform: 'rotate(0)' }], {
      ...o,
      duration: 1100,
    });
  awake.animate([{ opacity: 1 }, { opacity: 0, transform: 'translateY(16px) scale(.9)' }], {
    ...o,
    duration: 450,
    delay: 1100,
  });
  asleep.animate(
    [
      { opacity: 0, transform: 'scale(.92)' },
      { opacity: 1, transform: 'none' },
    ],
    { ...o, duration: 500, delay: 1300 },
  );
  asleep.querySelector('.o-blanket')?.animate(
    [
      { transform: 'translateY(60px)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    { ...o, duration: 700, delay: 1700, easing: 'cubic-bezier(.2,.9,.3,1.2)' },
  );
  el.querySelectorAll('.gn-after').forEach((n, i) =>
    n.animate(
      [
        { opacity: 0, transform: 'translateY(8px)' },
        { opacity: 1, transform: 'none' },
      ],
      { ...o, duration: 400, delay: 2200 + i * 120 },
    ),
  );
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  hideNav: true,
  render: () => {
    const done = tuckedIn(),
      rec = day(eveningKey(Date.now())),
      n = sleepRun(),
      awake = !done || (fresh() && !reduce()); // keep the awake otter for the yawn → sleep hand-over
    return html`<div class="content goodnight${done ? ' asleep' : ''}">
<div class="stars" aria-hidden="true"></div>
<div class="row between rel"><span></span><button class="iconbtn flat" data-go="home" aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<div class="gn-stage rel">
 <div class="gn-awake"${awake ? '' : raw(' hidden')}>${raw(rig({ w: 170, mood: 'sleepy' }))}</div>
 <div class="gn-asleep"${done ? '' : raw(' hidden')}>${raw(sleepingOtter({ w: 260, title: otterName() }))}<div class="zzz" aria-hidden="true"><i>z</i><i>z</i><i>Z</i></div></div>
</div>
${
  done
    ? html`<h1 class="h1 center rel gn-after">${t('goodnight.sleepTight')}</h1>
<p class="center b rel gn-after mt6">${t('goodnight.bedAt', { time: fmtDate(rec.bed, { hour: '2-digit', minute: '2-digit' }) })}</p>
<div class="row gap8 center-row mt12 rel gn-after"><span class="chip">🌙 ${t('goodnight.streak', { n })}</span><span class="chip">+${GOODNIGHT_XP} XP</span></div>
<button class="btn sec w100 mt24 rel gn-after" data-go="home">${t('goodnight.close')}</button>
<button class="linkbtn w100 mt8 rel gn-after" data-act="undo">${t('goodnight.undo')}</button>`
    : html`<h1 class="h1 center rel">${t('goodnight.sleepy', { otter: otterName() })}</h1>
<p class="center b rel mt6 dim">${t('goodnight.hint')}</p>
<button class="btn big w100 mt24 rel moonbtn" data-act="tuck">${ic('moon', 22, 2.4)}${t('goodnight.cta', { otter: otterName() })}</button>`
}</div>`;
  },
  mount: (el) => {
    closeNotifications(['bed']);
    if (fresh() && tuckedIn()) play(el);
  },
  actions: {
    tuck: () => {
      goodnight();
      emit('ui:refresh');
      const root = /** @type {HTMLElement|null} */ (document.querySelector('.goodnight'));
      if (root) play(root);
      return false;
    },
    undo: () => void undoGoodnight(),
  },
});
