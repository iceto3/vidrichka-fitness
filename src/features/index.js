/**
 * Feature manifest: importing a feature's index registers its tabs, routes, badges,
 * quests and sub-tabs. Views inside features are lazy-loaded by their routes.
 * To add a feature: create `features/<name>/index.js` and import it here.
 * @module features
 */
import './home/index.js';
import './workouts/index.js';
import './library/index.js';
import './food/index.js';
import './progress/index.js';
import './body/index.js';
import './profile/index.js';
export { startMotivation } from './motivation/index.js';
