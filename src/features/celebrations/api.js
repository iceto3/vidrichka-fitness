/**
 * Public API of the celebrations feature: `celebrate()` queues a SMALL, MEDIUM or BIG
 * celebration (one at a time, never stacked). Scenes are lazy-loaded; sounds are the
 * precached files in assets/sounds and play only when "Celebration sounds" is on.
 * @module features/celebrations/api
 */
import { settings } from '../../core/settings.js';
import { loadSound, playSound } from '../../ui/feedback.js';
import { createQueue } from './queue.js';

/** Sound cue → file (copied from the approved mockup's sounds). */
export const SOUNDS = /** @type {Record<string, string>} */ ({
  hello: 'assets/sounds/hello.mp3', // SMALL
  chime: 'assets/sounds/chime.mp3', // MEDIUM
  whoosh: 'assets/sounds/whoosh.mp3', // BIG
  sparkle: 'assets/sounds/sparkle.mp3',
  squeal: 'assets/sounds/squeal.mp3',
});

/** @type {HTMLElement|null} */
let host = null;

/** The overlay all scenes play in (created on first use, above sheets and dialogs). */
function stageEl() {
  if (host) return host;
  host = document.createElement('div');
  host.className = 'cel';
  host.id = 'cel';
  document.body.append(host);
  const fit = () => host?.style.setProperty('--s', String(Math.min(innerWidth / 390, innerHeight / 844)));
  fit();
  addEventListener('resize', fit);
  return host;
}

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Decode the sounds ahead of time so the first cue is on beat (after the audio unlock). */
export const preloadSounds = () => settings().celebrationSounds && Object.values(SOUNDS).forEach(loadSound);

const queue = createQueue(async (/** @type {import('./play.js').Celebration} */ c) => {
  const { playScene } = await import('./play.js');
  await playScene(stageEl(), c, {
    reduce: reduceMotion(),
    cue: (name, at) => void (settings().celebrationSounds && SOUNDS[name] && playSound(SOUNDS[name], at)),
  });
});

/**
 * Queue a celebration.
 * @param {import('./play.js').Celebration} c
 */
export const celebrate = (c) => queue.push(c);

/** Whether a celebration is playing or waiting (e.g. hold in-app prompts until done). */
export const celebrating = () => queue.busy || queue.pending > 0;

let held = false;
/**
 * 1.3.4: while "Кажи" saves and plays its own tour, the per-item micro animations and the
 * goal toasts (water, steps) wait – the tour animates each item and ends with ONE celebration.
 * @param {boolean} on
 */
export const holdCelebrations = (on) => void (held = on);
/** Whether the voice tour holds the automatic celebrations. */
export const celebrationsHeld = () => held;
