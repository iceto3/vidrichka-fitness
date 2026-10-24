/**
 * DOM helpers: an auto-escaping `html` template tag, safe re-rendering that keeps focus,
 * and event delegation for `data-act` (click), `data-change` and `data-input` handlers.
 * Built-in attributes: `data-go="path"` navigates, `data-back` goes back.
 * @module ui/dom
 */
import { emit } from '../core/bus.js';

/** Marker for already-safe HTML. */
export class Safe {
  /** @param {string} s */
  constructor(s) {
    this.s = s;
  }
  toString() {
    return this.s;
  }
}

/** Escape text for HTML. @param {unknown} v */
export const esc = (v) =>
  String(v).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Mark a string as trusted HTML. @param {string} s */
export const raw = (s) => new Safe(s);

/** @param {any} v @returns {string} */
const part = (v) =>
  v == null || v === false ? '' : v instanceof Safe ? v.s : Array.isArray(v) ? v.map(part).join('') : esc(v);

/**
 * Tagged template: interpolated values are escaped unless they are `Safe` (or arrays of them).
 * @param {TemplateStringsArray} strings
 * @param {...any} vals
 * @returns {Safe}
 */
export const html = (strings, ...vals) =>
  new Safe(strings.reduce((a, s, i) => a + s + (i < vals.length ? part(vals[i]) : ''), ''));

/**
 * Replace an element's content, restoring focus/selection of an element with an id.
 * @param {HTMLElement} el
 * @param {string|Safe} content
 */
export function swap(el, content) {
  const a = /** @type {HTMLInputElement|null} */ (document.activeElement);
  const id = a && a !== document.body && el.contains(a) ? a.id : '';
  const sel = id ? [a?.selectionStart, a?.selectionEnd] : null;
  el.innerHTML = String(content);
  if (!id) return;
  const n = /** @type {HTMLInputElement|null} */ (document.getElementById(id));
  n?.focus({ preventScroll: true });
  try {
    if (sel && sel[0] != null) n?.setSelectionRange(sel[0], sel[1] ?? sel[0]);
  } catch {
    /* not a text input */
  }
}

/**
 * Run an action handler; refresh UI afterwards unless it returns `false`.
 * @param {Function} fn
 * @param {HTMLElement} el
 * @param {Event} ev
 * @param {boolean} [refresh]
 */
async function run(fn, el, ev, refresh = true) {
  try {
    const r = await fn(el, ev);
    if (refresh && r !== false) emit('ui:refresh');
  } catch (err) {
    console.error('[action] failed', err);
    emit('toast', { key: 'common.error' });
  }
}

/**
 * Delegate events inside `root` to the current view's `actions`.
 * @param {HTMLElement} root
 * @param {() => (import('../core/registry.js').View|null|undefined)} getView
 */
export function bindActions(root, getView) {
  root.addEventListener('click', (ev) => {
    const t = /** @type {HTMLElement|null} */ (
      /** @type {HTMLElement} */ (ev.target).closest('[data-act],[data-go],[data-back]')
    );
    if (!t || !root.contains(t) || t.matches(':disabled,[aria-disabled="true"]')) return;
    if (t.dataset.go != null) return emit('nav', { path: t.dataset.go });
    if (t.dataset.back != null) return emit('nav', { back: t.dataset.back || 'home' });
    const fn = getView()?.actions?.[t.dataset.act ?? ''];
    if (fn) run(fn, t, ev);
  });
  for (const type of ['change', 'input']) {
    root.addEventListener(type, (ev) => {
      const t = /** @type {HTMLElement} */ (ev.target);
      const name = t.dataset?.[type];
      const fn = name && getView()?.actions?.[name];
      if (fn) run(fn, t, ev, type === 'change');
    });
  }
}

/**
 * Query helper.
 * @param {string} sel
 * @param {ParentNode} [root]
 */
export const $ = (sel, root = document) => /** @type {HTMLElement|null} */ (root.querySelector(sel));

/**
 * Patch part of the page without a full refresh (e.g. live search results).
 * @param {string} sel
 * @param {string|Safe} content
 */
export const patch = (sel, content) => {
  const el = $(sel);
  if (el) swap(el, content);
};

/** Numeric value of an element's data attribute. @param {HTMLElement} el @param {string} k */
export const num = (el, k) => Number(el.dataset[k]);
