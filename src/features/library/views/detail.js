/**
 * Exercise detail: three step illustrations, muscles worked with body map, technique
 * tips, default rest and a "Watch on YouTube" search link.
 * @module features/library/views/detail
 */
import { html, raw } from '../../../ui/dom.js';
import { L, t } from '../../../core/i18n.js';
import { kv, setKv } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { exById, exName, youtubeUrl } from '../api.js';
import { stepFigure } from '../figures.js';
import { bodyMap } from '../bodymap.js';

const chipsFor = (/** @type {string[]} */ ms, /** @type {string} */ cls, /** @type {string} */ dot) =>
  ms.map(
    (m) => html`<span class="chip ${cls}"><i class="dot" style="background:${dot}"></i>${t(`muscle.${m}`)}</span>`,
  );

/**
 * @param {{id: string}} p
 * @returns {import('../../../core/registry.js').View}
 */
export default ({ id }) => {
  const e = exById(id);
  return {
    tab: 'workouts',
    render: () => {
      if (!e)
        return String(
          html`<div class="content"><button class="iconbtn" data-back aria-label="${t('common.back')}">${ic('back')}</button><p class="mt16 b">${t('library.notFound')}</p></div>`,
        );
      const fav = kv('favs', []).includes(id);
      const area = e.primary.some((m) => ['glutes', 'quads', 'hamstrings', 'calves'].includes(m))
        ? 'lower'
        : e.primary.includes('core')
          ? 'core'
          : 'upper';
      return String(html`<div class="content">
<div class="row between"><button class="iconbtn" data-back="library" aria-label="${t('common.back')}">${ic('back', 22)}</button>
<div class="h3 muted">${t('library.title')}</div>
<button class="iconbtn${fav ? ' fav' : ''}" data-act="fav" aria-pressed="${fav}" aria-label="${t('library.favourite')}">${ic('star', 20)}</button></div>
<div class="mt12"><h1 class="h1">${exName(id)}</h1><div class="muted b small mt6">${t(`equip.${e.equipment}`)} · ${t('library.strength')} · ${t(`area.${area}`)}</div></div>
<div class="steps mt12">${e.steps.map((_, i) => html`<div class="stp"><span class="lb">${t('library.step', { n: i + 1 })}</span>${raw(stepFigure(e.fig, i))}</div>`)}</div>
<div class="steps xs b muted mt8 center">${e.steps.map((s) => html`<span>${L(s)}</span>`)}</div>
<div class="card mt12 row gap12 musc">
  <div class="silh">${raw(bodyMap(e.primary, e.secondary))}</div>
  <div class="f1"><div class="xs xb muted caps">${t('library.musclesWorked')}</div>
   <div class="mt8 small b">${t('library.primary')}</div><div class="row gap6 mt6 wrap">${chipsFor(e.primary, 'warm', 'var(--warm)')}</div>
   ${e.secondary.length ? html`<div class="mt10 small b">${t('library.secondary')}</div><div class="row gap6 mt6 wrap">${chipsFor(e.secondary, 'accent', 'var(--accent)')}</div>` : ''}
   <div class="row gap8 mt12 restpill">${ic('timer', 18, 2.2, 'var(--accent-d)')}<span class="small b">${t('library.defaultRest')} <span class="acc">${e.rest} s</span></span></div></div>
</div>
<div class="card mt12 tips"><h2 class="h3 xb">${t('library.tips')}</h2>${e.tips.map((tip, i) => html`<div class="tip mt10"><i>${i + 1}</i>${L(tip)}</div>`)}</div>
<a class="btn yt mt12" href="${youtubeUrl(id)}" target="_blank" rel="noopener"><svg width="26" height="18" viewBox="0 0 26 18" aria-hidden="true"><rect width="26" height="18" rx="5" fill="#fff"/><path d="M10.5 5v8l7-4z" fill="#E5484D"/></svg>${t('library.youtube')}</a>
</div>`);
    },
    actions: {
      fav: () => {
        const favs = kv('favs', []);
        setKv('favs', favs.includes(id) ? favs.filter((/** @type {string} */ x) => x !== id) : [...favs, id]);
      },
    },
  };
};
