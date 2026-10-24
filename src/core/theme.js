/**
 * Light / dark / auto theme handling. Toggles the `dark` class on <html> and keeps the
 * browser `theme-color` in sync.
 * @module core/theme
 */

const media = () => matchMedia('(prefers-color-scheme: dark)');
let mode = 'auto';

/**
 * Apply a theme mode.
 * @param {'light'|'dark'|'auto'|string} m
 */
export function applyTheme(m) {
  mode = m;
  const dark = m === 'dark' || (m === 'auto' && media().matches);
  document.documentElement.classList.toggle('dark', dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0C1418' : '#F4F7F8');
}

/** Re-apply when the OS theme changes while in auto mode. */
export const watchTheme = () => media().addEventListener('change', () => mode === 'auto' && applyTheme(mode));
