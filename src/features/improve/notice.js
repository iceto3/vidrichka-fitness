/**
 * Notice that manually entered foods are shared anonymously. 1.3.4 showed it as a blocking
 * dialog right after the update; since 1.4.0 it appears once, at the moment it matters: when
 * the first food is entered by hand (before anything is sent). It uses the same wording as the
 * Profile switch and offers to turn sharing off right there.
 * @module features/improve/notice
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { kv, setKv } from '../../core/store.js';
import { setSettings, settings } from '../../core/settings.js';
import { ic } from '../../ui/icons.js';
import { closeSheet, openSheet } from '../../ui/sheet.js';

const KEY = 'dataNotice';

/** Must the notice still be shown before the next manual food is shared? */
export const noticeDue = () => settings().shareFoods && kv(KEY, /** @type {boolean|string} */ (false)) !== true;

/**
 * Show the notice once (if due) and resolve when it is closed. "OK" keeps sharing on,
 * "Don't send" switches it off; closing it any other way keeps the Profile setting.
 * @returns {Promise<void>}
 */
export function confirmDataNotice() {
  if (!noticeDue()) return Promise.resolve();
  setKv(KEY, true);
  return new Promise((done) =>
    openSheet({
      kind: 'dialog',
      render: () => html`<div class="center datanotice"><span class="sq acc">${ic('chart', 22, 2.3)}</span>
<h2 class="h3 xb mt8">${t('profile.shareFoods')}</h2><p class="small b mt8 lh">${t('improve.notice')}</p></div>
<div class="row gap10 mt16"><button class="btn sec f1" data-act="off">${t('improve.noticeOff')}</button><button class="btn f1" data-close>${t('common.ok')}</button></div>`,
      actions: {
        off: () => {
          setSettings({ shareFoods: false });
          closeSheet();
          return false;
        },
      },
      onClose: () => done(),
    }),
  );
}
