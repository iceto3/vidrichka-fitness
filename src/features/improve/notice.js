/**
 * Notice that manually entered foods are shared anonymously. 1.3.4 showed a blocking dialog;
 * since 1.4.0 it is a small card on Home (see {@link noticeCard}) that never blocks the app,
 * says exactly what is sent and links to the switch in Profile.
 * @module features/improve/notice
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { kv, setKv } from '../../core/store.js';
import { settings } from '../../core/settings.js';
import { ic } from '../../ui/icons.js';

/** Queue the notice once (first start after the update). @returns {boolean} queued */
export function dataNotice() {
  if (kv('dataNotice', false)) return false;
  setKv('dataNotice', settings().shareFoods ? 'pending' : true);
  return false; // never opens anything: the start-up chain goes on
}

/** The Home card while the notice is pending and sharing is on, else ''. */
export const noticeCard = () =>
  kv('dataNotice', /** @type {boolean|string} */ (false)) === 'pending' && settings().shareFoods
    ? html`<div class="card mt12 row gap12 datanotice" role="note"><span class="sq acc">${ic('chart', 20, 2.2)}</span>
<span class="f1"><span class="b block">${t('improve.noticeTitle')}</span><span class="muted xs b lh">${t('improve.notice')}</span>
<span class="row gap8 mt8"><button class="btn sm" data-act="noticeOk">${t('common.ok')}</button><button class="btn sm sec" data-act="noticeSettings">${t('improve.noticeSettings')}</button></span></span></div>`
    : '';

/** Home actions of the card. @param {(path: string) => void} nav */
export const noticeActions = (nav) => ({
  noticeOk: () => void setKv('dataNotice', true),
  noticeSettings: () => {
    setKv('dataNotice', true);
    nav('profile?sharefoods');
    return false;
  },
});
