/**
 * Verified exercise technique (1.4.1): the two-frame illustration with numbered markers and
 * the technique sections (Изходна позиция, Изпълнение, Дишане, Ключови точки, Чести грешки
 * → как да ги избегнеш, Подробно за мускулите (свито), Източници). Shared by the exercise page and the
 * in-workout technique sheet.
 *
 * Content: `data/technique.js`; drawings: `data/figures/<id>.js` – one lazy chunk per
 * exercise (precached by the service worker like every chunk, so it works offline). A view
 * renders a placeholder until the chunk is loaded, then `hydrateFigure()` fills it in;
 * renders after that include the drawing, so morphing never wipes it.
 * @module features/library/figure
 */
import { html, raw, esc } from '../../ui/dom.js';
import { L, getLang, t } from '../../core/i18n.js';
import { TECHNIQUE } from '../../data/technique.js';
import { ic } from '../../ui/icons.js';

/** @typedef {import('../../data/technique.js').BgText} BgText */

/** @type {Map<string, string[]>} loaded frames by exercise id */
const loaded = new Map();

/**
 * Text with the content's tiny markup (`**bold**`, `*italic*`) as safe HTML. Everything is
 * escaped first, so a source text can never inject markup.
 * @param {BgText} v
 */
export const rich = (v) =>
  raw(
    esc(L(v))
      .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
      .replace(/\*(.+?)\*/g, '<em>$1</em>'),
  );

/** Technique of an exercise (undefined for unknown ids). @param {string} id */
export const techniqueOf = (id) => (Object.hasOwn(TECHNIQUE, id) ? TECHNIQUE[id] : undefined);

/**
 * Load the two frames of an exercise (cached). Only known ids are imported.
 * @param {string} id
 * @returns {Promise<string[]>}
 */
export async function loadFigure(id) {
  if (loaded.has(id)) return /** @type {string[]} */ (loaded.get(id));
  if (!techniqueOf(id)) return [];
  const frames = /** @type {string[]} */ ((await import(`../../data/figures/${id}.js`)).default);
  loaded.set(id, frames);
  return frames;
}

/**
 * The illustration: two frames, each with its caption, drawing and marker legend.
 * @param {string} id
 */
export const figureBlock = (id) => {
  const tq = techniqueOf(id);
  if (!tq) return '';
  const svgs = loaded.get(id);
  return html`<div class="tfigs" data-fig="${id}">${tq.frames.map(
    (fr, i) => html`<figure class="tfig">
<figcaption class="tcap">${fr.label}</figcaption>
<div class="tsvg${svgs ? '' : ' wait'}">${svgs ? raw(svgs[i]) : ''}</div>
<ol class="tleg">${fr.legend.map((l, n) => html`<li><i aria-hidden="true">${n + 1}</i><span>${l}</span></li>`)}</ol>
</figure>`,
  )}</div>`;
};

/**
 * Fill the drawings into a rendered `figureBlock` once their chunk is loaded.
 * @param {ParentNode} root
 * @param {string} id
 */
export async function hydrateFigure(root, id) {
  try {
    const svgs = await loadFigure(id);
    root.querySelectorAll(`.tfigs[data-fig="${id}"] .tsvg.wait`).forEach((el, i) => {
      if (!svgs[i]) return;
      el.innerHTML = svgs[i];
      el.classList.remove('wait');
    });
  } catch (err) {
    console.warn('[technique] illustration not available', err); // the texts still show
  }
}

/** @param {string} title @param {any} body @param {string} cls */
const section = (title, body, cls) =>
  html`<section class="tsec ${cls}"><h3 class="h3 xb">${title}</h3>${body}</section>`;
const list = (/** @type {BgText[]} */ xs, ordered = false) => {
  const items = xs.map((x) => html`<li>${rich(x)}</li>`);
  return ordered ? html`<ol class="tlist num">${items}</ol>` : html`<ul class="tlist">${items}</ul>`;
};

/**
 * All technique sections of an exercise, in the order of the verified cards.
 * @param {string} id
 */
export const techniqueSections = (id) => {
  const tq = techniqueOf(id);
  if (!tq) return '';
  return html`${getLang() === 'bg' ? '' : html`<p class="xs b muted mt12">${t('technique.bgOnly')}</p>`}
${section(t('technique.setup'), list(tq.setup), 'setup')}
${section(t('technique.steps'), list(tq.steps, true), 'exec')}
${section(t('technique.breathing'), list(tq.breathing), 'breath')}
${section(t('technique.keyPoints'), list(tq.keyPoints), 'keys')}
${section(
  t('technique.mistakes'),
  html`<ul class="tmist">${tq.mistakes.map(
    (
      m,
    ) => html`<li><p class="mis"><span class="mk" aria-hidden="true">✕</span><span><span class="sr-only">${t('technique.mistake')}: </span>${rich(m.mistake)}</span></p>
<p class="fix"><span class="mk" aria-hidden="true">→</span><span><span class="sr-only">${t('technique.fix')}: </span>${rich(m.fix)}</span></p></li>`,
  )}</ul>`,
  'mistakes',
)}
<details class="tsec muscles tmore"><summary><h3 class="h3 xb">${t('technique.muscles')}</h3><span class="tchev" aria-hidden="true">${ic('down', 18, 2.4)}</span></summary>
<ul class="tlist tmus">${tq.muscles.map((m) => html`<li><strong>${m.role}:</strong> ${rich(m.text)}</li>`)}</ul></details>
<section class="tsec tsrc"><h3 class="xs xb muted caps">${t('technique.sources')}</h3><ul>${tq.sources.map(
    (s) =>
      html`<li>${s.url ? html`<a href="${s.url}" target="_blank" rel="noopener noreferrer">${rich(s.text)}</a>` : rich(s.text)}</li>`,
  )}</ul></section>`;
};
