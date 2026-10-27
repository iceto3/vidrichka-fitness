/**
 * One-time notice (1.3.4) that manually entered foods are shared anonymously, shown on the
 * first start after the update (after "What's new" / the welcome) with an OK button.
 * @module features/improve/notice
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { kv, setKv } from '../../core/store.js';
import { settings } from '../../core/settings.js';
import { ic } from '../../ui/icons.js';
import { openSheet } from '../../ui/sheet.js';

/** Show the notice unless it was seen (or sharing is already off). @returns {boolean} shown */
export function dataNotice() {
  if (kv('dataNotice', false)) return false;
  setKv('dataNotice', true);
  if (!settings().shareFoods) return false;
  openSheet({
    kind: 'dialog',
    render: () => html`<div class="center datanotice"><span class="sq acc">${ic('chart', 22, 2.3)}</span>
<h2 class="h3 xb mt8">${t('improve.noticeTitle')}</h2><p class="small b mt8 lh">${t('improve.notice')}</p></div>
<button class="btn w100 mt16" data-close>${t('common.ok')}</button>`,
  });
  return true;
}
