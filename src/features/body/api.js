/**
 * Public API of the body feature: measurements and progress photos (sessions, pose slots,
 * monthly set).
 * @module features/body/api
 */
import { all, put, uid } from '../../core/store.js';
import { monthComplete, monthPoses, photoStreak, sessionsOf, sortPhotos } from './photo-logic.js';

export { POSES, PHOTO_DAY } from './photo-logic.js';

/** Default body weight (kg) for calorie estimates when none is recorded. */
export const DEFAULT_WEIGHT = 65;

/** Measurements, oldest first (same day: by save time). @returns {any[]} */
export const measurements = () =>
  all('measurements').sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.ts ?? 0) - (b.ts ?? 0)));

/** Latest value of a field (e.g. 'weight') or undefined. @param {string} field */
export const latest = (field) =>
  measurements()
    .reverse()
    .find((m) => m[field] != null)?.[field];

/** Latest body weight or the default. */
export const bodyWeight = () => Number(latest('weight')) || DEFAULT_WEIGHT;

/** Photos, oldest first (session date, then time, then upload time). @returns {import('./photo-logic.js').Photo[]} */
export const photos = () => sortPhotos(all('photos'));

/** Photo sessions, oldest first. */
export const photoSessions = () => sessionsOf(all('photos'));

/** This month's photo set: poses done, complete, streak. @param {string} month `YYYY-MM` */
export const photoMonth = (month) => {
  const ph = all('photos');
  return { poses: monthPoses(ph, month), done: monthComplete(ph, month), streak: photoStreak(ph, month) };
};

/**
 * 1.3.4: save a measurement (e.g. a weight said with "Кажи").
 * @param {{date: string, weight?: number} & Record<string, any>} v
 */
export const addMeasurement = (v) => put('measurements', { id: uid('m'), ts: Date.now(), ...v });
