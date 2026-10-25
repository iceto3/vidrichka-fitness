/**
 * "Recently deleted": everything deleted in the last 7 days, newest first, with Restore
 * (rows come back unchanged) and Delete for good.
 * @module features/trash/views/trash
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtHM, t } from '../../../core/i18n.js';
import { dayKey, hhmm } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { empty, topBar } from '../../../ui/components.js';
import { confirmDialog } from '../../../ui/sheet.js';
import { KEEP_DAYS, daysLeft, forget, restore, trashList } from '../../../core/trash.js';

/** "Today 14:05" / "21 Oct 14:05". @param {number} ts */
const when = (ts) => {
  const d = new Date(ts);
  return `${dayKey(d) === dayKey() ? t('common.today') : fmtDate(d, { day: 'numeric', month: 'short' })} ${fmtHM(hhmm(d))}`;
};

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'profile',
  render: () => {
    const list = trashList();
    return html`<div class="content trash">${topBar(t('trash.title'), t('trash.sub', { n: KEEP_DAYS }))}
${
  list.length
    ? html`<div class="card p0 mt12 list trashlist">${list.map(
        (e) => html`<div class="lrow trow"><span class="fic">${e.emoji ?? '🗑️'}</span>
<span class="f1 minw0"><span class="b block ellip">${e.label}</span><span class="muted xs b block">${t(`trash.kind.${e.kind}`)}${e.sub ? ` · ${e.sub}` : ''}</span>
<span class="muted xs b block">${t('trash.deletedAt', { when: when(e.ts) })} · ${t('trash.daysLeft', { n: daysLeft(e) })}</span></span>
<button class="btn sm" data-act="restore" data-id="${e.id}">${ic('undo', 16, 2.4)}${t('trash.restore')}</button>
<button class="iconbtn flat sm" data-act="forget" data-id="${e.id}" aria-label="${t('trash.forget')}: ${e.label}">${ic('close', 16, 2.4)}</button></div>`,
      )}</div>`
    : html`<div class="mt16">${empty('trash', t('trash.empty'))}</div>`
}</div>`;
  },
  actions: {
    restore: (el) => {
      const e = trashList().find((x) => x.id === el.dataset.id);
      if (e && restore(e.id)) emit('toast', { text: t('trash.restored', { name: e.label }) });
    },
    forget: async (el) => {
      const id = el.dataset.id ?? '';
      if (
        await confirmDialog({
          title: t('trash.forgetQ'),
          body: t('trash.forgetBody'),
          ok: t('common.delete'),
          danger: true,
        })
      )
        forget(id);
    },
  },
});
