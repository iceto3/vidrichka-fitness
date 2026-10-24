/**
 * Progress screen shell: title, share button and the segmented sub-tabs registered in
 * `registry.progressTabs` (Lifts, Body, Calendar, … — features add their own).
 * @module features/progress/views/shell
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { emit } from '../../../core/bus.js';
import { registry } from '../../../core/registry.js';
import { ic } from '../../../ui/icons.js';
import { seg } from '../../../ui/components.js';

/**
 * @param {string} id Active sub-tab id.
 * @param {import('../../../core/registry.js').View} inner Sub-tab view.
 * @returns {import('../../../core/registry.js').View}
 */
export default (id, inner) => ({
  tab: 'progress',
  render: () => html`<div class="content progress">
<div class="row between"><h1 class="h1">${t('progress.title')}</h1><button class="iconbtn" data-act="share" aria-label="${t('partner.share')}">${ic('share', 20)}</button></div>
<div class="mt12">${seg(
    registry.progressTabs.map((p) => ({ value: p.id, label: t(p.label) })),
    id,
    'ptab',
  )}</div>
${inner.render()}</div>`,
  mount: (el) => inner.mount?.(el),
  unmount: () => inner.unmount?.(),
  actions: {
    ...inner.actions,
    ptab: (el) => (emit('nav', { path: `progress/${el.dataset.v}`, replace: true }), false),
    share: async () => {
      const { openShare } = await import('../../partner/api.js');
      openShare();
      return false;
    },
  },
});
