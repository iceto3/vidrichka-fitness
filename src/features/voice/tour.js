/**
 * 1.3.4 post-voice tour: after "Кажи" saves, show where each thing landed.
 *  - 1 thing: go there and animate it as if entered by hand (water: the glasses fill one by
 *    one; food: the meal row pops; steps: the bar grows), then one small celebration;
 *  - 2–3 things: a quick ~1 s stop at each place, then ONE celebration;
 *  - more: no tour – the main place, a short "Записах 5 неща" and one celebration.
 * Any tap skips to the end. Reduced motion: much shorter stops, no glass-by-glass fill.
 * `planTour` is pure (unit tested); `playTour` drives the DOM.
 * @module features/voice/tour
 */
import { emit, on } from '../../core/bus.js';
import { currentPath } from '../../core/router.js';

/**
 * @typedef {{kind: 'food', date: string, meal: string, emoji?: string}
 *  | {kind: 'water', date: string, before: number, after: number}
 *  | {kind: 'steps', date: string, before: number, after: number}
 *  | {kind: 'sleep'|'weight'|'mood'|'energy', date: string}} Saved
 * @typedef {{route: string, sel: string, items: Saved[]}} Stop
 * @typedef {{mode: 'none'|'full'|'quick'|'summary', count: number, stops: Stop[], main: string}} Tour
 */

/** Where an item lands: route + the element to animate. @param {Saved} it @param {string} today */
export function placeOf(it, today) {
  switch (it.kind) {
    case 'food':
      return { route: 'food', sel: `.food .meal[data-m="${it.meal}"]` };
    case 'water':
      return { route: 'food', sel: '.food .water' };
    case 'steps':
      return it.date === today ? { route: 'home', sel: '.stepscard' } : { route: 'progress/trends', sel: '.ch-steps' };
    case 'sleep':
      return it.date === today ? { route: 'home', sel: '.sleepcard' } : { route: 'progress/sleep', sel: '.sbars' };
    case 'weight':
      return { route: 'progress/body', sel: '.weightcard' };
    default:
      return { route: 'progress/trends', sel: '.ch-mood' };
  }
}

/** Plan the tour for the saved things. @param {Saved[]} items @param {string} today @returns {Tour} */
export function planTour(items, today) {
  const count = items.length;
  /** @type {Stop[]} */
  const stops = [];
  for (const it of items) {
    const p = placeOf(it, today),
      s = stops.find((x) => x.route === p.route && x.sel === p.sel);
    if (s) s.items.push(it);
    else stops.push({ ...p, items: [it] });
  }
  /** @type {Record<string, number>} */
  const per = {};
  stops.forEach((s) => (per[s.route] = (per[s.route] ?? 0) + s.items.length));
  const main = stops.length ? Object.entries(per).sort((a, b) => b[1] - a[1])[0][0] : 'home';
  const mode = !count ? 'none' : count === 1 ? 'full' : count <= 3 ? 'quick' : 'summary';
  return { mode, count, stops: mode === 'summary' ? [] : stops, main };
}

/** How long one stop takes (ms). @param {Tour['mode']} mode @param {boolean} reduce */
// 1.4.0: longer (was 1.4 s / 1 s) – testers missed where things landed.
export const stopMs = (mode, reduce) => (reduce ? 350 : mode === 'full' ? 2200 : 1600);

const reduceMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const frame = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

/**
 * Play a tour. Resolves when done (or skipped by a tap).
 * @param {Tour} tour
 * @param {{onDone: () => void, prepare?: (s: Stop) => void}} o `prepare` runs before a stop's
 *   route opens (e.g. the Food diary switches to the entry's day).
 */
export async function playTour(tour, o) {
  const reduce = reduceMotion();
  let skipped = false;
  /** @type {(() => void)[]} */
  const wake = [];
  const skip = () => ((skipped = true), wake.splice(0).forEach((f) => f()));
  addEventListener('pointerdown', skip, { capture: true, once: true });
  /** Wait `ms`, cut short by a tap. @param {number} ms */
  const wait = (ms) =>
    new Promise((res) => {
      if (skipped) return res(undefined);
      const id = setTimeout(res, ms);
      wake.push(() => (clearTimeout(id), res(undefined)));
    });
  /** Open a route (if not there yet) and wait until it is drawn. @param {string} path */
  const go = async (path) => {
    if (currentPath() !== path) {
      const shown = new Promise((res) => {
        const off = on('route:changed', () => (off?.(), res(undefined)));
        setTimeout(res, 1500);
      });
      emit('nav', { path });
      await shown;
    }
    await frame();
  };
  document.documentElement.classList.add('vtouring');
  try {
    const list = tour.mode === 'summary' ? [] : tour.stops;
    if (tour.mode === 'summary') await go(tour.main);
    for (const s of list) {
      if (skipped) break;
      o.prepare?.(s);
      await go(s.route);
      if (skipped) break;
      await animate(s, tour.mode, reduce, wait);
    }
  } finally {
    removeEventListener('pointerdown', skip, { capture: true });
    document.documentElement.classList.remove('vtouring');
    document.querySelectorAll('.vtour').forEach((e) => e.classList.remove('vtour'));
    o.onDone();
  }
}

/**
 * Animate one stop. @param {Stop} s @param {Tour['mode']} mode @param {boolean} reduce
 * @param {(ms: number) => Promise<unknown>} wait
 */
async function animate(s, mode, reduce, wait) {
  const el = /** @type {HTMLElement|null} */ (document.querySelector(s.sel));
  const ms = stopMs(mode, reduce);
  if (!el) return void (await wait(ms / 2));
  el.scrollIntoView({ block: 'center', behavior: reduce ? 'auto' : 'smooth' });
  el.classList.add('vtour');
  const micro = await import('../celebrations/micro.js');
  const it = s.items[0];
  if (it.kind === 'water' && mode === 'full' && !reduce) {
    // As if tapped by hand: the new glasses fill one by one (2 glasses = 2 steps).
    const glasses = [...el.querySelectorAll('.glass')].slice(it.before, it.after);
    glasses.forEach((g) => g.classList.remove('on'));
    await wait(250);
    for (const g of glasses) {
      g.classList.add('on', 'vpop');
      micro.microWater([`${s.sel} .glass.vpop`, `${s.sel} .glasses`]);
      await wait(Math.max(350, MICRO_GAP));
      g.classList.remove('vpop');
    }
    glasses.forEach((g) => g.classList.add('on'));
  } else if (it.kind === 'water') micro.microWater([`${s.sel} .glasses`, s.sel]);
  else if (it.kind === 'food')
    s.items.forEach((x, i) =>
      setTimeout(() => micro.microFood(/** @type {any} */ (x).emoji, [s.sel]), reduce ? 0 : i * 260),
    );
  else if (it.kind === 'steps' && !reduce) {
    const fill = /** @type {HTMLElement|null} */ (el.querySelector('.bar i'));
    const goal = Number(fill?.style.width.replace('%', '')) || 0;
    if (fill) {
      const prev = fill.style.width;
      fill.style.transition = 'none';
      fill.style.width = `${Math.max(0, goal - (goal * (it.after - it.before)) / Math.max(1, it.after))}%`;
      await frame();
      fill.style.transition = '';
      fill.style.width = prev;
    }
  }
  await wait(ms);
  el.classList.remove('vtour');
}

/** Minimum gap between two glass steps (the micro animation's sound gap). */
const MICRO_GAP = 380;
