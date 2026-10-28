/**
 * 1.4.1: keeps the bottom nav on screen while the page is pinch-zoomed.
 *
 * `position: fixed` pins the nav to the layout viewport. When the user zooms in (for example on an
 * exercise drawing, on Android and on iPhone alike) the visible part of the page is only a piece of
 * that viewport, so the nav stayed at the bottom of the unzoomed page and scrolled away with the
 * content. Here the nav is moved and scaled back onto the visible part (the visual viewport) while
 * the zoom lasts, and left alone (no transform at all) otherwise.
 * @module ui/nav-pin
 */

/**
 * @param {HTMLElement} navHost The `<nav id="nav">` element (the bar inside it is `.nav`).
 * @param {VisualViewport | null | undefined} [vv]
 */
export function pinNav(navHost, vv = globalThis.visualViewport) {
  if (!vv) return () => {};
  let raf = 0;
  const apply = () => {
    raf = 0;
    const zoomed = vv.scale > 1.01;
    navHost.classList.toggle('pinned', zoomed);
    if (!zoomed) return;
    const bar = /** @type {HTMLElement | null} */ (navHost.querySelector('.nav'));
    if (!bar) return;
    // layout-viewport position of the bar without any transform: left edge and bottom = innerHeight
    const left = Math.max(0, (innerWidth - Math.min(innerWidth, bar.offsetWidth)) / 2);
    const s = navHost.style;
    s.setProperty('--pin-x', `${vv.offsetLeft - left}px`);
    s.setProperty('--pin-y', `${vv.offsetTop + vv.height - innerHeight}px`);
    s.setProperty('--pin-s', String(1 / vv.scale));
  };
  const queue = () => (raf ||= requestAnimationFrame(apply));
  vv.addEventListener('resize', queue);
  vv.addEventListener('scroll', queue);
  addEventListener('scroll', queue, { passive: true });
  apply();
  return () => {
    vv.removeEventListener('resize', queue);
    vv.removeEventListener('scroll', queue);
    removeEventListener('scroll', queue);
  };
}
