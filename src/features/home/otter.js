/**
 * What the otter on Home says when tapped (1.4.0): a short rotating line, gendered in BG.
 * @module features/home/otter
 */
import { t } from '../../core/i18n.js';

/** Number of lines (home.otter1 … home.otterN). */
export const OTTER_LINES = 6;

/** The line for the n-th tap (cycles). @param {number} n */
export const otterLine = (n) => t(`home.otter${(Math.abs(n) % OTTER_LINES) + 1}`);
