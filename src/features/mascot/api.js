/**
 * Public API of the mascot feature (other features import only this file).
 * @module features/mascot/api
 */
import { raw } from '../../ui/dom.js';
import { otterSvg } from './otter.js';
import { gearFor } from './mascot.js';
import { level } from '../motivation/api.js';
import { settings } from '../../core/settings.js';
import { t } from '../../core/i18n.js';

export { otterSvg } from './otter.js';
export { moodFor, messageFor, gearFor, OUTFITS, GEAR_LEVELS } from './mascot.js';

/** Localized mascot name (user-editable in Profile). */
export const otterName = () => settings().otterName || t('mascot.defaultName');

/**
 * Otter as safe HTML, dressed for the given level.
 * @param {{size?: number, pose?: string, mood?: string, level?: number, outfit?: string}} o
 */
export const otter = (o) =>
  raw(otterSvg({ ...o, gear: gearFor(o.level ?? level().level, o.outfit ?? settings().outfit), title: otterName() }));
