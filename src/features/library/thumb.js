/**
 * Exercise thumbnail (1.4.1): frame 2 of the verified illustration, cropped and without
 * markers. Inline SVG, so it follows the app's light/dark theme. Kept out of library/api.js
 * so the thumbnails only load with the views that show them.
 * @module features/library/thumb
 */
import { raw } from '../../ui/dom.js';
import { THUMBS } from '../../data/figure-thumbs.js';
import { PATHS } from '../../ui/icons.js';
import { exById } from './api.js';

/** Equipment icon per equipment type (1.6.0 fallback thumbnail). @type {Record<string, string>} */
const EQUIP_ICON = { kettlebell: 'kettlebell', band: 'band', bodyweight: 'user' };

/**
 * Thumbnail SVG of an exercise. 1.6.0: an exercise without an illustration yet gets its
 * equipment icon (`svg.exfb`) instead; empty for unknown ids. @param {string} id
 */
export const exThumb = (id) => {
  if (Object.hasOwn(THUMBS, id)) return raw(THUMBS[id]);
  const ex = exById(id);
  if (!ex) return raw('');
  const name = EQUIP_ICON[ex.equipment] ?? 'dumbbell';
  return raw(
    `<svg class="exfb" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] ?? ''}</svg>`,
  );
};
