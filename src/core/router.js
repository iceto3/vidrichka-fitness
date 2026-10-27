/**
 * Hash router (works from any GitHub Pages sub-path). Routes come from the registry and
 * load their views lazily, so each feature's code is only fetched when first opened.
 * @module core/router
 */
import { registry } from './registry.js';
import { on, emit } from './bus.js';
import { bindActions, morph, swap } from '../ui/dom.js';
import { renderNav } from '../ui/nav.js';

/** @type {{view: import('./registry.js').View|null, path: string}} */
const cur = { view: null, path: '' };
let pageEl = /** @type {HTMLElement|null} */ (null);
let navEl = /** @type {HTMLElement|null} */ (null);
let seq = 0;

/**
 * Match a path against a pattern like `workouts/plan/:id`.
 * @param {string} pattern
 * @param {string} path
 * @returns {Record<string,string>|null}
 */
export function matchPath(pattern, path) {
  const a = pattern.split('/'),
    b = path.split('/');
  if (a.length !== b.length) return null;
  /** @type {Record<string,string>} */
  const params = {};
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith(':')) params[a[i].slice(1)] = decodeURIComponent(b[i]);
    else if (a[i] !== b[i]) return null;
  }
  return params;
}

/** Current route path without the leading `#/`. */
export const currentPath = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'home';

/**
 * Navigate to a path.
 * @param {string} path
 * @param {{replace?: boolean}} [opts]
 */
export function navigate(path, opts = {}) {
  const url = `#/${path}`;
  if (opts.replace) (history.replaceState(null, '', url), show());
  else location.hash = url;
}

/** Go back in history, or to a fallback path when there is none. @param {string} [fallback] */
export const back = (fallback = 'home') =>
  history.length > 1 ? history.back() : navigate(fallback, { replace: true });

/** Resolve and render the current hash. */
async function show() {
  const path = currentPath();
  const my = ++seq;
  const hit = registry.routes.map((r) => ({ r, p: matchPath(r.pattern, path) })).find((x) => x.p);
  if (!hit) return navigate('home', { replace: true });
  try {
    const view = await hit.r.load(/** @type {Record<string,string>} */ (hit.p));
    if (my !== seq) return; // a newer navigation won
    cur.view?.unmount?.();
    Object.assign(cur, { view, path });
    refresh(true);
    view.mount?.(/** @type {HTMLElement} */ (pageEl));
    emit('route:changed', path);
  } catch (err) {
    if (leaving) return; // a reload/close cancelled the view's import: not an error
    console.error('[router] failed to open', path, err);
    emit('toast', { key: 'common.error' });
  }
}

/** True while the page is unloading (pending view imports are cancelled then). */
let leaving = false;
if (typeof addEventListener === 'function') {
  // WebKit cancels pending imports as soon as a reload starts (before pagehide).
  addEventListener('beforeunload', () => (leaving = true));
  addEventListener('pagehide', () => (leaving = true));
  addEventListener('pageshow', () => (leaving = false));
}

/**
 * Re-render the current page and the bottom nav.
 * A new page (`top`) is rendered from scratch and scrolled to the top; any other refresh
 * (after a tap, a data change…) is morphed in place, so existing nodes are kept and the
 * screen does not flicker or jump.
 * @param {boolean} [top] New page: rebuild and scroll to top.
 */
export function refresh(top = false) {
  if (!cur.view || !pageEl || !navEl) return;
  if (top) swap(pageEl, cur.view.render());
  else morph(pageEl, cur.view.render());
  navEl.hidden = !!cur.view.hideNav;
  document.body.classList.toggle('no-nav', !!cur.view.hideNav);
  morph(navEl, renderNav(cur.view.tab));
  if (top) scrollTo(0, 0);
}

/**
 * Start routing.
 * @param {HTMLElement} page
 * @param {HTMLElement} nav
 */
export function startRouter(page, nav) {
  pageEl = page;
  navEl = nav;
  bindActions(page, () => cur.view);
  addEventListener('hashchange', show);
  on('ui:refresh', () => refresh());
  return show();
}
