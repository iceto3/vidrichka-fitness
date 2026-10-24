/**
 * Body feature registration: adds the "Body" sub-tab to Progress.
 * @module features/body
 */
import { register } from '../../core/registry.js';

register('progressTabs', { id: 'body', label: 'progress.body', order: 20, load: () => import('./views/body.js') });
