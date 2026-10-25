/**
 * Progress-photo constants shared by the body feature (sessions, monthly set) and the daily
 * reminders. Pure data.
 * @module data/photos
 */

/** Pose slots of a photo session, in display order. */
export const POSES = /** @type {const} */ (['front', 'back', 'left', 'right']);

/**
 * Day of the month for the monthly 4-pose photo set (1.2.1): the reminder fires that day,
 * and the daily quest shows from then until that month's four poses are done.
 */
export const PHOTO_DAY = 1;
