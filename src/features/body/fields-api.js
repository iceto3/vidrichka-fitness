/**
 * 1.6.1 Body measurements shown – stored in kv `measureTiles` (see ./fields.js).
 * @module features/body/fields-api
 */
import { kv, setKv } from '../../core/store.js';
import { settings } from '../../core/settings.js';
import { measurements } from './api.js';
import { fieldsOf, resetTiles, setTile, shownTiles } from './fields.js';

/** @returns {import('./fields.js').TilePref|undefined} */
const pref = () => kv('measureTiles', undefined);

/** Tiles shown now (gender defaults, or the user's own set). */
export const visibleTiles = () => shownTiles(pref(), settings().gender, measurements());

/** Form fields shown now. */
export const visibleFields = () => fieldsOf(visibleTiles());

/** Is the set the user's own (not following gender)? */
export const customTiles = () => !!pref()?.custom;

/** Show / hide one tile. @param {string} id @param {boolean} on */
export const showTile = (id, on) => setKv('measureTiles', setTile(pref(), settings().gender, measurements(), id, on));

/** Back to the defaults for the profile's gender. */
export const resetToGender = () => setKv('measureTiles', resetTiles());
