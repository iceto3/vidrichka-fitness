/**
 * Generates the PWA icons (any + maskable), apple-touch-icon, favicon.svg and iOS splash
 * screens from the otter SVG, rasterised with headless Chrome.
 * Usage: npm run icons  (needs Chrome/Chromium; set CHROME_PATH to override)
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';
import { otterSvg } from '../src/features/mascot/otter.js';

const OUT = new URL('../assets/icons/', import.meta.url);
await mkdir(OUT, { recursive: true });
const otter = (size) => otterSvg({ size, pose: 'bust', gear: ['headband'], title: 'Vidrichka' }).replace(/ role="img" aria-label="[^"]*"/, '');
const BG = '<defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#E6F7F7"/><stop offset="1" stop-color="#B9E4E5"/></linearGradient></defs>';

/** Square icon SVG. `pad` = fraction of the side kept free around the otter. */
const icon = (s, pad, radius) => {
  const w = Math.round(s * (1 - pad * 2)), h = Math.round((w * 124) / 160);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${s}" height="${s}" viewBox="0 0 ${s} ${s}">${BG}<rect width="${s}" height="${s}" rx="${radius * s}" fill="url(#bg)"/>
<g transform="translate(${(s - w) / 2} ${(s - h) / 2 + s * 0.03})">${otter(w)}</g></svg>`;
};

await writeFile(new URL('favicon.svg', OUT), icon(64, 0.06, 0.22));
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? '/usr/bin/google-chrome' });
const page = await browser.newPage();
const png = async (svg, w, h, name) => {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;background:transparent}</style>${svg}`);
  await page.screenshot({ path: new URL(name, OUT).pathname, omitBackground: true, clip: { x: 0, y: 0, width: w, height: h } });
};
for (const s of [192, 512]) {
  await png(icon(s, 0.08, 0.22), s, s, `icon-${s}.png`);
  await png(icon(s, 0.2, 0), s, s, `maskable-${s}.png`); // otter inside the 80% safe zone
}
await png(icon(180, 0.1, 0), 180, 180, 'apple-touch-icon.png');

// iOS splash screens (portrait, CSS px × DPR), light background with the otter.
export const SPLASH = [[430, 932, 3], [393, 852, 3], [428, 926, 3], [390, 844, 3], [414, 896, 2], [375, 812, 3], [375, 667, 2], [320, 568, 2]];
for (const [w, h, d] of SPLASH) {
  const W = w * d, H = h * d, o = Math.round(W * 0.42);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#F4F7F8"/>
<g transform="translate(${(W - o) / 2} ${H / 2 - o * 0.7})">${otter(o)}</g>
<text x="50%" y="${H / 2 + o * 0.35}" text-anchor="middle" font-family="system-ui, sans-serif" font-weight="800" font-size="${W * 0.06}" fill="#0B8F96">Vidrichka</text></svg>`;
  await png(svg, W, H, `splash-${W}x${H}.png`);
}
await browser.close();
console.log('icons written to assets/icons/');
