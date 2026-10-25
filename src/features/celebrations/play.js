/**
 * The three celebration scenes, ported from the approved mockup (mockups/celebrations):
 * same timings, easings, keyframes, confetti and sound cues, driven by the Web Animations
 * API. Each scene resolves when it is over (BIG waits for "Tap to continue").
 * With reduced motion the scenes are shown still (no movement, no confetti) and fade out.
 * @module features/celebrations/play
 */
import { esc } from '../../ui/dom.js';
import { rig } from '../mascot/api.js';

/**
 * @typedef {object} Celebration
 * @property {'small'|'medium'|'big'} size
 * @property {string} [key] Merge key for the queue (e.g. 'water').
 * @property {string} title
 * @property {string} [sub]
 * @property {'drop'|'check'|'moon'|'egg'} [icon] SMALL: icon on the right.
 * @property {[number, number]} [progress] SMALL: progress bar from → to (0…1).
 * @property {() => {sub: string, pct: number}|null} [live] SMALL: read the text and bar from the
 *   current state while it is on screen (set counter while tapping fast).
 * @property {{text: string, tone?: string}[]} [chips] MEDIUM/BIG chips (tone: warm|ok|accent|g).
 * @property {string} [kicker] BIG: small line above the title (e.g. "LEVEL UP").
 * @property {string} [button] BIG: button label.
 * @property {boolean} [trophy] BIG: otter raises a trophy (default true).
 */

/** @typedef {(name: string, at: number) => void} Cue Schedule a sound `at` seconds from now. */

const EOB = 'cubic-bezier(.34,1.56,.64,1)',
  EO = 'cubic-bezier(.2,.8,.2,1)',
  EIO = 'cubic-bezier(.65,0,.35,1)';
const COLORS = ['#0B8F96', '#FF7A2F', '#F5B935', '#1FB46B', '#E5484D', '#7C5CFF', '#2BB8BE', '#F28C7C'];

/** Seeded LCG (same seeds as the mockup ⇒ same confetti). @param {number} s */
const rng = (s) => () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646;
const wait = (/** @type {number} */ s) => new Promise((r) => setTimeout(r, s * 1000));

/** Append HTML to a parent and return the new element. @param {string} h @param {Element} parent */
function el(h, parent) {
  const t = document.createElement('template');
  t.innerHTML = h.trim();
  return /** @type {HTMLElement} */ (parent.appendChild(/** @type {Node} */ (t.content.firstChild)));
}
const $ = (/** @type {Element} */ root, /** @type {string} */ sel) =>
  /** @type {HTMLElement} */ (root.querySelector(sel));

/**
 * Scene context: WAAPI helper `A` (a no-op with reduced motion) + sound cues.
 * @param {boolean} reduce @param {Cue} cue
 */
function stage(reduce, cue) {
  /** @type {Animation[]} */
  const all = [];
  /**
   * @param {Element} e @param {Keyframe[]} kf @param {number} dur seconds @param {number} [delay]
   * @param {{fill?: FillMode, e?: string, it?: number, dir?: PlaybackDirection}} [o]
   */
  const A = (e, kf, dur, delay = 0, o = {}) => {
    if (reduce || !e?.animate) return;
    all.push(
      e.animate(kf, {
        duration: dur * 1000,
        delay: delay * 1000,
        fill: o.fill || 'both',
        easing: o.e || EO,
        iterations: o.it || 1,
        direction: o.dir || 'normal',
      }),
    );
  };
  const stop = () => all.forEach((a) => a.cancel());
  return { A, cue, stop, reduce };
}

/** @param {() => number} r @param {Element} parent */
function piece(r, parent) {
  const c = COLORS[Math.floor(r() * COLORS.length)],
    k = r();
  return el(
    k < 0.45
      ? `<div class="cf" style="width:10px;height:5px;border-radius:2px;background:${c}"></div>`
      : k < 0.72
        ? `<div class="cf" style="width:7px;height:7px;border-radius:50%;background:${c}"></div>`
        : `<svg class="cf" width="18" height="8" viewBox="0 0 18 8"><path d="M1 5 q4 -6 8 0 t8 0" stroke="${c}" stroke-width="2.6" fill="none" stroke-linecap="round"/></svg>`,
    parent,
  );
}
const sparkleSvg = (/** @type {string} */ c, s = 22) =>
  `<svg viewBox="-12 -12 24 24" width="${s}" height="${s}"><path d="M0 -11 L3 -3 L11 0 L3 3 L0 11 L-3 3 L-11 0 L-3 -3Z" fill="${c}"/></svg>`;

/** @type {Record<string, string>} */
const ICONS = {
  drop: '<div class="drop"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11z" fill="#2f80ed"/><path d="M9.5 14.5a2.6 2.6 0 0 0 2.5 2.6" stroke="#fff" stroke-width="2" fill="none" stroke-linecap="round"/></svg></div>',
  check:
    '<div class="drop ok"><svg width="20" height="20" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" fill="#1fb46b"/><path d="m7.5 12.5 3 3 6-6.5" stroke="#fff" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg></div>',
  egg: '<div class="drop ok"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M12 3c3.5 0 6.5 6 6.5 10a6.5 6.5 0 0 1-13 0C5.5 9 8.5 3 12 3z" fill="#f5b935"/><circle cx="12" cy="14" r="2.6" fill="#fff" opacity=".8"/></svg></div>',
  moon: '<div class="drop night"><svg width="20" height="20" viewBox="0 0 24 24"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="#7c5cff"/></svg></div>',
};

const chipsHtml = (/** @type {Celebration['chips']} */ chips = []) =>
  chips.map((c) => `<span class="chip ${esc(c.tone ?? '')}">${esc(c.text)}</span>`).join('');

/** SMALL (~1.4 s): bounce, wave, wink, sparkles. @param {Element} host @param {Celebration} c @param {ReturnType<typeof stage>} s */
async function small(host, c, { A, cue, reduce }) {
  const [p0, p1] = c.progress ?? [0, 0];
  const root = el(
    `<div class="abs" style="inset:0"><div class="toastc" role="status">
    <div class="oslot"><div class="ob" style="position:absolute;left:0;bottom:0;transform-origin:50% 92%">${rig({ w: 100, mood: 'happy', armL: -130, armR: -10 })}</div></div>
    <div style="flex:1;min-width:0"><div class="t1">${esc(c.title)}</div>${c.sub ? `<div class="t2">${esc(c.sub)}</div>` : ''}${
      c.progress ? `<div class="pbar"><i style="width:${Math.round(p1 * 100)}%"></i></div>` : ''
    }</div>${ICONS[c.icon ?? 'check'] ?? ''}
  </div></div>`,
    host,
  );
  const card = $(root, '.toastc'),
    ob = $(root, '.ob'),
    svg = $(root, 'svg');
  A(
    card,
    [
      { transform: 'translateY(150px)', opacity: 0 },
      { transform: 'translateY(0)', opacity: 1 },
    ],
    0.26,
    0,
    { e: EOB },
  );
  A(
    card,
    [
      { transform: 'translateY(0)', opacity: 1 },
      { transform: 'translateY(150px)', opacity: 0 },
    ],
    0.26,
    1.1,
    {
      fill: 'forwards',
      e: 'cubic-bezier(.5,0,.75,0)',
    },
  );
  A(
    ob,
    [
      { transform: 'translateY(0) scale(1,1)' },
      { offset: 0.14, transform: 'translateY(0) scale(1.1,.88)' },
      { offset: 0.36, transform: 'translateY(-26px) scale(.94,1.08)' },
      { offset: 0.56, transform: 'translateY(0) scale(1.08,.9)' },
      { offset: 0.72, transform: 'translateY(-10px) scale(.98,1.03)' },
      { offset: 0.86, transform: 'translateY(0) scale(1.03,.97)' },
      { transform: 'translateY(0) scale(1,1)' },
    ],
    0.78,
    0.12,
    { e: 'ease-in-out' },
  );
  A($(svg, '.o-smile'), [{ opacity: 1 }, { opacity: 0 }], 0.08, 0.18);
  A($(svg, '.o-open'), [{ opacity: 0 }, { opacity: 1 }], 0.08, 0.18);
  A(
    $(svg, '.o-armR'),
    [
      { transform: 'rotate(-10deg)' },
      { offset: 0.3, transform: 'rotate(-34deg)' },
      { offset: 0.6, transform: 'rotate(6deg)' },
      { transform: 'rotate(-24deg)' },
    ],
    0.7,
    0.14,
    { e: 'ease-in-out' },
  );
  A(
    $(svg, '.o-eyeR'),
    [
      { transform: 'scaleY(1)' },
      { offset: 0.18, transform: 'scaleY(.05)' },
      { offset: 0.8, transform: 'scaleY(.05)' },
      { transform: 'scaleY(1)' },
    ],
    0.45,
    0.5,
  );
  A(
    $(svg, '.o-wink'),
    [{ opacity: 0 }, { offset: 0.18, opacity: 1 }, { offset: 0.8, opacity: 1 }, { opacity: 0 }],
    0.45,
    0.5,
  );
  A(
    $(svg, '.o-tail'),
    [
      { transform: 'rotate(0)' },
      { transform: 'rotate(-10deg)' },
      { transform: 'rotate(6deg)' },
      { transform: 'rotate(0)' },
    ],
    0.6,
    0.2,
  );
  if (c.progress) A($(root, '.pbar i'), [{ width: `${p0 * 100}%` }, { width: `${p1 * 100}%` }], 0.4, 0.25);
  if (!reduce)
    /** @type {[number, number, string, number][]} */ ([
      [18, 30, '#F5B935', 1],
      [92, 18, '#2BB8BE', 0.8],
      [104, 62, '#F5B935', 0.9],
      [6, 78, '#FF7A2F', 0.7],
      [58, 2, '#F5B935', 1.1],
      [86, 96, '#7C5CFF', 0.6],
    ]).forEach(([x, y, col, sc], i) => {
      const sp = el(`<div class="spark" style="left:${x}px;top:${y}px">${sparkleSvg(col)}</div>`, $(root, '.oslot'));
      A(
        sp,
        [
          { transform: 'scale(0) rotate(0)', opacity: 1 },
          { offset: 0.45, transform: `scale(${1.25 * sc}) rotate(45deg)`, opacity: 1 },
          { transform: 'scale(0) rotate(90deg)', opacity: 0.6 },
        ],
        0.5,
        0.22 + i * 0.07,
        { e: 'ease-out' },
      );
    });
  cue('hello', 0.1);
  await wait(reduce ? 1.8 : 1.4);
  root.remove();
}

/** MEDIUM (~2.2 s): clapping + confetti. @param {Element} host @param {Celebration} c @param {ReturnType<typeof stage>} s */
async function medium(host, c, { A, cue, reduce }) {
  const root = el(
    `<div class="abs" style="inset:0"><div class="dim"></div><div class="frame"><div class="mcard" role="status">
    <div class="halo"></div><div class="oslot"><div class="mb" style="transform-origin:50% 92%">${rig({ w: 180, mood: 'excited', armsFront: true })}</div></div>
    <div class="mtitle">${esc(c.title)}</div>${c.sub ? `<div class="msub">${esc(c.sub)}</div>` : ''}
    <div class="mchips">${chipsHtml(c.chips)}</div>
  </div><div class="cfwrap abs" style="inset:0"></div></div></div>`,
    host,
  );
  const dim = $(root, '.dim'),
    card = $(root, '.mcard'),
    svg = $(root, 'svg'),
    mb = $(root, '.mb');
  A(dim, [{ opacity: 0 }, { opacity: 1 }], 0.25, 0);
  A(dim, [{ opacity: 1 }, { opacity: 0 }], 0.3, 1.85, { fill: 'forwards' });
  A(
    card,
    [
      { transform: 'translateY(60px) scale(.82)', opacity: 0 },
      { transform: 'none', opacity: 1 },
    ],
    0.42,
    0.02,
    { e: EOB },
  );
  A(
    card,
    [
      { transform: 'none', opacity: 1 },
      { transform: 'translateY(30px) scale(.94)', opacity: 0 },
    ],
    0.3,
    1.85,
    {
      fill: 'forwards',
      e: 'ease-in',
    },
  );
  const clapK = (/** @type {number} */ s) => [
    { transform: 'rotate(0deg)' },
    { offset: 0.16, transform: `rotate(${s * 98}deg)` },
    { offset: 0.3, transform: `rotate(${s * 52}deg)` },
    { offset: 0.46, transform: `rotate(${s * 92}deg)` },
    { offset: 0.6, transform: `rotate(${s * 52}deg)` },
    { offset: 0.76, transform: `rotate(${s * 92}deg)` },
    { offset: 0.88, transform: `rotate(${s * -12}deg)` },
    { transform: 'rotate(0deg)' },
  ];
  A($(svg, '.o-armL'), clapK(1), 1.2, 0.32, { e: 'ease-in-out' });
  A($(svg, '.o-armR'), clapK(-1), 1.2, 0.32, { e: 'ease-in-out' });
  A(
    mb,
    [
      { transform: 'translateY(0) scale(1)' },
      { offset: 0.16, transform: 'translateY(-6px) scale(1.02,.98)' },
      { offset: 0.3, transform: 'translateY(0) scale(1)' },
      { offset: 0.46, transform: 'translateY(-6px) scale(1.02,.98)' },
      { offset: 0.6, transform: 'translateY(0)' },
      { offset: 0.76, transform: 'translateY(-10px) scale(1.03,.97)' },
      { transform: 'translateY(0)' },
    ],
    1.2,
    0.32,
    { e: 'ease-in-out' },
  );
  A(
    $(svg, '.o-head'),
    [
      { transform: 'rotate(0)' },
      { offset: 0.25, transform: 'rotate(-5deg)' },
      { offset: 0.5, transform: 'rotate(4deg)' },
      { offset: 0.75, transform: 'rotate(-4deg)' },
      { transform: 'rotate(0)' },
    ],
    1.2,
    0.32,
    { e: 'ease-in-out' },
  );
  A($(svg, '.o-tail'), [{ transform: 'rotate(0)' }, { transform: 'rotate(-12deg)' }], 0.3, 0.3, {
    it: 6,
    dir: 'alternate',
    e: 'ease-in-out',
  });
  if (!reduce) {
    [0.19, 0.55, 0.91].forEach((t) => {
      const p = el(
        `<svg class="abs" style="left:65px;top:70px;overflow:visible" width="50" height="50" viewBox="-25 -25 50 50"><g stroke="#F5B935" stroke-width="3.5" stroke-linecap="round"><path d="M0 -12 V-20"/><path d="M10 -8 L16 -14"/><path d="M-10 -8 L-16 -14"/><path d="M13 2 L21 2"/><path d="M-13 2 L-21 2"/></g></svg>`,
        $(root, '.oslot'),
      );
      A(
        p,
        [
          { transform: 'scale(.4)', opacity: 0 },
          { offset: 0.2, opacity: 1 },
          { transform: 'scale(1.25)', opacity: 0 },
        ],
        0.28,
        0.32 + t,
      );
    });
    const r = rng(11),
      wrap = $(root, '.cfwrap');
    for (let i = 0; i < 80; i++) {
      const p = piece(r, wrap),
        x = r() * 400 - 5,
        d = 0.1 + r() * 0.75,
        dur = 1.25 + r() * 0.6,
        sway = (r() - 0.5) * 70,
        rot = (r() - 0.5) * 900,
        y0 = -30 - r() * 120;
      A(
        p,
        [
          { transform: `translate(${x}px,${y0}px) rotate(0deg)` },
          { offset: 0.5, transform: `translate(${x + sway}px,${y0 + 480}px) rotate(${rot / 2}deg)` },
          { transform: `translate(${x - sway * 0.5}px,${y0 + 1000}px) rotate(${rot}deg)` },
        ],
        dur,
        d,
        { e: 'cubic-bezier(.35,.1,.6,1)' },
      );
    }
  }
  cue('chime', 0.3);
  await wait(reduce ? 2.2 : 2.2);
  root.remove();
}

/** BIG: full-screen teal level-up with rays; waits for "Tap to continue". @param {Element} host @param {Celebration} c @param {ReturnType<typeof stage>} s */
/**
 * Big-scene title size: 62px like the mockup for short titles ("Level 5"), smaller for long
 * ones, and small enough that the longest word fits the 390px frame (no mid-word breaks).
 * @param {string} title
 */
export const titleSize = (title) =>
  Math.max(
    26,
    Math.min(
      title.length > 10 ? 40 : 62,
      Math.floor(330 / (0.8 * Math.max(...title.split(/\s+/).map((w) => w.length)))),
    ),
  );

async function big(host, c, { A, cue, reduce }) {
  const trophy = c.trophy ?? true;
  const root = el(
    `<div class="abs live" style="inset:0" role="dialog" aria-modal="true" aria-label="${esc(c.title)}">
    <div class="bigbg"></div>
    <div class="frame"><div class="rays"></div><div class="glow"></div><div class="stars"></div>
    <div class="bslot"><div class="bj" style="transform-origin:50% 95%"><div class="bs"><div class="bd" style="transform-origin:50% 95%">${rig(
      {
        w: 250,
        mood: 'excited',
        armR: trophy ? 125 : 0,
        armL: trophy ? 0 : -130,
        trophy,
        armRFront: true,
      },
    )}</div></div></div></div>
    <div class="cfwrap abs" style="inset:0;pointer-events:none"></div>
    <div class="btexts">${c.kicker ? `<div class="lvup">${esc(c.kicker)}</div>` : ''}<div class="lvtitle" style="font-size:${titleSize(c.title)}px">${esc(c.title)}</div>
      ${c.sub ? `<div class="lvsub">${esc(c.sub)}</div>` : ''}
      <div class="lvchips">${chipsHtml(c.chips)}</div></div>
    <button class="tapbtn" type="button">${esc(c.button ?? 'OK')}</button></div>
  </div>`,
    host,
  );
  const bg = $(root, '.bigbg'),
    svg = $(root, 'svg'),
    rays = $(root, '.rays'),
    glow = $(root, '.glow');
  A(bg, [{ clipPath: 'circle(0% at 50% 40%)' }, { clipPath: 'circle(120% at 50% 40%)' }], 0.5, 0, {
    e: 'cubic-bezier(.3,0,.2,1)',
  });
  A(rays, [{ transform: 'rotate(0deg)' }, { transform: 'rotate(360deg)' }], 24, 0, { it: Infinity, e: 'linear' });
  A(
    rays,
    [
      { opacity: 0, scale: 0.6 },
      { opacity: 1, scale: 1 },
    ],
    0.8,
    0.9,
  );
  A(
    glow,
    [
      { opacity: 0, transform: 'scale(.4)' },
      { opacity: 1, transform: 'scale(1.15)' },
      { opacity: 0.85, transform: 'scale(1)' },
    ],
    0.7,
    1.1,
  );
  A(glow, [{ opacity: 0.85 }, { opacity: 1 }], 1.2, 1.8, {
    it: Infinity,
    dir: 'alternate',
    e: 'ease-in-out',
    fill: 'forwards',
  });
  A(
    $(root, '.bj'),
    [
      { transform: 'translateY(640px) scale(.9,1.12)' },
      { offset: 0.55, transform: 'translateY(-70px) scale(.94,1.08)' },
      { offset: 0.78, transform: 'translateY(0) scale(1.14,.86)' },
      { offset: 0.9, transform: 'translateY(-8px) scale(.97,1.03)' },
      { transform: 'translateY(0) scale(1)' },
    ],
    0.75,
    0.1,
    { e: 'ease-out' },
  );
  A($(root, '.bs'), [{ transform: 'rotateY(0deg)' }, { transform: 'rotateY(360deg)' }], 0.6, 0.85, { e: EIO });
  if (trophy) {
    A(
      $(svg, '.o-armR'),
      [{ transform: 'rotate(125deg)' }, { offset: 0.7, transform: 'rotate(-8deg)' }, { transform: 'rotate(4deg)' }],
      0.45,
      1.2,
      {
        e: 'ease-out',
      },
    );
    A(
      $(svg, '.o-trophy'),
      [{ transform: 'scale(0)' }, { offset: 0.7, transform: 'scale(1.25)' }, { transform: 'scale(1)' }],
      0.4,
      1.3,
      { e: 'ease-out' },
    );
    A($(svg, '.o-glint'), [{ opacity: 0.2 }, { opacity: 0.9 }], 0.5, 1.8, {
      it: Infinity,
      dir: 'alternate',
      fill: 'forwards',
    });
  } else svg.querySelector('.o-armR')?.setAttribute('style', 'transform-origin:136px 138px;transform:rotate(-10deg)');
  if (reduce)
    svg.querySelector('.o-armR')?.setAttribute('style', 'transform-origin:136px 138px;transform:rotate(4deg)');
  A($(svg, '.o-armL'), [{ transform: 'rotate(-60deg)' }, { transform: 'rotate(0deg)' }], 0.4, 0.5, { e: EOB });
  const loop = /** @type {const} */ ({ it: Infinity, dir: 'alternate', e: 'ease-in-out', fill: 'forwards' });
  A(
    $(root, '.bd'),
    [
      { transform: 'rotate(-6deg) translateY(0)' },
      { offset: 0.5, transform: 'rotate(0deg) translateY(-12px)' },
      { transform: 'rotate(6deg) translateY(0)' },
    ],
    0.42,
    1.65,
    loop,
  );
  A($(svg, '.o-armL'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-16deg)' }], 0.42, 1.65, loop);
  A($(svg, '.o-head'), [{ transform: 'rotate(5deg)' }, { transform: 'rotate(-5deg)' }], 0.42, 1.65, loop);
  A($(svg, '.o-tail'), [{ transform: 'rotate(4deg)' }, { transform: 'rotate(-14deg)' }], 0.3, 0.9, {
    it: Infinity,
    dir: 'alternate',
    e: 'ease-in-out',
  });
  A($(svg, '.o-tie'), [{ transform: 'rotate(0deg)' }, { transform: 'rotate(-14deg)' }], 0.25, 0.2, {
    it: Infinity,
    dir: 'alternate',
    e: 'ease-in-out',
  });
  A(
    $(root, '.lvup'),
    [
      { opacity: 0, transform: 'translateY(10px)', letterSpacing: '.5em' },
      { opacity: 1, transform: 'none', letterSpacing: '.22em' },
    ],
    0.45,
    1.25,
  );
  A(
    $(root, '.lvtitle'),
    [
      { opacity: 0, transform: 'scale(.2) rotate(-8deg)' },
      { offset: 0.6, opacity: 1, transform: 'scale(1.18) rotate(3deg)' },
      { transform: 'scale(1) rotate(0)' },
    ],
    0.6,
    1.3,
    { e: 'ease-out' },
  );
  A($(root, '.lvtitle'), [{ transform: 'scale(1)' }, { transform: 'scale(1.05)' }], 0.6, 2.2, loop);
  A(
    $(root, '.lvsub'),
    [
      { opacity: 0, transform: 'translateY(12px)' },
      { opacity: 0.95, transform: 'none' },
    ],
    0.4,
    1.75,
  );
  root.querySelectorAll('.lvchips .chip').forEach((ch, i) =>
    A(
      ch,
      [
        { opacity: 0, transform: 'scale(.6)' },
        { opacity: 1, transform: 'none' },
      ],
      0.35,
      2.0 + i * 0.12,
      { e: EOB },
    ),
  );
  const tb = /** @type {HTMLButtonElement} */ ($(root, '.tapbtn'));
  A(
    tb,
    [
      { opacity: 0, transform: 'translateY(30px)' },
      { opacity: 1, transform: 'none' },
    ],
    0.4,
    2.4,
    { e: EOB },
  );
  A(
    tb,
    [
      { scale: 1, boxShadow: '0 10px 24px rgba(4,60,64,.25), 0 0 0 0 rgba(255,255,255,.5)' },
      { scale: 1.04, boxShadow: '0 10px 24px rgba(4,60,64,.25), 0 0 0 12px rgba(255,255,255,0)' },
    ],
    0.9,
    2.9,
    { it: Infinity, e: 'ease-out', fill: 'forwards' },
  );
  if (!reduce) {
    const r = rng(5),
      st = $(root, '.stars');
    for (let i = 0; i < 14; i++) {
      const x = 20 + r() * 350,
        y = 70 + r() * 560;
      if (x > 90 && x < 300 && y > 180 && y < 640) {
        i--;
        continue;
      }
      const s = el(
        `<div class="star" style="left:${x}px;top:${y}px">${sparkleSvg(r() < 0.6 ? '#FFE6A6' : '#ffffff', 14)}</div>`,
        st,
      );
      A(
        s,
        [
          { transform: 'scale(0)', opacity: 0 },
          { transform: 'scale(1) rotate(45deg)', opacity: 1 },
        ],
        0.6 + r() * 0.5,
        0.6 + r() * 1.2,
        {
          it: Infinity,
          dir: 'alternate',
          e: 'ease-in-out',
        },
      );
    }
    const cw = $(root, '.cfwrap'),
      cr = rng(23),
      cx = 195,
      cy = 330;
    for (let i = 0; i < 110; i++) {
      const p = piece(cr, cw),
        ang = cr() * Math.PI * 2,
        v = 380 + cr() * 620,
        vx = Math.cos(ang) * v,
        vy = Math.sin(ang) * v - 380,
        g = 1150,
        dur = 2.2 + cr() * 0.8,
        spin = (cr() - 0.5) * 1400,
        d = 1.25 + cr() * 0.12;
      /** @type {Keyframe[]} */
      const kf = [];
      const N = 14;
      for (let k = 0; k <= N; k++) {
        const tt = (k / N) * dur,
          drag = 1 - Math.exp(-2.2 * tt);
        const x = cx + (vx * drag) / 2.2,
          y = cy + (vy * drag) / 2.2 + 0.5 * g * tt * tt * 0.55;
        kf.push({
          offset: k / N,
          transform: `translate(${x.toFixed(1)}px,${y.toFixed(1)}px) rotate(${((spin * k) / N).toFixed(0)}deg) scale(${k === 0 ? 0.3 : 1})`,
          opacity: k === 0 ? 0 : k > N * 0.8 ? 1 - (k - N * 0.8) / (N * 0.2) : 1,
        });
      }
      A(p, kf, dur, d, { e: 'linear' });
    }
    for (let i = 0; i < 40; i++) {
      const p = piece(cr, cw),
        x = cr() * 400,
        y0 = -30 - cr() * 60,
        dur = 2.6 + cr() * 1.4,
        sway = (cr() - 0.5) * 60;
      A(
        p,
        [
          { transform: `translate(${x}px,${y0}px) rotate(0)` },
          { offset: 0.5, transform: `translate(${x + sway}px,${y0 + 450}px) rotate(300deg)` },
          { transform: `translate(${x}px,${y0 + 920}px) rotate(600deg)` },
        ],
        dur,
        2.0 + cr() * 2.5,
        { it: Infinity, e: 'linear' },
      );
    }
  }
  cue('whoosh', 0.08);
  cue('sparkle', 1.25);
  cue('squeal', 1.5);
  setTimeout(() => tb.focus({ preventScroll: true }), reduce ? 0 : 2400);
  await new Promise((done) => tb.addEventListener('click', done, { once: true }));
  if (!reduce)
    await root.animate(
      [
        { opacity: 1, transform: 'none' },
        { opacity: 0, transform: 'scale(1.04)' },
      ],
      { duration: 300, fill: 'forwards' },
    ).finished;
  root.remove();
}

const SCENES = { small, medium, big };

/**
 * Play one celebration in `host` and resolve when it is over.
 * @param {Element} host
 * @param {Celebration} c
 * @param {{reduce: boolean, cue: Cue}} o
 */
export async function playScene(host, c, o) {
  const s = stage(o.reduce, o.cue);
  const live = c.live;
  // Computed at render time and kept current while the toast is up (no stale "14 of 18").
  const tick = () => {
    const v = live?.();
    const t2 = host.querySelector('.toastc .t2'),
      bar = /** @type {HTMLElement|null} */ (host.querySelector('.toastc .pbar i'));
    if (!v) return;
    if (t2 && t2.textContent !== v.sub) t2.textContent = v.sub;
    if (bar) bar.style.width = `${Math.round(v.pct * 100)}%`;
  };
  const v0 = live?.();
  if (v0) c = { ...c, sub: v0.sub };
  const iv = live ? setInterval(tick, 120) : 0;
  try {
    await SCENES[c.size](host, c, s);
  } finally {
    clearInterval(iv);
    s.stop();
  }
}
