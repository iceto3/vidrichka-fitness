/**
 * Confetti burst: static scattered pieces (like the design) that gently fall.
 * Respects prefers-reduced-motion via CSS.
 * @module ui/confetti
 */
import { raw } from './dom.js';

const COLORS = ['#0B8F96', '#FF7A2F', '#F5B935', '#1FB46B', '#E5484D', '#7C5CFF', '#2BB8BE'];

/** Seeded pseudo-random generator so the layout is stable between re-renders. @param {number} s */
const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;

/** Confetti SVG overlay (keeps the centre clear for the mascot). */
export function confetti() {
  const r = rng(7);
  let s = '';
  for (let i = 0; i < 70; i++) {
    const x = r() * 400 + 6,
      y = r() * 245 + 5,
      c = COLORS[Math.floor(r() * COLORS.length)],
      rot = r() * 180,
      k = r();
    if (x > 120 && x < 290 && y > 60 && y < 270) continue;
    const delay = (r() * 0.6).toFixed(2);
    const shape =
      k < 0.45
        ? `<rect x="${x}" y="${y}" width="9" height="4.5" rx="1.5" fill="${c}" transform="rotate(${rot} ${x} ${y})"/>`
        : k < 0.75
          ? `<circle cx="${x}" cy="${y}" r="3.2" fill="${c}"/>`
          : `<path d="M${x} ${y} q4 -6 8 0 t8 0" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round" transform="rotate(${rot} ${x} ${y})"/>`;
    s += `<g class="cf" style="animation-delay:${delay}s">${shape}</g>`;
  }
  return raw(`<svg class="confetti" viewBox="0 0 412 330" aria-hidden="true">${s}</svg>`);
}
