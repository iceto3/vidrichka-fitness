/**
 * Monthly "Wrapped": swipeable cards (scroll-snap) with the month's highlights and a
 * share card at the end.
 * @module features/motivation/views/recap
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtKg, fmtNum, fmtVolume, t } from '../../../core/i18n.js';
import { all, kv, setKv } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { otter, otterName } from '../../mascot/api.js';
import { otterSvg } from '../../mascot/otter.js';
import { exName } from '../../library/api.js';
import { shareCard, shareFile } from '../../../ui/share.js';
import { monthRecap } from '../recap.js';

/** @param {{month: string}} p @returns {import('../../../core/registry.js').View} */
export default ({ month }) => {
  const r = monthRecap(month, {
    sessions: all('sessions'),
    food: all('food'),
    measurements: all('measurements'),
    badges: kv('badges', {}),
    days: all('days'),
  });
  const name = fmtDate(new Date(`${month}-15T12:00`), { month: 'long', year: 'numeric' });
  if (kv('recapSeen', '') < month) setKv('recapSeen', month);
  const card = (/** @type {string} */ cls, /** @type {any} */ body) =>
    html`<section class="wr ${cls}">${body}</section>`;
  const big = (/** @type {string|number} */ n, /** @type {string} */ lbl) =>
    html`<div class="wrbig num">${n}</div><div class="wrl">${lbl}</div>`;
  return {
    hideNav: true,
    render: () => html`<div class="wrapped">
<button class="iconbtn wrclose" data-back aria-label="${t('common.close')}">${ic('close', 22)}</button>
${card('c1', html`<div class="wrk">${t('recap.kicker')}</div><h1 class="wrh">${name}</h1>${otter({ size: 190, pose: 'cheer', mood: 'excited' })}<p class="wrp">${t('recap.intro', { otter: otterName() })}</p><div class="wrhint">${ic('down', 20, 2.6)}</div>`)}
${card('c2', html`${big(r.workouts, t('recap.workouts'))}<p class="wrp">${t('recap.days', { n: r.days, min: r.minutes })}</p>`)}
${card('c3', html`${big(fmtVolume(r.volume).text, t('recap.lifted'))}<p class="wrp">${t('recap.liftedSub', { sets: r.sets, kcal: r.kcalBurned })}</p>${r.topExercise ? html`<div class="wrchip">${ic('star', 16, 2.4)}${t('recap.top', { ex: exName(r.topExercise.exId), n: r.topExercise.times })}</div>` : ''}`)}
${card('c4', html`${big(r.prs.length, t('recap.prs'))}<div class="wrlist">${r.prs.slice(0, 4).map((p) => html`<div>${ic('trophy', 16, 2.4)} ${exName(p.exId)} · <b class="num">${p.w ? `${fmtKg(p.w)} × ${p.r}` : `× ${p.r}`}</b></div>`)}</div>${r.prs.length ? '' : html`<p class="wrp">${t('recap.noPrs')}</p>`}`)}
${card('c5', html`${big(r.foodDays, t('recap.foodDays'))}<p class="wrp">${r.avgKcal ? t('recap.avgKcal', { kcal: r.avgKcal }) : t('recap.noFood')}</p>${r.weightDelta != null ? html`<div class="wrchip">${ic('scale', 16, 2.4)}${t('recap.weight', { d: `${r.weightDelta > 0 ? '+' : ''}${r.weightDelta}` })}</div>` : ''}`)}
${
  r.stepDays || r.sleepNights || r.avgMood != null
    ? card(
        'c7',
        html`${big(fmtNum(r.avgSteps), t('recap.avgSteps'))}<p class="wrp">${t('recap.stepsSub', { n: r.stepDays, best: fmtNum(r.bestSteps), total: fmtNum(r.stepsTotal) })}</p>
<div class="wrlist">${r.avgSleep != null ? html`<div>🌙 ${t('recap.sleep', { h: fmtNum(r.avgSleep, 1), n: r.sleepNights })}</div>` : ''}${r.avgMood != null ? html`<div>🙂 ${t('recap.mood', { m: fmtNum(r.avgMood, 1) })}</div>` : ''}${r.avgWater != null ? html`<div>💧 ${t('recap.water', { n: fmtNum(r.avgWater, 1) })}</div>` : ''}</div>`,
      )
    : ''
}
${card(
  'c6',
  html`${big(r.badges.length, t('recap.badges'))}<div class="wrlist">${r.badges.map((b) => html`<div>🏅 ${t(`badge.${b}`)}</div>`)}</div>
<button class="btn wrshare mt16" data-act="share">${ic('share', 18, 2.4)}${t('recap.share')}</button>`,
)}
</div>`,
    actions: {
      share: async () => {
        const blob = await shareCard({
          title: name,
          sub: t('recap.cardSub'),
          otterSvg: otterSvg({ size: 420, pose: 'cheer', mood: 'excited', gear: ['headband'] }),
          stats: [
            [t('recap.workouts'), String(r.workouts)],
            [t('recap.lifted'), fmtVolume(r.volume).text],
            [t('recap.prs'), String(r.prs.length)],
            [t('summary.time'), `${r.minutes}′`],
            [t('recap.foodDays'), String(r.foodDays)],
            [t('recap.badges'), String(r.badges.length)],
          ],
          footer: 'Vidrichka Fitness',
        });
        if ((await shareFile(blob, `vidrichka-${month}.png`)) === 'downloaded')
          emit('toast', { key: 'common.downloaded' });
        return false;
      },
    },
  };
};
