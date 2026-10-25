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
  if (!panel?.contains(document.activeElement)) panel?.focus({ preventScroll: true }); // keep a field mount() focused
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
  requestAnimationFrame(repositionPills); // the sheet's height may have changed
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
  repositionPills();
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
  el.dataset.born = String(Date.now());
  el.setAttribute('role', 'status');
  el.textContent = text;
  document.body.append(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

/** How long the undo pill stays (ms). */
export const SNACK_MS = 4000;

/** Things on the page the undo pill must not cover. */
const TAPPABLE = 'main button, main a[href], main input, main select, main textarea, main [data-go], main [data-act]';

/**
 * Where the undo pill sits: the right corner just above the bottom nav, or – while a bottom
 * sheet is open – just above that sheet's top edge, so it never covers a sheet's buttons.
 * @param {HTMLElement} el
 */
const placePill = (el) => {
  const top = stack[stack.length - 1];
  const panel = top && top.view.kind !== 'dialog' ? top.el.querySelector(':scope > .panel') : null;
  el.style.bottom = panel ? `${Math.round(innerHeight - panel.getBoundingClientRect().top + 10)}px` : '';
  if (panel) return;
  // Never sit on anything tappable on the page (a button, a meal row, a link, a field):
  // move up to the lowest free gap on the right; only if there is none, stay in the corner.
  const r = el.getBoundingClientRect();
  const hits = [...document.querySelectorAll(TAPPABLE)]
    .map((b) => b.getBoundingClientRect())
    .filter((q) => q.width && q.height && q.left < r.right + 4 && q.right > r.left - 4 && q.top < r.bottom + 4);
  let y = r.bottom;
  for (let i = 0; i < 60; i++) {
    const hit = hits.find((q) => q.top < y + 4 && q.bottom > y - r.height - 4);
    if (!hit) break;
    y = hit.top - 6;
    if (y - r.height < 8) return; // nowhere free: keep the corner
  }
  if (y !== r.bottom) el.style.bottom = `${Math.round(innerHeight - y)}px`;
};

/** Keep a visible undo pill clear of the (new) top sheet. */
function repositionPills() {
  document.querySelectorAll('.undopill').forEach((p) => placePill(/** @type {HTMLElement} */ (p)));
}

/**
 * Undo for a deletion: a small „Отмени“ pill with a countdown ring in the bottom-right corner
 * (above the nav, or above an open sheet). It hides after {@link SNACK_MS}, can be swiped
 * away, and only one is shown at a time (deleted things stay in „Наскоро изтрити“ anyway).
 * @param {string} text What was deleted (read by screen readers, shown as a tooltip).
 * @param {() => void} onUndo
 * @param {number} [ms]
 * @returns {HTMLElement}
 */
export function snack(text, onUndo, ms = SNACK_MS) {
  document.querySelectorAll('.undopill').forEach((old) => old.remove());
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'undopill';
  el.dataset.born = String(Date.now());
  el.title = text;
  el.setAttribute('aria-label', `${text} – ${t('undo.undo')}`);
  el.style.setProperty('--ms', `${ms}ms`);
  el.innerHTML = `<svg class="ring" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10"/><circle class="left" cx="12" cy="12" r="10"/></svg><span>${t('undo.undo')}</span>`;
  let used = false,
    x0 = 0,
    y0 = 0,
    dx = 0,
    dy = 0,
    drag = false;
  const hide = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  };
  el.addEventListener('click', (e) => {
    e.stopPropagation();
    if (used || drag) return;
    used = true;
    el.remove();
    onUndo();
    toast(t('undo.done'));
  });
  // Swipe away (sideways or down).
  el.addEventListener(
    'pointerdown',
    (e) => ((x0 = e.clientX), (y0 = e.clientY), (drag = false), el.setPointerCapture(e.pointerId)),
  );
  el.addEventListener('pointermove', (e) => {
    if (!el.hasPointerCapture(e.pointerId)) return;
    dx = e.clientX - x0;
    dy = Math.max(0, e.clientY - y0);
    if (Math.abs(dx) + dy > 8) drag = true;
    if (drag) el.style.transform = `translate(${dx}px, ${dy}px)`;
  });
  el.addEventListener('pointerup', () => {
    if (drag && (Math.abs(dx) > 40 || dy > 30)) return void ((used = true), hide());
    el.style.transform = '';
    setTimeout(() => (drag = false), 0);
  });
  document.body.append(el);
  placePill(el);
  const onScroll = () => requestAnimationFrame(() => placePill(el));
  addEventListener('scroll', onScroll, { passive: true });
  new MutationObserver(
    (_, mo) => !el.isConnected && (removeEventListener('scroll', onScroll), mo.disconnect()),
  ).observe(document.body, { childList: true });
  setTimeout(() => placePill(el), 260); // after a sheet re-render / open animation
  setTimeout(() => !used && hide(), ms);
  return el;
}

/**
 * Remove the toasts and undo pills that belong to the page being left. One created in the
 * last moment (by the very tap that navigates, e.g. „Запиши“ in Regular meals) stays.
 * @param {number} [fresh] Keep the ones younger than this (ms).
 */
export const clearToasts = (fresh = 1000) =>
  document
    .querySelectorAll('.toast, .undopill')
    .forEach((e) => Date.now() - Number(/** @type {HTMLElement} */ (e).dataset.born ?? 0) >= fresh && e.remove());

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
  on('route:changed', () => clearToasts()); // a toast or Undo is about the page that was left
  on('toast', (/** @type {{key?: string, text?: string, vars?: any}} */ p) => toast(p.text ?? t(p.key ?? '', p.vars)));
}
