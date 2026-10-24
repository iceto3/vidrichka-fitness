/**
 * Partner mode: share weekly stats as text or an image card, create a "cheer" link
 * (`?cheer=Name`) and show the cheer popup when such a link is opened.
 * @module features/partner/api
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { settings, setSettings } from '../../core/settings.js';
import { emit } from '../../core/bus.js';
import { ic } from '../../ui/icons.js';
import { openSheet, closeSheet } from '../../ui/sheet.js';
import { shareCard, shareFile, shareText } from '../../ui/share.js';
import { otter, otterName } from '../mascot/api.js';
import { stats } from '../motivation/api.js';
import { otterSvg } from '../mascot/otter.js';

/** Base URL of the app (works from any GitHub Pages subpath). */
const appUrl = () => location.href.split(/[?#]/)[0];

/** Cheer link carrying the user's name. */
export const cheerLink = () => `${appUrl()}?cheer=${encodeURIComponent(settings().userName || otterName())}`;

/** Stats summary text. */
export function statsText() {
  const s = stats(),
    name = settings().userName;
  return t('partner.text', {
    name: name || '🦦',
    week: s.streak.thisWeek,
    goal: s.streak.goal,
    streak: s.streak.weeks,
    total: s.totalWorkouts,
    kg: Math.round(s.totalKg).toLocaleString(),
    link: cheerLink(),
  });
}

/** Share stats as an image card (falls back to download). */
export async function shareStatsImage() {
  const s = stats();
  const blob = await shareCard({
    title: t('partner.cardTitle', { name: settings().userName || otterName() }),
    sub: t('partner.cardSub'),
    otterSvg: otterSvg({ size: 420, pose: 'cheer', gear: ['headband'] }),
    stats: [
      [t('partner.thisWeek'), `${s.streak.thisWeek}/${s.streak.goal}`],
      [t('profile.weekStreak'), `🔥 ${s.streak.weeks}`],
      [t('profile.workouts'), String(s.totalWorkouts)],
      [t('summary.volume'), `${Math.round(s.totalKg / 100) / 10}t`],
      [t('partner.prs'), String(s.prCount)],
      [t('home.levelShort'), String(s.level)],
    ],
    footer: 'Vidrichka Fitness',
    highlight: s.streak.weeks >= 2 ? t('partner.highlight', { n: s.streak.weeks }) : undefined,
  });
  return shareFile(blob, 'vidrichka-stats.png', t('partner.cheerAsk', { link: cheerLink() }));
}

/** Quick share sheet (used by Progress' share button). */
export function openShare() {
  openSheet({
    render:
      () => html`<h2 class="h2">${t('partner.shareTitle')}</h2><p class="muted small b mt4">${t('partner.shareSub')}</p>
<div class="list mt12">
<button class="lrow big" data-act="img"><span class="sic teal">${ic('camera', 19, 2.2)}</span><span class="f1 left b">${t('partner.asImage')}</span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
<button class="lrow big" data-act="txt"><span class="sic blue">${ic('share', 19, 2.2)}</span><span class="f1 left b">${t('partner.asText')}</span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
<button class="lrow big" data-act="link"><span class="sic orange">${ic('heart', 19, 2.2)}</span><span class="f1 left b">${t('partner.askCheer')}</span>${ic('right', 17, 2.2, 'var(--muted)')}</button></div>`,
    actions: {
      img: async () => {
        const r = await shareStatsImage();
        if (r === 'downloaded') emit('toast', { key: 'common.downloaded' });
        closeSheet();
        return false;
      },
      txt: async () => (await shareResult(shareText(statsText())), false),
      link: async () => (await shareResult(shareText(t('partner.cheerAsk', { link: cheerLink() }))), false),
    },
  });
}

/** @param {Promise<string>} p */
async function shareResult(p) {
  const r = await p;
  if (r === 'copied') emit('toast', { key: 'common.copied' });
  closeSheet();
}

/** Partner settings sheet (from Profile). */
export function openPartner() {
  openSheet({
    render:
      () => html`<div class="center">${otter({ size: 110, pose: 'wave' })}</div><h2 class="h2 center">${t('profile.partner')}</h2>
<p class="muted small b center mt4 lh">${t('partner.explain')}</p>
<label class="field mt12"><span>${t('profile.partnerName')}</span><input class="input" id="pname" data-change="name" value="${settings().partnerName}" placeholder="${t('partner.namePh')}"></label>
<button class="btn w100 mt12" data-act="share">${ic('share', 18, 2.4)}${t('partner.shareTitle')}</button>`,
    actions: {
      name: (el) => void setSettings({ partnerName: /** @type {HTMLInputElement} */ (el).value.trim() }),
      share: () => (closeSheet(), setTimeout(openShare, 50), false),
    },
  });
}

/**
 * Show a cheer popup if the URL has `?cheer=Name`, then clean the URL.
 * @returns {boolean} Whether a cheer was shown.
 */
export function handleCheer() {
  const name = new URLSearchParams(location.search).get('cheer');
  if (!name) return false;
  history.replaceState(history.state, '', appUrl() + location.hash);
  const clean = name.slice(0, 40);
  openSheet({
    kind: 'dialog',
    render: () => html`<div class="center cheer">${otter({ size: 130, pose: 'cheer', mood: 'excited' })}
<h2 class="h2 mt8">${t('partner.cheerTitle', { name: clean })}</h2><p class="muted b mt6 lh">${t('partner.cheerBody', { name: clean })}</p>
<button class="btn w100 mt16" data-close>${t('partner.cheerOk')}</button></div>`,
  });
  emit('cheer', clean);
  return true;
}
