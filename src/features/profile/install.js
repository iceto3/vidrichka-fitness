/**
 * Install help: uses `beforeinstallprompt` on Android/desktop Chrome; on iPhone/iPad
 * (no prompt API) shows Share → "Add to Home Screen" instructions.
 * @module features/profile/install
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { ic } from '../../ui/icons.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { emit } from '../../core/bus.js';

/** @type {any} */
let deferred = null;
addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferred = e;
  emit('ui:refresh');
});
addEventListener('appinstalled', () => ((deferred = null), emit('ui:refresh')));

/** Running as an installed app? */
export const isStandalone = () =>
  matchMedia('(display-mode: standalone)').matches || /** @type {any} */ (navigator).standalone === true;

/** iPhone / iPad (incl. iPadOS reporting as Mac). */
export const isIOS = () =>
  /iphone|ipad|ipod/i.test(navigator.userAgent) ||
  (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);

/** Whether we can offer installing at all. */
export const canInstall = () => !isStandalone() && (!!deferred || isIOS());

/** Show the native prompt or the iOS instructions. */
export async function installApp() {
  if (deferred) {
    deferred.prompt();
    await deferred.userChoice.catch(() => null);
    deferred = null;
    return;
  }
  openSheet({
    render: () => html`<h2 class="h2">${t('install.title')}</h2>
${
  isIOS()
    ? html`<ol class="steps-list mt12">
<li><span class="sic acc">${ic('share', 20, 2.2)}</span><span>${t('install.ios1')}</span></li>
<li><span class="sic acc">${ic('plus', 20, 2.4)}</span><span>${t('install.ios2')}</span></li>
<li><span class="sic acc">${ic('check', 20, 2.6)}</span><span>${t('install.ios3')}</span></li></ol>
<p class="muted small b mt12">${t('install.iosNote')}</p>`
    : html`<p class="b mt12">${t('install.other')}</p>`
}
<button class="btn w100 mt16" data-act="ok">${t('common.ok')}</button>`,
    actions: { ok: () => (closeSheet(), false) },
  });
}
