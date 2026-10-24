/**
 * Exercise library list with muscle-group and gym/home filters.
 * Also used as a picker (plan editor) when `onPick` is given.
 * @module features/library/views/list
 */
import { html, raw } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { seg, topBar } from '../../../ui/components.js';
import { EXERCISES, MUSCLE_GROUPS, exName, muscleTags } from '../api.js';
import { stepFigure } from '../figures.js';

const f = { place: 'all', group: 'all' };

/** Exercises matching the current filters. */
export const filtered = () =>
  EXERCISES.filter((e) => (f.place === 'all' || e.place.includes(f.place)) &&
    (f.group === 'all' || [...e.primary, ...e.secondary.slice(0, 1)].some((m) => MUSCLE_GROUPS[/** @type {keyof MUSCLE_GROUPS} */ (f.group)]?.includes(m))));

/** Filter controls. */
export const filters = () => html`${seg(['all', 'gym', 'home'].map((v) => ({ value: v, label: t(`place.${v}`) })), f.place, 'place')}
<div class="hscroll mt10" role="group" aria-label="${t('library.muscles')}">${['all', ...Object.keys(MUSCLE_GROUPS)].map(
  (g) => html`<button class="chip fchip${f.group === g ? ' on' : ''}" data-act="group" data-v="${g}" aria-pressed="${f.group === g}">${t(`group.${g}`)}</button>`)}</div>`;

/**
 * One exercise row.
 * @param {import('../../../data/exercises.js').Exercise} e
 * @param {string} attrs
 * @param {any} [right]
 */
export const exRow = (e, attrs, right = ic('right', 18, 2.2, 'var(--muted)')) =>
  html`<button class="exrow" ${raw(attrs)}><span class="exthumb">${raw(stepFigure(e.fig, 1))}</span>
<span class="f1"><span class="b exname">${exName(e.id)}</span><span class="row gap6 mt6 wrap">${muscleTags(e, 2)}</span></span>${right}</button>`;

/** Shared filter actions. */
export const filterActions = {
  place: (/** @type {HTMLElement} */ el) => void (f.place = el.dataset.v ?? 'all'),
  group: (/** @type {HTMLElement} */ el) => void (f.group = el.dataset.v ?? 'all'),
};

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'workouts',
  render: () => String(html`<div class="content">${topBar(t('library.title'), t('library.count', { n: EXERCISES.length }))}
<div class="mt12">${filters()}</div>
<div class="card list mt12">${filtered().map((e) => exRow(e, `data-go="exercise/${e.id}"`))}</div></div>`),
  actions: filterActions,
});
