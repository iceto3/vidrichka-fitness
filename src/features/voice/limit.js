/**
 * 1.4.2 Per-phone daily limit for AI picture reads (/vision: health screenshots and food
 * labels), on top of the server's per-IP per-minute limit. Kept in kv `visionDaily` as
 * {day, n}; a new day starts from zero. Pure (unit tested); the API counts.
 * @module features/voice/limit
 */

/** Picture reads per phone per day. */
export const VISION_PER_DAY = 20;

/** Reads left today. @param {{day?: string, n?: number}|null|undefined} rec @param {string} today */
export const visionLeft = (rec, today) => Math.max(0, VISION_PER_DAY - (rec?.day === today ? Number(rec.n) || 0 : 0));

/** The counter after one more read. @param {{day?: string, n?: number}|null|undefined} rec @param {string} today */
export const visionCounted = (rec, today) => ({ day: today, n: (rec?.day === today ? Number(rec.n) || 0 : 0) + 1 });
