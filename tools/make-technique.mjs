/**
 * Generates the exercise technique content from the verified source cards
 * (`<key>.md` + `<key>.svg` per exercise, see /workspace/exercise-styles/final/VERIFICATION.md).
 *
 * Outputs (committed, regenerate only when the source cards change):
 *  - src/data/technique.js           structured, verified technique text per exercise id
 *  - src/data/figures/<id>.js        the two illustration frames (optimized inline SVG, lazy chunk)
 *  - src/data/figure-thumbs.js       small, marker-free thumbnails (frame 2, cropped)
 *  - src/features/library/figure.css the illustration palette (light + `.dark`), scoped to `.vf`
 *
 * The cards' frame captions and marker legends become HTML (readable on a phone, Bulgarian
 * font), so the SVGs keep only drawings + numbered markers. Ids inside every SVG are
 * prefixed per exercise/frame so several inline SVGs never clash.
 *
 * Usage: node tools/make-technique.mjs [sourceDir]   (needs Chromium for the thumbnail crop)
 * @module tools/make-technique
 */
import { existsSync } from 'node:fs';
import { mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { optimize } from 'svgo';
import { chromium } from 'playwright-core';
import { format, resolveConfig } from 'prettier';

const root = fileURLToPath(new URL('..', import.meta.url));
/** Write a file formatted like the rest of the repo. @param {string} file @param {string} src */
const put = async (file, src) => writeFile(file, await format(src, { ...(await resolveConfig(file)), filepath: file }));
const SRC = process.argv[2] ?? '/workspace/exercise-styles/final';
const { EXERCISES } = await import(join(root, 'src/data/exercises.js'));

/** Gendered Bulgarian text: "изправена/изправен" → { f, m }. @param {string} s */
const gender = (s) => {
  const re = /([А-Яа-я]+)\/([А-Яа-я]+)/g;
  if (!re.test(s)) return s;
  return { f: s.replace(re, '$1'), m: s.replace(re, '$2') };
};

/** @param {string} md */
function parseMd(md) {
  const id = /`id: ([a-z_]+)`/.exec(md)?.[1];
  /** @type {Record<string, string[]>} */
  const sec = {};
  let cur = '';
  for (const line of md.split('\n')) {
    const h = /^## (.+)$/.exec(line);
    if (h) {
      cur = h[1].trim();
      sec[cur] = [];
    } else if (cur && line.trim()) sec[cur].push(line);
  }
  const items = (/** @type {string} */ k) =>
    (sec[k] ?? []).filter((l) => /^(- |\d+\. )/.test(l)).map((l) => l.replace(/^(- |\d+\. )/, '').trim());
  const need = (/** @type {string} */ k) => {
    const v = items(k);
    if (!v.length) throw new Error(`${id}: section "${k}" is empty`);
    return v;
  };
  const mistakes = (sec['Чести грешки → как да ги избегнеш'] ?? [])
    .filter((l) => l.startsWith('|') && !/^\|\s*-/.test(l) && !/^\|\s*Грешка\s*\|/.test(l))
    .map((l) => {
      const [mistake, fix] = l
        .split('|')
        .slice(1, -1)
        .map((c) => c.trim());
      if (!mistake || !fix) throw new Error(`${id}: bad mistake row ${l}`);
      return { mistake: gender(mistake), fix: gender(fix) };
    });
  if (!mistakes.length) throw new Error(`${id}: no mistakes`);
  const muscles = need('Работещи мускули').map((l) => {
    const m = /^\*\*(.+?):\*\*\s*(.+)$/.exec(l);
    if (!m) throw new Error(`${id}: bad muscle line ${l}`);
    return { role: m[1], text: m[2] };
  });
  const sources = need('Източници').map((l) => {
    const m = /^(.*?)[:\s]*(https?:\/\/\S+)\s*$/.exec(l);
    return m ? { text: m[1].trim(), url: m[2] } : { text: l };
  });
  return {
    id,
    setup: need('Изходна позиция').map(gender),
    steps: need('Изпълнение').map(gender),
    breathing: need('Дишане').map(gender),
    keyPoints: need('Ключови точки').map(gender),
    mistakes,
    muscles,
    sources,
  };
}

/** Balanced `<g …>…</g>` starting at index i. @param {string} s @param {number} i */
function groupAt(s, i) {
  const re = /<g\b[^>]*?(\/?)>|<\/g>/g;
  re.lastIndex = i;
  let depth = 0;
  for (let m; (m = re.exec(s));) {
    if (m[0] === '</g>') depth--;
    else if (!m[1]) depth++;
    if (depth === 0) return s.slice(i, re.lastIndex);
  }
  throw new Error('unbalanced <g>');
}
const inner = (/** @type {string} */ g) => g.slice(g.indexOf('>') + 1, -4);
const text = (/** @type {string} */ s) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();

/** Prefix every id (and its references) with p. @param {string} s @param {string} p */
const prefixIds = (s, p) => {
  const ids = [...s.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids)
    s = s
      .replaceAll(`id="${id}"`, `id="${p}${id}"`)
      .replaceAll(`url(#${id})`, `url(#${p}${id})`)
      .replaceAll(`href="#${id}"`, `href="#${p}${id}"`);
  return s;
};

/** @param {string} svg @param {number} precision */
const svgo = (svg, precision) =>
  optimize(svg, {
    multipass: true,
    floatPrecision: precision,
    plugins: [
      { name: 'preset-default', params: { overrides: { cleanupIds: false, inlineStyles: false } } },
      'removeXMLNS', // inline in HTML only
    ],
  }).data;

/** The card's two frames: drawing (SVG), caption and marker legend. @param {string} svg @param {string} id */
function splitCard(svg, id) {
  const defs = /<defs>[\s\S]*?<\/defs>/.exec(svg)?.[0] ?? '';
  return [16, 364].map((x, f) => {
    const at = svg.indexOf(`<g transform="translate(${x} 52)">`);
    if (at < 0) throw new Error(`${id}: frame ${f + 1} not found`);
    const g = inner(groupAt(svg, at));
    const clip = groupAt(g, g.indexOf('<g clip-path='));
    const rest = g.slice(g.indexOf(clip) + clip.length);
    const label = text(/<text class="plt"[^>]*>([\s\S]*?)<\/text>/.exec(rest)?.[1] ?? '');
    const leg = /<text[^>]*class="c-leg"[^>]*>([\s\S]*?)<\/text>/.exec(rest)?.[1] ?? '';
    const legend = leg
      .split(/<tspan class="c-legn"[^>]*>\d+<\/tspan>/)
      .slice(1)
      .map(text);
    const markers = (clip.match(/class="c-cot"/g) ?? []).length;
    if (!label || legend.length !== markers || !markers)
      throw new Error(`${id} frame ${f + 1}: label "${label}", ${legend.length} legend items, ${markers} markers`);
    // The panel gradient is referenced from the markup (not from CSS), so svgo keeps it and
    // its id can be prefixed like every other one.
    const body = clip.replace('<rect class="pn"', '<rect class="pn" fill="url(#pg)"');
    const full = `<svg xmlns="http://www.w3.org/2000/svg" class="vf" viewBox="0 0 340 292" aria-hidden="true" focusable="false">${defs}${body}</svg>`;
    return { label, legend, svg: prefixIds(full, `${id.replace(/_/g, '')}${f + 1}-`) };
  });
}

/** Marker-free, panel-free copy of a frame for thumbnails. @param {string} svg */
const thumbSource = (svg) =>
  svg
    .replace(/<rect class="pn"[^>]*\/>/, '')
    .replace(/<rect class="fl"[^>]*\/>/, '')
    .replace(/<line class="c-lead"[^>]*\/>/g, '')
    .replace(/<path class="c-guide"[^>]*\/>/g, '')
    .replace(/<circle[^>]*class="c-co"[^>]*\/>/g, '')
    .replace(/<text class="c-cot"[^>]*>[^<]*<\/text>/g, '');

/** CSS of the cards, scoped to `.vf`; dark palette under the app's `html.dark`. @param {string} css */
function scopedCss(css) {
  const drop = new Set(['.pn', '.bg', '.t1', '.t2', '.pl', '.plt', '.c-leg', '.c-legn']);
  css = css.replace(/@media \(prefers-color-scheme:dark\)\{[^{}]*\{[^{}]*\}\}/, '');
  const out = [];
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const sels = m[1]
      .split(',')
      .map((s) => s.trim())
      .filter((s) => !drop.has(s) && !/\.plt$/.test(s));
    if (!sels.length) continue;
    const scoped = sels.map((s) =>
      s === '.vf' ? '.vf' : s === '.dark .vf' || s === '.vf.dark' ? s : s.startsWith('.vf') ? s : `.vf ${s}`,
    );
    const body = m[2].replace(/font-family:[^;}]+;?/, 'font-family:inherit;');
    out.push(`${[...new Set(scoped)].join(',\n')} {\n  ${body.split(';').filter(Boolean).join(';\n  ')};\n}`);
  }
  return out.join('\n');
}

const files = await readdir(SRC);
const byId = new Map();
for (const f of files.filter((n) => n.endsWith('.md') && n !== 'VERIFICATION.md')) {
  const key = f.slice(0, -3);
  const t = parseMd(await readFile(join(SRC, f), 'utf8'));
  if (!t.id || t.id !== key.replace(/-/g, '_')) throw new Error(`${f}: id ${t.id} ≠ file key`);
  byId.set(t.id, { key, ...t });
}
const ids = EXERCISES.map((/** @type {{id: string}} */ e) => e.id);
const missing = ids.filter((/** @type {string} */ i) => !byId.has(i));
const extra = [...byId.keys()].filter((i) => !ids.includes(i));
if (missing.length || extra.length) throw new Error(`id mismatch: missing ${missing} extra ${extra}`);

const figDir = join(root, 'src/data/figures');
await rm(figDir, { recursive: true, force: true });
await mkdir(figDir, { recursive: true });

const browser = await chromium.launch(
  (() => {
    const exe = process.env.CHROME_PATH ?? ['/usr/bin/google-chrome', '/usr/bin/chromium'].find((p) => existsSync(p));
    return exe ? { executablePath: exe, args: ['--no-sandbox'] } : {};
  })(),
);
const page = await browser.newPage();
let style = '';
/** @type {Record<string, any>} */
const technique = {};
/** @type {Record<string, string>} */
const thumbs = {};
const sizes = [];
for (const id of ids) {
  const t = byId.get(id);
  const card = await readFile(join(SRC, `${t.key}.svg`), 'utf8');
  style ||= /<style>([\s\S]*?)<\/style>/.exec(card)?.[1] ?? '';
  const frames = splitCard(card, id);
  const out = frames.map((fr) => svgo(fr.svg, 1));
  // Thumbnail: frame 2 without panel/markers, cropped to the drawing's bounding box.
  await page.setContent(`<style>${style}</style>${thumbSource(frames[1].svg)}`);
  const bb = await page.evaluate(() => {
    const b = /** @type {SVGGraphicsElement} */ (document.querySelector('svg > g')).getBBox();
    return [b.x, b.y, b.width, b.height];
  });
  const pad = 6;
  const side = Math.max(bb[2] * (48 / 56), bb[3]) + pad * 2; // fill a 56×48 box
  const w = (side * 56) / 48;
  const vb = [bb[0] + bb[2] / 2 - w / 2, bb[1] + bb[3] / 2 - side / 2, w, side].map((n) => Math.round(n));
  const th = svgo(
    prefixIds(
      thumbSource(frames[1].svg)
        .replace(/ viewBox="[^"]*"/, ` viewBox="${vb.join(' ')}"`)
        .replace(/<clipPath[\s\S]*?<\/clipPath>/, '')
        .replace(/ clip-path="url\(#[^)]*\)"/, ''),
      't',
    ),
    0,
  );
  thumbs[id] = th;
  const { key: _key, id: _id, ...content } = t;
  technique[id] = { ...content, frames: frames.map(({ label, legend }) => ({ label, legend })) };
  await put(
    join(figDir, `${id}.js`),
    `// Generated by tools/make-technique.mjs from ${t.key}.svg – do not edit.\n/** Two illustration frames (inline SVG). */\nexport default ${JSON.stringify(out)};\n`,
  );
  sizes.push({ id, source: card.length, frames: out.join('').length, thumb: th.length });
}
await browser.close();

const header = `/**
 * Verified exercise technique (generated by tools/make-technique.mjs from the reviewed cards;
 * sources: NSCA, ACE, ExRx – see each exercise's \`sources\`). Do not edit by hand.
 * Texts are Bulgarian; \`**bold**\` / \`*italic*\` are rendered by features/library/figure.js;
 * a \`{ f, m }\` value is a grammatical-gender variant (core/i18n \`L()\`).
 * @module data/technique
 */

/** @typedef {string | {f: string, m: string}} BgText */
/**
 * @typedef {object} Technique
 * @property {BgText[]} setup      Изходна позиция
 * @property {BgText[]} steps      Изпълнение (numbered)
 * @property {BgText[]} breathing  Дишане
 * @property {BgText[]} keyPoints  Ключови точки
 * @property {{mistake: BgText, fix: BgText}[]} mistakes  Чести грешки → как да ги избегнеш
 * @property {{role: string, text: string}[]} muscles     Работещи мускули
 * @property {{text: string, url?: string}[]} sources     Източници
 * @property {{label: string, legend: string[]}[]} frames  captions + marker legends of the 2 frames
 */

/** @type {Record<string, Technique>} */
export const TECHNIQUE = `;
await put(join(root, 'src/data/technique.js'), `${header}${JSON.stringify(technique, null, 2)};\n`);
await put(
  join(root, 'src/data/figure-thumbs.js'),
  `// Generated by tools/make-technique.mjs – do not edit.\n/** Small exercise thumbnails (frame 2, no markers), inline SVG by exercise id. @type {Record<string, string>} */\nexport const THUMBS = ${JSON.stringify(thumbs, null, 1)};\n`,
);
await put(
  join(root, 'src/features/library/figure.css'),
  `/* Generated by tools/make-technique.mjs – illustration palette, light + .dark (do not edit). */\n${scopedCss(style)}\n`,
);
const tot = sizes.reduce(
  (a, s) => ({ source: a.source + s.source, frames: a.frames + s.frames, thumb: a.thumb + s.thumb }),
  {
    source: 0,
    frames: 0,
    thumb: 0,
  },
);
console.table(sizes);
console.log('total', tot);
