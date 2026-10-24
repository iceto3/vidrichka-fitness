/**
 * Animatable Vidrichka — the otter from `otter.js` split into named groups (arms, head,
 * eyes, mouth, tail, tie, trophy) so celebrations can move them with the Web Animations
 * API. Ported 1:1 from the approved celebrations mockup. Every group carries its own
 * `transform-origin`; `.otter-svg *{transform-box:view-box}` makes those origins work.
 * Also draws the sleeping (curled up under a blanket) otter for the goodnight ritual.
 * @module features/mascot/rig
 */

const O = '#8A5A3B',
  D = '#6B4127',
  L = '#F2D7B6',
  ACC = '#14A3A8',
  ACCD = '#0B7F86';

const limb = (/** @type {string} */ d) =>
  `<path d="${d}" stroke="${O}" stroke-width="20" stroke-linecap="round" fill="none"/>`;
const paw = (/** @type {number} */ x, /** @type {number} */ y) => `<circle cx="${x}" cy="${y}" r="11" fill="${O}"/>`;

const TROPHY = `<g class="o-trophy" style="transform-origin:164px 96px"><path d="M147 52 q-12 0 -11 10 q1 9 14 11" stroke="#E3A21A" stroke-width="4" fill="none"/><path d="M181 52 q12 0 11 10 q-1 9 -14 11" stroke="#E3A21A" stroke-width="4" fill="none"/><path d="M146 46 h36 v10 q0 22 -18 26 q-18 -4 -18 -26z" fill="#F5B935" stroke="#E3A21A" stroke-width="2.5" stroke-linejoin="round"/><path d="M153 52 v6 q0 10 6 16" stroke="#fff" stroke-width="3.5" fill="none" stroke-linecap="round" opacity=".6" class="o-glint"/><path d="M164 55 l2.2 4.6 5 .7 -3.6 3.5 .9 5 -4.5-2.4 -4.5 2.4 .9-5 -3.6-3.5 5-.7z" fill="#fff"/><rect x="160" y="81" width="8" height="9" fill="#E3A21A"/><rect x="152" y="88" width="24" height="8" rx="3" fill="#8A5A3B"/><rect x="152" y="88" width="24" height="3" rx="1.5" fill="#F5B935"/></g>`;

/** Four-point sparkle star path. @param {number} x @param {number} y @param {number} s @param {string} c */
export const star4 = (x, y, s, c) =>
  `<path d="M${x} ${y - s} l${s * 0.3} ${s * 0.7} ${s * 0.7} ${s * 0.3} ${-s * 0.7} ${s * 0.3} ${-s * 0.3} ${s * 0.7} ${-s * 0.3} ${-s * 0.7} ${-s * 0.7} ${-s * 0.3} ${s * 0.7} ${-s * 0.3}z" fill="${c}"/>`;

/**
 * @typedef {object} RigOptions
 * @property {number} [w] Width in px (height follows the 260×240 viewBox).
 * @property {string[]} [gear] headband | tank
 * @property {'happy'|'excited'|'sleepy'} [mood] excited = open mouth; sleepy = closed eyes.
 * @property {number} [armL] Start rotation of the left arm (deg; negative = raised).
 * @property {number} [armR] Start rotation of the right arm.
 * @property {boolean} [trophy] Right paw holds a trophy.
 * @property {boolean} [armRFront] Draw the right arm in front of the head.
 * @property {boolean} [armsFront] Draw both arms in front of the head (clapping).
 * @property {string} [title] Accessible name.
 */

/**
 * The rigged otter SVG (string).
 * @param {RigOptions} [o]
 */
export function otterRig({
  w = 120,
  gear = ['headband'],
  mood = 'happy',
  armL = 0,
  armR = 0,
  trophy = false,
  armRFront = false,
  armsFront = false,
  title = 'Vidrichka',
} = {}) {
  const g = new Set(gear),
    h = Math.round((w * 240) / 260),
    id = `r${[...g].sort().join('')}`; // deterministic: re-renders stay identical
  const bodyS =
    `<g class="o-tail" style="transform-origin:140px 168px"><path d="M134 176 Q184 184 190 140 Q191 126 182 122 Q176 160 130 158 Z" fill="${D}"/></g><ellipse cx="100" cy="152" rx="46" ry="42" fill="${O}"/>` +
    (g.has('tank')
      ? `<clipPath id="bc${id}"><ellipse cx="100" cy="152" rx="46" ry="42"/></clipPath><g clip-path="url(#bc${id})"><path d="M54 132 Q76 140 82 124 L118 124 Q124 140 146 132 L150 200 L50 200Z" fill="${ACC}"/><path d="M60 170 L140 170" stroke="#fff" stroke-width="5" opacity=".85"/></g>`
      : `<ellipse cx="100" cy="160" rx="29" ry="30" fill="${L}"/>`) +
    `<ellipse cx="78" cy="191" rx="15" ry="8" fill="${D}"/><ellipse cx="122" cy="191" rx="15" ry="8" fill="${D}"/>`;
  const armLS = `<g class="o-armL" style="transform-origin:64px 138px;transform:rotate(${armL}deg)">${limb('M64 138 Q42 122 36 98')}${paw(36, 96)}</g>`;
  const armRS = `<g class="o-armR" style="transform-origin:136px 138px;transform:rotate(${armR}deg)">${trophy ? TROPHY : ''}${limb('M136 138 Q158 122 164 98')}${paw(164, 96)}</g>`;
  const headS =
    `<circle cx="52" cy="58" r="11" fill="${O}"/><circle cx="53" cy="58" r="5.5" fill="${D}"/><circle cx="148" cy="58" r="11" fill="${O}"/><circle cx="147" cy="58" r="5.5" fill="${D}"/><clipPath id="hc${id}"><ellipse cx="100" cy="82" rx="56" ry="45"/></clipPath><ellipse cx="100" cy="82" rx="56" ry="45" fill="${O}"/>` +
    (g.has('headband')
      ? `<g clip-path="url(#hc${id})"><rect x="40" y="46" width="120" height="14" fill="${ACC}"/><rect x="40" y="56" width="120" height="4" fill="${ACCD}" opacity=".5"/></g><g class="o-tie" style="transform-origin:150px 54px"><path d="M150 52 q14 -6 20 -16 q-2 12 -14 22 z" fill="${ACC}"/><path d="M151 56 q16 2 24 -4 q-6 10 -22 10 z" fill="${ACCD}"/></g>`
      : '');
  const ex = mood === 'excited',
    sl = mood === 'sleepy';
  const faceS =
    `<ellipse cx="100" cy="101" rx="42" ry="25" fill="${L}"/><ellipse cx="78" cy="76" rx="15" ry="13" fill="${L}" opacity=".35"/><ellipse cx="122" cy="76" rx="15" ry="13" fill="${L}" opacity=".35"/>` +
    `<g class="o-eyeL" style="transform-origin:78px 80px"${sl ? ' opacity="0"' : ''}><ellipse cx="78" cy="80" rx="7.5" ry="8" fill="#1E1410"/><circle cx="80.5" cy="77" r="2.6" fill="#fff"/></g>` +
    `<g class="o-eyeR" style="transform-origin:122px 81px"${sl ? ' opacity="0"' : ''}><ellipse cx="122" cy="80" rx="7.5" ry="8" fill="#1E1410"/><circle cx="124.5" cy="77" r="2.6" fill="#fff"/></g>` +
    `<path class="o-wink" d="M114 82 q8 -8 16 0" stroke="#1E1410" stroke-width="3.6" fill="none" stroke-linecap="round" opacity="0"/>` +
    `<path class="o-shut" d="M70 80 q8 6 16 0 M114 80 q8 6 16 0" stroke="#1E1410" stroke-width="3.6" fill="none" stroke-linecap="round" opacity="${sl ? 1 : 0}"/>` +
    `<ellipse class="o-blush" cx="64" cy="94" rx="7" ry="4.5" fill="#F28C7C" opacity=".55"/><ellipse class="o-blush" cx="136" cy="94" rx="7" ry="4.5" fill="#F28C7C" opacity=".55"/>` +
    `<ellipse cx="100" cy="92" rx="10" ry="7" fill="#2A1A12"/><ellipse cx="97" cy="90" rx="3" ry="1.8" fill="#fff" opacity=".55"/>` +
    `<g class="o-smile" opacity="${ex ? 0 : 1}"><path d="M100 99 v3 M91 103 q4.5 5 9 0 q4.5 5 9 0" stroke="#2A1A12" stroke-width="2.6" fill="none" stroke-linecap="round"/></g>` +
    `<g class="o-open" opacity="${ex ? 1 : 0}"><path d="M100 99 v2" stroke="#2A1A12" stroke-width="2.6"/><path d="M89 102 q11 14 22 0 z" fill="#2A1A12"/><path d="M94 106 q6 5 12 0" fill="#F28C7C"/></g>` +
    `<g class="o-yawn" style="transform-origin:100px 106px" opacity="0"><ellipse cx="100" cy="108" rx="8" ry="10" fill="#2A1A12"/><ellipse cx="100" cy="113" rx="5" ry="3.5" fill="#F28C7C"/></g>` +
    `<g stroke="#5A3622" stroke-width="1.8" stroke-linecap="round" opacity=".75"><path d="M80 101 L50 95 M80 106 L51 110"/><path d="M120 101 L150 95 M120 106 L149 110"/></g>`;
  const front = armRFront || armsFront;
  return `<svg class="otter-svg" width="${w}" height="${h}" viewBox="-30 -30 260 240" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}"><g class="o-all" style="transform-origin:100px 199px">${bodyS}${armsFront ? '' : armLS}${front ? '' : armRS}<g class="o-head" style="transform-origin:100px 125px">${headS}${faceS}</g>${armsFront ? armLS : ''}${front ? armRS : ''}</g></svg>`;
}

/**
 * Vidrichka asleep: curled up on a pillow under a teal blanket (goodnight ritual).
 * `.o-blanket` can be animated (slides up), `.o-breathe` gently rises and falls.
 * @param {{w?: number, title?: string}} [o]
 */
export function sleepingOtter({ w = 240, title = 'Vidrichka' } = {}) {
  const h = Math.round((w * 200) / 280);
  return `<svg class="otter-svg sleeping" width="${w}" height="${h}" viewBox="-20 0 280 200" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${title}">
<ellipse cx="120" cy="186" rx="118" ry="10" fill="#000" opacity=".18"/>
<rect x="6" y="104" width="96" height="44" rx="22" fill="#E8EEF6"/><path d="M20 112 q30 -8 70 0" stroke="#fff" stroke-width="4" fill="none" opacity=".7" stroke-linecap="round"/>
<g class="o-breathe" style="transform-origin:140px 180px">
<path d="M196 150 Q236 154 236 124 Q236 112 226 110 Q222 140 192 140 Z" fill="${D}"/>
<ellipse cx="140" cy="146" rx="78" ry="38" fill="${O}"/>
<g class="o-head" style="transform-origin:70px 118px">
<circle cx="40" cy="86" r="10" fill="${O}"/><circle cx="41" cy="86" r="5" fill="${D}"/><circle cx="104" cy="84" r="10" fill="${O}"/><circle cx="103" cy="84" r="5" fill="${D}"/>
<ellipse cx="72" cy="110" rx="46" ry="37" fill="${O}"/>
<ellipse cx="72" cy="126" rx="34" ry="19" fill="${L}"/>
<path d="M50 108 q7 6 14 0 M80 108 q7 6 14 0" stroke="#1E1410" stroke-width="3.4" fill="none" stroke-linecap="round"/>
<ellipse cx="46" cy="121" rx="6" ry="4" fill="#F28C7C" opacity=".55"/><ellipse cx="98" cy="121" rx="6" ry="4" fill="#F28C7C" opacity=".55"/>
<ellipse cx="72" cy="119" rx="8" ry="5.5" fill="#2A1A12"/><path d="M66 128 q6 4 12 0" stroke="#2A1A12" stroke-width="2.4" fill="none" stroke-linecap="round"/>
</g></g>
<g class="o-blanket" style="transform-origin:150px 190px">
<path d="M84 140 Q120 120 170 126 Q226 130 238 160 Q240 186 214 188 L96 188 Q78 186 80 164 Z" fill="${ACC}"/>
<path d="M84 140 Q120 120 170 126 Q226 130 238 160" stroke="${ACCD}" stroke-width="8" fill="none" stroke-linecap="round"/>
<g fill="#fff" opacity=".35"><circle cx="128" cy="156" r="4"/><circle cx="160" cy="168" r="4"/><circle cx="196" cy="154" r="4"/><circle cx="112" cy="176" r="4"/><circle cx="214" cy="176" r="4"/><circle cx="176" cy="146" r="3"/></g>
<ellipse cx="96" cy="150" rx="11" ry="9" fill="${O}"/>
</g></svg>`;
}
