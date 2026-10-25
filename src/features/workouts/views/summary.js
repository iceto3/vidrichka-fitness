/**
 * Workout summary: otter celebration, stats (time, sets, reps, volume, kcal, XP),
 * personal records, confetti and a shareable PNG card.
 * @module features/workouts/views/summary
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { get } from '../../../core/store.js';
import { durationMin } from '../../../core/dates.js';
import { settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { confetti } from '../../../ui/confetti.js';
import { shareCard, shareFile } from '../../../ui/share.js';
import { exName } from '../../library/api.js';
import { otter, otterSvg } from '../../mascot/api.js';
import { planName } from '../api.js';

/** @param {any} s */
const statTiles = (s) => [
  ['clock', t('summary.time'), html`${durationMin(s.durationSec)} <small>${t('unit.min')}</small>`],
  ['check', t('summary.sets'), html`${s.setsDone} <small>${t('summary.of', { n: s.setsPlanned })}</small>`],
  ['bolt', t('summary.reps'), html`${s.reps}`],
  ['dumbbell', t('summary.volume'), html`${fmtNum(s.volume)} <small>kg</small>`],
  ['flame', t('summary.kcal'), html`~${s.kcal} <small>kcal</small>`],
  ['star', t('summary.xp'), html`<span class="gold">+${s.xp}</span>`],
];

/** @param {{id: string}} p @returns {import('../../../core/registry.js').View} */
export default ({ id }) => ({
  tab: 'workouts',
  render: () => {
    const s = get('sessions', id);
    if (!s)
      return html`<div class="content"><button class="iconbtn" data-go="home" aria-label="${t('common.close')}">${ic('close', 20)}</button><p class="b mt16">${t('summary.missing')}</p></div>`;
    const name = settings().userName;
    return html`${confetti()}<div class="content summary">
<div class="row between"><button class="iconbtn" data-go="home" aria-label="${t('common.close')}">${ic('close', 20)}</button><span class="chip ${s.partial ? 'warm' : 'accent'}">${ic('check', 14, 3)}${s.partial ? t('summary.partial') : t('summary.saved')}</span></div>
<div class="hero-otter">${otter({ size: 180, pose: 'cheer', mood: 'excited' })}</div>
<div class="center"><h1 class="h1 big">${name ? t('summary.greatJobName', { name }) : t('summary.greatJob')}</h1>
<div class="muted b mt6">${t('summary.complete', { plan: planName(s) })} · ${fmtDate(s.endedAt, { weekday: 'short', day: 'numeric', month: 'short' })}</div></div>
<div class="grid3 mt20">${statTiles(s).map(([i, l, v]) => html`<div class="stat"><div class="l">${ic(String(i), 15, 2.3)}${l}</div><div class="v num">${v}</div></div>`)}</div>
${s.prs.map(
  (
    /** @type {any} */ p,
  ) => html`<div class="card pr-card mt12 row gap12"><div class="trophy">${ic('trophy', 26, 2.2)}</div>
<div class="f1"><div class="xs xb caps prt">${t('summary.newRecord')}</div><div class="h3 xb">${exName(p.exId)} · ${p.w ? `${p.w} kg × ${p.r}` : t('summary.repsN', { n: p.r })}</div>
<div class="small b prsub">${p.w ? t('summary.prevBest', { prev: `${p.prevW} kg`, diff: `+${Math.round((p.w - p.prevW) * 100) / 100 || 0} kg` }) : t('summary.prevBest', { prev: p.prevR, diff: `+${p.r - p.prevR}` })}</div></div></div>`,
)}
${s.partial ? html`<p class="muted xs b mt12 center partialnote">${t('summary.partialNote')}</p>` : ''}
<p class="muted xs mt8 center">${t('summary.kcalNote')}</p>
<div class="row gap10 mt20"><button class="btn sec f1" data-act="share">${ic('share', 19, 2.2)}${t('common.share')}</button><button class="btn f14" data-go="home">${t('workout.done')}</button></div>
</div>`;
  },
  actions: {
    share: async () => {
      const s = get('sessions', id);
      const blob = await shareCard({
        title: t('summary.complete', { plan: planName(s) }),
        sub: fmtDate(s.endedAt, { weekday: 'long', day: 'numeric', month: 'long' }),
        otterSvg: otterSvg({ size: 420, pose: 'cheer', mood: 'excited', gear: ['headband'] }),
        stats: [
          [t('summary.time'), `${durationMin(s.durationSec)} ${t('unit.min')}`],
          [t('summary.sets'), String(s.setsDone)],
          [t('summary.reps'), String(s.reps)],
          [t('summary.volume'), `${fmtNum(s.volume)} kg`],
          [t('summary.kcal'), `~${s.kcal}`],
          ['XP', `+${s.xp}`],
        ],
        highlight: s.prs[0]
          ? `🏆 ${exName(s.prs[0].exId)} ${s.prs[0].w ? `${s.prs[0].w} kg × ${s.prs[0].r}` : `× ${s.prs[0].r}`}`
          : '',
        footer: 'Vidrichka Fitness',
      });
      const r = await shareFile(blob, `workout-${s.id}.png`, t('summary.shareText', { plan: planName(s) }));
      if (r === 'downloaded') emit('toast', { key: 'common.downloaded' });
      return false;
    },
  },
});
