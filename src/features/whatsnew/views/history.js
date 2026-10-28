/**
 * Profile › What's new (1.4.0): every release's notes, newest first, plus the exact build
 * (version + content hash read from the installed service worker), so a tester or the
 * user can always find what changed and which build they run.
 * @module features/whatsnew/views/history
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { topBar } from '../../../ui/components.js';
import { APP_VERSION } from '../../../core/version.js';
import { IS_BETA } from '../../../core/channel.js';
import { pushUrl } from '../../daily/push-config.js';
import { voiceUrl } from '../../voice/config.js';
import { allNotes } from '../notes.js';

/** The full build id written into index.html by the build (e.g. 1.4.0-beta-<hash>); the app version in dev. */
function buildId() {
  if (typeof document === 'undefined') return APP_VERSION;
  return document.querySelector('meta[name="vf-build"]')?.getAttribute('content') || APP_VERSION;
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'profile',
  render: () => {
    const notes = allNotes({ voice: !!voiceUrl(), push: !!pushUrl() }, APP_VERSION);
    return html`<div class="content whatsnewpage">${topBar(t('whatsNew.page'), `v${APP_VERSION}${IS_BETA ? ' · БЕТА' : ''}`)}
${notes.map(
  (
    r,
    i,
  ) => html`<section class="card mt12" aria-labelledby="wn${i}"><h2 class="h3" id="wn${i}">${t('whatsNew.version', { v: r.v })}${i === 0 ? html` <span class="wnlatest">${t('whatsNew.latest')}</span>` : ''}</h2>
<div class="col gap10 mt10">${r.items.map(([icon, k]) => html`<div class="row gap10"><span class="sq acc">${ic(icon, 18, 2.3)}</span><span class="f1 b small">${t(k)}</span></div>`)}</div></section>`,
)}
<p class="muted xs b center mt16" id="buildid">${t('whatsNew.build', { id: buildId() })}</p><div class="h24"></div></div>`;
  },
});
