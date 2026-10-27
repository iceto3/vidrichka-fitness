/**
 * 1.4.0 What's new: release notes data (./notes.js, used by the popup after an update in
 * main.js) and the Profile › What's new page (`#whatsnew`).
 * @module features/whatsnew
 */
import { register } from '../../core/registry.js';

register('routes', { pattern: 'whatsnew', load: async () => (await import('./views/history.js')).default() });
