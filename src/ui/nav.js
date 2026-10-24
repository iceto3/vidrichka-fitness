/**
 * Bottom navigation, built from the tab registry.
 * @module ui/nav
 */
import { registry } from '../core/registry.js';
import { t } from '../core/i18n.js';
import { html } from './dom.js';
import { ic } from './icons.js';

/**
 * Render the bottom nav.
 * @param {string} [active] Active tab id.
 */
export const renderNav = (active) =>
  html`<div class="nav" role="tablist">${registry.tabs.map(
    (tab) => html`<button class="t${tab.id === active ? ' on' : ''}" role="tab" aria-selected="${tab.id === active}"
      data-go="${tab.path}"><span class="pill">${ic(tab.icon, 23, tab.id === active ? 2.2 : 1.9)}</span>${t(tab.label)}</button>`,
  )}</div>`;
