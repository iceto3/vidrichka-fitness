/**
 * Vidrichka the otter — flat sporty SVG mascot (ported from the approved mockups).
 * Poses: wave | cheer | dumbbell | bust | sip. Moods: happy | excited | sleepy.
 * Gear (unlocked by level): headband, tank, medal, crown.
 * Pure string output so it can also be drawn onto canvases (share cards, icons).
 * @module features/mascot/otter
 */

const O = '#8A5A3B',
  D = '#6B4127',
  L = '#F2D7B6',
  ACC = '#14A3A8',
  ACCD = '#0B7F86';

const limb = (/** @type {string} */ d) =>
  `<path d="${d}" stroke="${O}" stroke-width="20" stroke-linecap="round" fill="none"/>`;
const paw = (/** @type {number} */ x, /** @type {number} */ y) => `<circle cx="${x}" cy="${y}" r="11" fill="${O}"/>`;

/** @type {Record<string, string>} */
const ARMS = {
  wave: limb('M64 138 Q50 152 56 168') + limb('M136 138 Q158 124 164 100') + paw(164, 98),
  cheer: limb('M64 138 Q42 122 36 98') + limb('M136 138 Q158 122 164 98') + paw(36, 96) + paw(164, 96),
  dumbbell:
    limb('M64 138 Q50 152 56 168') +
    limb('M136 138 Q164 130 170 116') +
    '<rect x="152" y="104" width="38" height="6" rx="3" fill="#56646D"/><rect x="146" y="94" width="10" height="26" rx="4" fill="#33424B"/><rect x="186" y="94" width="10" height="26" rx="4" fill="#33424B"/>' +
    paw(170, 113),
  bust: '',
  // 1.2: sipping from a little glass of water (the water micro animation)
  sip:
    limb('M64 138 Q50 152 56 168') +
    limb('M136 140 Q150 124 132 112') +
    '<g transform="rotate(-18 126 100)"><path d="M114 84 h22 l-3 30 h-16z" fill="#DDF0FF" stroke="#2F80ED" stroke-width="3" stroke-linejoin="round"/><path d="M116 96 h18 l-2 16 h-14z" fill="#7DB8F5"/></g>' +
    paw(132, 112),
};

/** @param {string} mood @param {string} id */
function face(mood, id) {
  const eyes =
    mood === 'sleepy'
      ? `<path d="M70 81 q8 6 16 0 M114 81 q8 6 16 0" stroke="#1E1410" stroke-width="3.2" fill="none" stroke-linecap="round"/>`
      : `<ellipse cx="78" cy="80" rx="7.5" ry="8" fill="#1E1410"/><circle cx="80.5" cy="77" r="2.6" fill="#fff"/><ellipse cx="122" cy="80" rx="7.5" ry="8" fill="#1E1410"/><circle cx="124.5" cy="77" r="2.6" fill="#fff"/>`;
  const mouth =
    mood === 'excited'
      ? `<path d="M100 99 v2" stroke="#2A1A12" stroke-width="2.6"/><path d="M89 102 q11 14 22 0 z" fill="#2A1A12"/><path d="M94 106 q6 5 12 0" fill="#F28C7C"/>`
      : `<path d="M100 99 v3 M91 103 q4.5 5 9 0 q4.5 5 9 0" stroke="#2A1A12" stroke-width="2.6" fill="none" stroke-linecap="round"/>`;
  const zzz =
    mood === 'sleepy'
      ? `<text x="150" y="40" font-family="sans-serif" font-weight="800" font-size="18" fill="#6B7C87">z<tspan font-size="13" dy="-8">z</tspan></text>`
      : '';
  const sparkle =
    mood === 'excited'
      ? `<path d="M168 30 l3 8 8 3 -8 3 -3 8 -3 -8 -8 -3 8 -3z" fill="#F5B935"/><path d="M30 44 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#F5B935"/>`
      : '';
  return `<ellipse cx="100" cy="101" rx="42" ry="25" fill="${L}"/><ellipse cx="78" cy="76" rx="15" ry="13" fill="${L}" opacity=".35"/><ellipse cx="122" cy="76" rx="15" ry="13" fill="${L}" opacity=".35"/>
${eyes}<ellipse cx="64" cy="94" rx="7" ry="4.5" fill="#F28C7C" opacity=".55"/><ellipse cx="136" cy="94" rx="7" ry="4.5" fill="#F28C7C" opacity=".55"/>
<ellipse cx="100" cy="92" rx="10" ry="7" fill="#2A1A12"/><ellipse cx="97" cy="90" rx="3" ry="1.8" fill="#fff" opacity=".55"/>${mouth}
<g stroke="#5A3622" stroke-width="1.8" stroke-linecap="round" opacity=".75"><path d="M80 101 L50 95 M80 106 L51 110"/><path d="M120 101 L150 95 M120 106 L149 110"/></g>${zzz}${sparkle}<!--${id}-->`;
}

/** @param {Set<string>} gear @param {string} id */
const body = (gear, id) =>
  `<path d="M134 176 Q184 184 190 140 Q191 126 182 122 Q176 160 130 158 Z" fill="${D}"/>
<ellipse cx="100" cy="152" rx="46" ry="42" fill="${O}"/>` +
  (gear.has('tank')
    ? `<clipPath id="bc${id}"><ellipse cx="100" cy="152" rx="46" ry="42"/></clipPath><g clip-path="url(#bc${id})"><path d="M54 132 Q76 140 82 124 L118 124 Q124 140 146 132 L150 200 L50 200Z" fill="${ACC}"/><path d="M60 170 L140 170" stroke="#fff" stroke-width="5" opacity=".85"/></g>`
    : `<ellipse cx="100" cy="160" rx="29" ry="30" fill="${L}"/>`) +
  `<ellipse cx="78" cy="191" rx="15" ry="8" fill="${D}"/><ellipse cx="122" cy="191" rx="15" ry="8" fill="${D}"/>` +
  (gear.has('medal')
    ? `<path d="M86 124 L100 146 L114 124" stroke="#E5484D" stroke-width="5" fill="none"/><circle cx="100" cy="150" r="9" fill="#F5B935" stroke="#E3A21A" stroke-width="2"/><path d="M100 145 l1.6 3.2 3.4.5 -2.5 2.4 .6 3.4 -3.1-1.6 -3.1 1.6 .6-3.4 -2.5-2.4 3.4-.5z" fill="#fff"/>`
    : '');

/** @param {Set<string>} gear @param {string} id */
const head = (gear, id) =>
  `<circle cx="52" cy="58" r="11" fill="${O}"/><circle cx="53" cy="58" r="5.5" fill="${D}"/>
<circle cx="148" cy="58" r="11" fill="${O}"/><circle cx="147" cy="58" r="5.5" fill="${D}"/>
<clipPath id="hc${id}"><ellipse cx="100" cy="82" rx="56" ry="45"/></clipPath>
<ellipse cx="100" cy="82" rx="56" ry="45" fill="${O}"/>` +
  (gear.has('headband')
    ? `<g clip-path="url(#hc${id})"><rect x="40" y="46" width="120" height="14" fill="${ACC}"/><rect x="40" y="56" width="120" height="4" fill="${ACCD}" opacity=".5"/></g>
<path d="M150 52 q14 -6 20 -16 q-2 12 -14 22 z" fill="${ACC}"/><path d="M151 56 q16 2 24 -4 q-6 10 -22 10 z" fill="${ACCD}"/>`
    : '') +
  (gear.has('crown')
    ? `<path d="M76 42 L80 18 L92 32 L100 12 L108 32 L120 18 L124 42 Z" fill="#F5B935" stroke="#E3A21A" stroke-width="2" stroke-linejoin="round"/><circle cx="100" cy="34" r="3.5" fill="#E5484D"/>`
    : '');

/**
 * Otter SVG markup.
 * @param {{size?: number, pose?: string, mood?: string, gear?: Iterable<string>, title?: string}} [o]
 * @returns {string}
 */
export function otterSvg(o = {}) {
  const size = o.size ?? 120,
    pose = o.pose ?? 'wave';
  const gear = new Set(o.gear ?? ['headband']);
  // Deterministic clip-path ids (same gear ⇒ same geometry), so re-renders are identical.
  const id = [...gear].sort().join('-') || 'plain';
  const bust = pose === 'bust';
  const h = bust ? Math.round((size * 124) / 160) : size;
  return (
    `<svg width="${size}" height="${h}" viewBox="${bust ? '20 18 160 124' : '0 0 200 200'}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${o.title ?? 'Vidrichka'}">` +
    `${bust ? '' : body(gear, id)}${ARMS[pose] ?? ''}${head(gear, id)}${face(o.mood ?? 'happy', id)}</svg>`
  );
}
