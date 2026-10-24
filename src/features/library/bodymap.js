/**
 * Simple front body silhouette with primary (orange) / secondary (teal) muscle highlights.
 * @module features/library/bodymap
 */

const G = '#D5DEE3';

/** Region shapes per muscle id (120×200 box). @type {Record<string, string>} */
const REGIONS = {
  shoulders: '<circle cx="35" cy="49" r="8"/><circle cx="85" cy="49" r="8"/>',
  chest: '<path d="M38 50 Q60 44 82 50 L80 66 Q60 70 40 66Z"/>',
  back: '<path d="M36 48 Q60 40 84 48 L84 60 Q60 54 36 60Z"/>',
  biceps: '<path d="M24 58 Q30 56 32 62 L28 82 Q24 84 21 80Z"/><path d="M96 58 Q90 56 88 62 L92 82 Q96 84 99 80Z"/>',
  triceps: '<path d="M20 64 L24 60 L27 80 L20 84Z"/><path d="M100 64 L96 60 L93 80 L100 84Z"/>',
  core: '<path d="M42 68 Q60 74 78 68 L78 92 Q60 96 42 92Z"/>',
  glutes: '<ellipse cx="45" cy="112" rx="16" ry="13"/><ellipse cx="75" cy="112" rx="16" ry="13"/>',
  quads:
    '<path d="M33 126 Q42 123 56 126 L52 156 Q42 160 35 156Z"/><path d="M87 126 Q78 123 64 126 L68 156 Q78 160 85 156Z"/>',
  hamstrings:
    '<path d="M36 130 Q44 128 54 131 L51 154 Q44 157 38 154Z"/><path d="M84 130 Q76 128 66 131 L69 154 Q76 157 82 154Z"/>',
  calves: '<ellipse cx="41" cy="172" rx="6" ry="10"/><ellipse cx="79" cy="172" rx="6" ry="10"/>',
};

/**
 * Body map SVG.
 * @param {string[]} primary
 * @param {string[]} secondary
 */
export function bodyMap(primary, secondary) {
  const paint = (/** @type {string[]} */ ms, /** @type {string} */ fill, /** @type {number} */ op) =>
    ms.map((m) => `<g fill="${fill}" opacity="${op}">${REGIONS[m] ?? ''}</g>`).join('');
  return `<svg width="120" height="200" viewBox="0 0 120 200" role="img" aria-label="${[...primary, ...secondary].join(', ')}">
<circle cx="60" cy="20" r="14" fill="${G}"/><rect x="53" y="32" width="14" height="10" fill="${G}"/>
<path d="M34 44 Q60 36 86 44 L90 98 Q60 104 30 98 Z" fill="${G}"/>
<path d="M34 46 Q22 50 20 66 L16 104 Q20 108 24 104 L30 70" fill="${G}"/><path d="M86 46 Q98 50 100 66 L104 104 Q100 108 96 104 L90 70" fill="${G}"/>
<path d="M30 96 Q60 92 90 96 L92 120 Q60 126 28 120 Z" fill="${G}"/>
<path d="M30 122 L32 186 Q40 192 48 186 L58 124 Z" fill="${G}"/><path d="M90 122 L88 186 Q80 192 72 186 L62 124 Z" fill="${G}"/>
${paint(secondary, '#0B8F96', 0.5)}${paint(primary, '#FF7A2F', 1)}</svg>`;
}
