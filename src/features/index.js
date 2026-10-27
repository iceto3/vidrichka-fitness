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
import './daily/index.js';
import './voice/index.js';
import './trash/index.js';
import './steps/index.js';
import './day/index.js';
export { startTrash } from './trash/index.js';
export { startMotivation } from './motivation/index.js';
export { startCelebrations } from './celebrations/index.js';
export { startDaily } from './daily/index.js';
