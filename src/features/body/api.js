/**
 * Public API of the body feature: measurements and progress photos.
 * @module features/body/api
 */
import { all } from '../../core/store.js';

/** Default body weight (kg) for calorie estimates when none is recorded. */
export const DEFAULT_WEIGHT = 65;

/** Measurements, oldest first. @returns {any[]} */
export const measurements = () => all('measurements').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.ts - b.ts));

/** Latest value of a field (e.g. 'weight') or undefined. @param {string} field */
export const latest = (field) => measurements().reverse().find((m) => m[field] != null)?.[field];

/** Latest body weight or the default. */
export const bodyWeight = () => Number(latest('weight')) || DEFAULT_WEIGHT;

/** Photos, oldest first. */
export const photos = () => all('photos').sort((a, b) => (a.date < b.date ? -1 : 1));
