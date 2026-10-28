/**
 * Technique of one exercise (steps, tips, rest) as a bottom sheet, so a workout in progress
 * stays on screen (1.4.0; the full page is still at #/exercise/<id>).
 * @module features/library/technique
 */
import { html, raw } from '../../ui/dom.js';
import { L, t } from '../../core/i18n.js';
import { openSheet } from '../../ui/sheet.js';
import { ic } from '../../ui/icons.js';
import { exById, exName, youtubeUrl } from './api.js';
import { stepFigure } from './figures.js';

/** Sheet body (exported for tests). @param {string} id */
export const techniqueBody = (id) => {
  const e = exById(id);
  if (!e) return html`<p class="b">${t('library.notFound')}</p>`;
  return html`<h2 class="h2">${exName(id)}</h2>
<div class="steps mt12">${e.steps.map((_, i) => html`<div class="stp"><span class="lb">${t('library.step', { n: i + 1 })}</span>${raw(stepFigure(e.fig, i))}</div>`)}</div>
<div class="steps xs b muted mt8 center">${e.steps.map((s) => html`<span>${L(s)}</span>`)}</div>
<div class="tips mt12"><h3 class="h3 xb">${t('library.tips')}</h3>${e.tips.map((tip, i) => html`<div class="tip mt10"><i>${i + 1}</i>${L(tip)}</div>`)}</div>
<div class="row gap8 mt12 restpill">${ic('timer', 18, 2.2, 'var(--accent-d)')}<span class="small b">${t('library.defaultRest')} <span class="acc">${e.rest} s</span></span></div>
<a class="btn yt mt12" href="${youtubeUrl(id)}" target="_blank" rel="noopener">${t('library.youtube')}</a>
<button class="btn sec w100 mt8" data-close>${t('workout.backToSet')}</button>`;
};

/** Open the technique sheet. @param {string} id */
export const openTechnique = (id) => openSheet({ render: () => techniqueBody(id) });
