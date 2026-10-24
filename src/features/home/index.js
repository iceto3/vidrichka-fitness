/**
 * Home feature registration (first tab, default route).
 * @module features/home
 */
import { register } from '../../core/registry.js';

register('tabs', { id: 'home', icon: 'home', label: 'nav.home', path: 'home', order: 10 });
register('routes', { pattern: 'home', load: async () => (await import('./views/home.js')).default() });
