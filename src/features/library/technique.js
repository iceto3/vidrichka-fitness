/**
 * Technique of one exercise as a bottom sheet, so a workout in progress stays on screen
 * (1.4.0; the full page is still at #/exercise/<id>). 1.4.1: the verified illustration and
 * technique sections (features/library/figure.js).
 * @module features/library/technique
 */
import { html } from '../../ui/dom.js';
import { t } from '../../core/i18n.js';
import { openSheet } from '../../ui/sheet.js';
import { ic } from '../../ui/icons.js';
import { exById, exName, youtubeUrl } from './api.js';
import { figureBlock, hydrateFigure, techniqueSections } from './figure.js';

/** Sheet body (exported for tests). @param {string} id */
export const techniqueBody = (id) => {
  const e = exById(id);
  if (!e) return html`<p class="b">${t('library.notFound')}</p>`;
  return html`<h2 class="h2">${exName(id)}</h2>
<div class="mt12">${figureBlock(id)}</div>
<div class="row gap8 mt12 restpill">${ic('timer', 18, 2.2, 'var(--accent-d)')}<span class="small b">${t('library.defaultRest')} <span class="acc">${e.rest} ${t('unit.s')}</span></span></div>
<div class="tech">${techniqueSections(id)}</div>
<a class="btn yt mt12" href="${youtubeUrl(id)}" target="_blank" rel="noopener">${t('library.youtube')}</a>
<button class="btn sec w100 mt12 tback" data-close>${t('workout.backToSet')}</button>`;
};

/** Open the technique sheet. @param {string} id */
export const openTechnique = (id) =>
  openSheet({ render: () => techniqueBody(id), mount: (el) => void hydrateFigure(el, id) });
