/**
 * Exercise library list with muscle-group, gym/home and (1.6.0) equipment filters.
 * Also used as a picker (plan editor) when `onPick` is given.
 * @module features/library/views/list
 */
import { html, raw } from '../../../ui/dom.js';
import { emit } from '../../../core/bus.js';
import { t } from '../../../core/i18n.js';
import { ic } from '../../../ui/icons.js';
import { seg, topBar } from '../../../ui/components.js';
import { EQUIPMENT, EXERCISES, MUSCLE_GROUPS, exName, muscleTags } from '../api.js';
import { exThumb } from '../thumb.js';

const f = { place: 'all', group: 'all', equip: 'all', q: '' };

/** 1.6.3: search text matches the Bulgarian or English name. @param {any} e */
const matches = (e) => {
  const q = f.q.trim().toLowerCase();
  return (
    !q ||
    [e.name?.bg, e.name?.en, exName(e.id)].some((n) =>
      String(n ?? '')
        .toLowerCase()
        .includes(q),
    )
  );
};

/** Exercises matching the current filters. */
export const filtered = () =>
  EXERCISES.filter(
    (e) =>
      matches(e) && // 1.6.3: search
      (f.place === 'all' || e.place.includes(f.place)) &&
      (f.equip === 'all' || e.equipment === f.equip || !!e.alt?.includes(f.equip)) && // 1.6.1: + alt
      (f.group === 'all' ||
        [...e.primary, ...e.secondary.slice(0, 1)].some((m) =>
          MUSCLE_GROUPS[/** @type {keyof MUSCLE_GROUPS} */ (f.group)]?.includes(m),
        )),
  );

/** Is any filter on? (1.6.2) */
export const filtering = () => f.place !== 'all' || f.group !== 'all' || f.equip !== 'all' || !!f.q.trim();

/**
 * 1.6.2 (tester): the header count follows the filters – „40 от 62 упражнения“ with the
 * „Пудовка“ filter, „62 упражнения“ without any.
 */
export const countLabel = () => {
  const n = filtered().length;
  return filtering() ? t('library.countOf', { n, total: EXERCISES.length }) : t('library.count', { n });
};

/** Reset the filters (tests). */
export const resetFilters = () => Object.assign(f, { place: 'all', group: 'all', equip: 'all', q: '' });

/** Filter controls. */
export const filters =
  () => html`<label class="search exsearch">${ic('search', 20, 2.2)}<input class="bare f1" type="search" data-input="exq" value="${f.q}" placeholder="${t('library.searchPh')}" autocomplete="off" enterkeyhint="search" aria-label="${t('library.search')}"></label>
${seg(
  ['all', 'gym', 'home'].map((v) => ({ value: v, label: t(`place.${v}`) })),
  f.place,
  'place',
)}
<div class="hscroll mt10" role="group" aria-label="${t('library.muscles')}">${[
    'all',
    ...Object.keys(MUSCLE_GROUPS),
  ].map(
    (g) =>
      html`<button class="chip fchip${f.group === g ? ' on' : ''}" data-act="group" data-v="${g}" aria-pressed="${String(f.group === g)}">${t(`group.${g}`)}</button>`,
  )}</div>
<div class="hscroll mt8" role="group" aria-label="${t('library.equipment')}">${['all', ...EQUIPMENT].map(
    (q) =>
      html`<button class="chip fchip${f.equip === q ? ' on' : ''}" data-act="equip" data-v="${q}" aria-pressed="${String(f.equip === q)}">${t(`equip.${q}`)}</button>`,
  )}</div>`;

/**
 * One exercise row.
 * @param {import('../../../data/exercises.js').Exercise} e
 * @param {string} attrs
 * @param {any} [right]
 */
export const exRow = (e, attrs, right = ic('right', 18, 2.2, 'var(--muted)')) =>
  html`<button class="exrow" ${raw(attrs)}><span class="exthumb" aria-hidden="true">${exThumb(e.id)}</span>
<span class="f1"><span class="b exname">${exName(e.id)}</span><span class="row gap6 mt6 wrap">${muscleTags(e, 2)}</span></span>${right}</button>`;

/** Shared filter actions. */
export const filterActions = {
  place: (/** @type {HTMLElement} */ el) => void (f.place = el.dataset.v ?? 'all'),
  group: (/** @type {HTMLElement} */ el) => void (f.group = el.dataset.v ?? 'all'),
  equip: (/** @type {HTMLElement} */ el) => void (f.equip = el.dataset.v ?? 'all'), // 1.6.0
  exq: (/** @type {HTMLElement} */ el) => {
    f.q = /** @type {HTMLInputElement} */ (el).value;
    emit('ui:refresh'); // live results; morph keeps the focused field
  },
};

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'workouts',
  render: () =>
    String(html`<div class="content">${topBar(t('library.title'), html`<span class="libcount" aria-live="polite">${countLabel()}</span>`)}
<div class="mt12">${filters()}</div>
<div class="card list mt12">${filtered().map((e) => exRow(e, `data-go="exercise/${e.id}"`))}</div></div>`),
  actions: filterActions,
});
