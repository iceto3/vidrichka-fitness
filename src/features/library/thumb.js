/**
 * Exercise thumbnail (1.4.2): frame 2 of the verified illustration, cropped and without
 * markers. Inline SVG, so it follows the app's light/dark theme. Kept out of library/api.js
 * so the thumbnails only load with the views that show them.
 * @module features/library/thumb
 */
import { raw } from '../../ui/dom.js';
import { THUMBS } from '../../data/figure-thumbs.js';

/** Thumbnail SVG of an exercise (empty for unknown ids). @param {string} id */
export const exThumb = (id) => raw(Object.hasOwn(THUMBS, id) ? THUMBS[id] : '');
