/**
 * Bottom sheets, dialogs and toasts rendered into the #layer element.
 * Each sheet is a View (render + actions). The top sheet closes with Esc, a tap on the
 * backdrop, or the Android back gesture / browser back.
 * @module ui/sheet
 */
import { on } from '../core/bus.js';
import { t } from '../core/i18n.js';
import { bindActions, html, morph, raw, swap } from './dom.js';

/** @typedef {import('../core/registry.js').View & {kind?: 'sheet'|'dialog'|'full', onClose?: () => void}} SheetView */

/** @type {{view: SheetView, el: HTMLElement}[]} */
const stack = [];
let layer = /** @type {HTMLElement|null} */ (null);
let skipPop = 0;
/** @type {(() => void)[]} */
const pending = [];

/**
 * Run `fn` once history has settled after closing sheets (avoids racing `history.back()`).
 * @param {() => void} fn
 */
export const whenSettled = (fn) => (skipPop ? pending.push(fn) : fn());

/**
 * Open a sheet/dialog.
 * @param {SheetView} view
 * @returns {{close: () => void, el: HTMLElement}}
 */
export function openSheet(view) {
  const el = document.createElement('div');
  el.className = `layer-item ${view.kind ?? 'sheet'}`;
  const entry = { view, el };
  stack.push(entry);
  layer?.append(el);
  bindActions(el, () => entry.view);
  el.addEventListener(
    'click',
    (e) => /** @type {HTMLElement} */ (e.target).matches('.overlay,[data-close]') && closeSheet(),
  );
  render(entry);
  view.mount?.(el);
  whenSettled(() => history.pushState({ sheet: stack.length }, '')); // after any pending back()
  document.body.classList.add('locked');
  const panel = /** @type {HTMLElement|null} */ (el.querySelector('[role="dialog"]'));
  panel?.focus({ preventScroll: true });
  return { close: () => closeSheet(entry), el };
}

/**
 * Render a sheet. The first render builds the overlay + panel (their open animations run
 * once); later renders only morph the panel's content, so taps inside a sheet never
 * restart those animations (this was the "+ button flicker").
 * @param {{view: SheetView, el: HTMLElement, hid?: number}} e
 */
const render = (e) => {
  const body = html`${e.view.kind === 'dialog' || e.view.kind === 'full' ? '' : html`<div class="grab"></div>`}${raw(String(e.view.render()))}`;
  const open = e.el.querySelector(':scope > .panel');
  if (open) morph(open, body);
  else
    swap(
      e.el,
      html`<div class="overlay"></div><div class="panel" role="dialog" aria-modal="true" tabindex="-1">${body}</div>`,
    );
  // Name the dialog after its first heading (or the page title) for screen readers.
  const panel = e.el.querySelector('.panel');
  const h = panel?.querySelector('h1, h2, h3, .h2, .h3');
  if (h) panel.setAttribute('aria-labelledby', (h.id ||= `dlg-h-${(e.hid ||= ++headingSeq)}`));
  else panel?.setAttribute('aria-label', document.title);
};
let headingSeq = 0;

/**
 * Close a sheet (default: the top one).
 * @param {{view: SheetView, el: HTMLElement}} [entry]
 * @param {boolean} [fromPop]
 */
export function closeSheet(entry = stack[stack.length - 1], fromPop = false) {
  const i = stack.indexOf(entry);
  if (i < 0) return;
  stack.splice(i, 1);
  entry.view.unmount?.();
  entry.el.remove();
  if (!stack.length) document.body.classList.remove('locked');
  if (!fromPop) (skipPop++, history.back());
  entry.view.onClose?.();
}

/** Number of open sheets. */
export const sheetsOpen = () => stack.length;

/** Close every open sheet (e.g. before navigating). */
export const closeAll = () => [...stack].reverse().forEach((e) => closeSheet(e));

/**
 * Confirmation dialog.
 * @param {{title: string, body?: string, ok?: string, danger?: boolean}} o
 * @returns {Promise<boolean>}
 */
export const confirmDialog = (o) =>
  new Promise((resolve) => {
    let answer = false;
    openSheet({
      kind: 'dialog',
      render: () => html`<h2 class="h2">${o.title}</h2>${o.body ? html`<p class="muted b small mt8">${o.body}</p>` : ''}
<div class="row gap10 mt16"><button class="btn sec f1" data-close>${t('common.cancel')}</button>
<button class="btn f1${o.danger ? ' danger' : ''}" data-act="ok">${o.ok ?? t('common.ok')}</button></div>`,
      actions: { ok: () => ((answer = true), closeSheet(), false) },
      onClose: () => resolve(answer),
    });
  });

/**
 * Show a short toast message.
 * @param {string} text
 */
export function toast(text) {
  document.querySelectorAll('.toast').forEach((old) => old.remove()); // one at a time, newest wins
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

/**
 * Initialise the layer root and global listeners.
 * @param {HTMLElement} root
 */
export function initSheets(root) {
  layer = root;
  addEventListener('popstate', () => {
    if (skipPop) {
      if (--skipPop === 0) pending.splice(0).forEach((f) => f());
      return;
    }
    if (stack.length) closeSheet(undefined, true);
  });
  addEventListener('keydown', (e) => {
    if (e.key !== 'Escape' || !stack.length || e.defaultPrevented) return;
    e.preventDefault();
    closeSheet();
  });
  on('ui:refresh', () => stack.forEach(render));
  on('toast', (/** @type {{key?: string, text?: string, vars?: any}} */ p) => toast(p.text ?? t(p.key ?? '', p.vars)));
}
