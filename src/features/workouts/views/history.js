/**
 * Read-only detail of a past workout (opened from Progress › Calendar or Workouts › Recent):
 * stats, records and every exercise's sets, plus delete. Unlike the summary right after a
 * workout, there is no confetti or "Saved" celebration, and the tab it was opened from
 * stays highlighted.
 * @module features/workouts/views/history
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, fmtVolume, t } from '../../../core/i18n.js';
import { durationMin } from '../../../core/dates.js';
import { get } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { topBar } from '../../../ui/components.js';
import { confirmDialog, snack } from '../../../ui/sheet.js';
import { restore } from '../../../core/trash.js';
import { exById, exName } from '../../library/api.js';
import { planName } from '../api.js';
import { deleteSession } from '../session.js';

/** One set as text: "40 kg × 10" or "12 reps". @param {{w: number, r: number}} x @param {boolean} weighted */
export const setText = (x, weighted) =>
  weighted ? `${fmtNum(x.w, x.w % 1 ? 2 : 0)} kg × ${x.r}` : t('summary.repsN', { n: x.r });

/**
 * @param {{id: string, tab?: 'progress'|'workouts'}} p
 * @returns {import('../../../core/registry.js').View}
 */
export default ({ id, tab = 'progress' }) => {
  const backTo = tab === 'workouts' ? 'workouts' : 'progress/calendar';
  return {
    tab,
    render: () => {
      const s = get('sessions', id);
      if (!s)
        return html`<div class="content">${topBar(t('history.title'))}<p class="b mt16">${t('summary.missing')}</p></div>`;
      const tiles = [
        ['clock', t('summary.time'), html`${durationMin(s.durationSec)} <small>${t('unit.min')}</small>`],
        ['check', t('summary.sets'), html`${s.setsDone} <small>${t('summary.of', { n: s.setsPlanned })}</small>`],
        ['bolt', t('summary.reps'), html`${s.reps}`],
        [
          'dumbbell',
          t('summary.volume'),
          html`${fmtVolume(s.volume).value} <small>${fmtVolume(s.volume).unit}</small>`,
        ],
        ['flame', t('summary.kcal'), html`~${s.kcal} <small>kcal</small>`],
        ['star', t('summary.xp'), html`<span class="gold">+${s.xp}</span>`],
      ];
      return html`<div class="content history">${topBar(planName(s), fmtDate(s.endedAt, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }))}
${s.partial ? html`<div class="card mt12 partialnote"><span class="chip warm chip-sm">${t('summary.partial')}</span><p class="muted xs b mt6">${t('summary.partialNote')}</p></div>` : ''}
<div class="grid3 mt12">${tiles.map(([i, l, v]) => html`<div class="stat"><div class="l">${ic(String(i), 15, 2.3)}${l}</div><div class="v num">${v}</div></div>`)}</div>
${(s.prs ?? []).map(
  (/** @type {any} */ p) =>
    html`<div class="card pr-card mt12 row gap12"><div class="trophy">${ic('trophy', 22, 2.2)}</div><div class="f1"><div class="xs xb caps prt">${t('summary.newRecord')}</div><div class="b">${exName(p.exId)} · ${setText(p, !!p.w)}</div></div></div>`,
)}
<div class="section-title"><h2 class="h3">${t('history.exercises')}</h2></div>
<div class="col gap10">${s.items.map((/** @type {any} */ it) => {
        const weighted = exById(it.exId)?.weighted ?? true;
        return html`<div class="card hex"><div class="b">${exName(it.exId)}</div>
<ol class="hsets mt6">${it.sets.map(
          (/** @type {any} */ x, /** @type {number} */ j) =>
            html`<li class="row between small b${x.done ? '' : ' muted'}"><span>${t('workout.setN', { n: j + 1 })}</span><span class="num">${x.done ? setText(x, weighted) : t('history.notDone')}</span></li>`,
        )}</ol></div>`;
      })}</div>
<button class="btn sec danger w100 mt20" data-act="del">${ic('trash', 18, 2.2)}${t('history.delete')}</button>
</div>`;
    },
    actions: {
      del: async () => {
        const ok = await confirmDialog({
          title: t('history.deleteTitle'),
          body: t('history.deleteBody'),
          ok: t('common.delete'),
          danger: true,
        });
        const tid = ok && deleteSession(id);
        if (!tid) return false;
        snack(t('history.deleted'), () => restore(tid));
        emit('nav', { path: backTo, replace: true });
        return false;
      },
    },
  };
};
