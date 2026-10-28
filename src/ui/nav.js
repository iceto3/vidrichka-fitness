/**
 * Bottom navigation, built from the tab registry.
 * @module ui/nav
 */
import { registry } from '../core/registry.js';
import { t } from '../core/i18n.js';
import { html, raw } from './dom.js';
import { ic } from './icons.js';

/**
 * Render the bottom nav.
 * @param {string} [active] Active tab id.
 */
export const renderNav = (active) =>
  // 1.4.0: links to pages, not tabs of one panel – so aria-current instead of tab roles,
  // and the icon is decorative (the visible text is the accessible name).
  html`<div class="nav">${registry.tabs.map(
    (tab) =>
      html`<button class="t${tab.id === active ? ' on' : ''}" ${tab.id === active ? raw('aria-current="page"') : ''} data-go="${tab.path}"><span class="pill" aria-hidden="true">${ic(tab.icon, 23, tab.id === active ? 2.2 : 1.9)}</span><span class="tl">${t(tab.label)}</span></button>`,
  )}</div>`;
