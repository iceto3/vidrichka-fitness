/**
 * Voice feature registration: checks once at start (and when back online) whether the
 * voice server is reachable, so Home and Food › Add can show the "Say it" button.
 * @module features/voice
 */
import { checkVoice } from './api.js';

setTimeout(checkVoice, 0);
addEventListener('online', () => checkVoice());
