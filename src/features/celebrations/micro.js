/**
 * Micro animations (1.2): a light, under-1-second "got it" right where she tapped.
 *  - water (+ glass): a droplet falls into a glass with a ripple, next to the mini otter sipping;
 *  - food (any item added to a meal): the item pops in with a bounce and a few sparkles.
 * They play in their own fixed, click-through layer (`#micro`) next to the page, never in
 * it: the page is not re-rendered, so the + button never flickers. One animation per kind:
 * a new tap restarts it (no queue, nothing builds up on rapid taps). The SMALL "hello" cue
 * plays at most every 350 ms, only with "Celebration sounds" on. Reduced motion: a static
 * badge that fades out.
 * @module features/celebrations/micro
 */
import { settings } from '../../core/settings.js';
import { playSound } from '../../ui/feedback.js';
import { otter } from '../mascot/api.js';
import { SOUNDS } from './api.js';

/** How long one micro animation stays (ms). */
export const MICRO_MS = 900;
const SOUND_GAP = 350;

/** @type {HTMLElement|null} */
let layer = null;
/** @type {Record<string, {el: HTMLElement, timer: number}>} */
const live = {};
let lastSound = 0;

const reduce = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const sparkle = (/** @type {string} */ c) =>
  `<svg viewBox="-12 -12 24 24" width="14" height="14"><path d="M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3Z" fill="${c}"/></svg>`;
const esc = (/** @type {string} */ s) => s.replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`);

function layerEl() {
  if (layer?.isConnected) return layer;
  layer = document.createElement('div');
  layer.id = 'micro';
  layer.setAttribute('aria-hidden', 'true');
  document.body.append(layer);
  return layer;
}

/**
 * Where to play: the first visible element of `sels`, else the top centre of the screen.
 * @param {string[]} sels @returns {{x: number, y: number}}
 */
export function anchorPoint(sels) {
  for (const s of sels) {
    const r = document.querySelector(s)?.getBoundingClientRect();
    if (r && r.width && r.bottom > 0 && r.top < innerHeight)
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }
  return { x: innerWidth / 2, y: Math.min(160, innerHeight / 4) };
}

/**
 * Start (or restart) the `kind` animation at a point.
 * @param {'water'|'food'} kind @param {{x: number, y: number}} at @param {string} inner
 */
function play(kind, at, inner) {
  const prev = live[kind];
  if (prev) (clearTimeout(prev.timer), prev.el.remove());
  const el = document.createElement('div');
  el.className = `micro ${kind}${reduce() ? ' still' : ''}`;
  el.style.left = `${Math.round(at.x)}px`;
  el.style.top = `${Math.round(at.y)}px`;
  el.innerHTML = inner;
  layerEl().append(el);
  live[kind] = {
    el,
    timer: window.setTimeout(() => {
      el.remove();
      if (live[kind]?.el === el) delete live[kind];
    }, MICRO_MS),
  };
  const now = performance.now();
  if (settings().celebrationSounds && now - lastSound >= SOUND_GAP) {
    lastSound = now;
    playSound(SOUNDS.hello, 0, 0.55);
  }
}

/** + glass: droplet → glass with ripple, mini otter sipping. */
export function microWater() {
  const at = anchorPoint(['.bluebtn', '.glasses', '.water']);
  play(
    'water',
    at,
    `<div class="mglass"><i class="mdrop"></i><i class="mfill"></i><i class="mripple"></i></div><div class="motter">${otter({ size: 46, pose: 'sip' })}</div>`,
  );
}

/** Food added: the item pops into the meal with a bounce and sparkles. @param {string} [emoji] */
export function microFood(emoji = '🍽️') {
  // Next frame: the basket chip / meal row the item went into has been drawn by then.
  requestAnimationFrame(() => {
    const at = anchorPoint(['.add .basket .chip:last-of-type', '.add .basket', '.add .topbar']);
    const sp = ['#F5B935', '#14A3A8', '#FF7A2F', '#7C5CFF']
      .map((c, i) => `<i class="msp s${i}">${sparkle(c)}</i>`)
      .join('');
    play('food', at, `<span class="mpop">${esc(emoji)}</span>${sp}`);
  });
}

/** Test hook: the animations currently on screen. */
export const microLive = () => Object.keys(live);
