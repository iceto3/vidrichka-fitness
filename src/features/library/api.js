/**
 * Public API of the exercise library: lookups, localized names and muscle tags.
 * @module features/library/api
 */
import { EXERCISES, MUSCLE_GROUPS } from '../../data/exercises.js';
import { L, t } from '../../core/i18n.js';
import { html, raw } from '../../ui/dom.js';
import { stepFigure } from './figures.js';

const byId = new Map(EXERCISES.map((e) => [e.id, e]));

export { EXERCISES, MUSCLE_GROUPS };

/** Exercise by id. @param {string} id */
export const exById = (id) => byId.get(id);

/** Localized exercise name (falls back to the id for unknown/removed exercises). @param {string} id */
export const exName = (id) => L(byId.get(id)?.name) || id;

/**
 * Muscle tag chips (primary = orange, secondary = teal, bodyweight = grey).
 * @param {import('../../data/exercises.js').Exercise} ex
 * @param {number} [max]
 */
export const muscleTags = (ex, max = 3) =>
  html`${!ex.weighted ? html`<span class="tag t-muted">${t('equip.bodyweight')}</span>` : ''}${[
    ...ex.primary.map((m) => html`<span class="tag t-warm">${t(`muscle.${m}`)}</span>`),
    ...ex.secondary.map((m) => html`<span class="tag t-acc">${t(`muscle.${m}`)}</span>`),
  ].slice(0, ex.weighted ? max : max - 1)}`;

/** Reps label key for an exercise's unit. @param {string} id */
export const repsLabel = (id) => t(`unit.${byId.get(id)?.unit ?? 'reps'}`);

/** YouTube search link (never goes dead). @param {string} id */
export const youtubeUrl = (id) =>
  `https://www.youtube.com/results?search_query=${encodeURIComponent(`${byId.get(id)?.name.en ?? id} technique`)}`;

/** Small step-figure thumbnail for an exercise (Safe HTML). @param {string} id */
export const exThumb = (id) => raw(stepFigure(byId.get(id)?.fig ?? 'squat', 1));
