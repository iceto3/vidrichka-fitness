/**
 * Sharing helpers: Web Share (with files where supported, e.g. iOS 15+ / Android Chrome),
 * falling back to a download or clipboard.
 * @module ui/share
 */

/**
 * Share or download a file.
 * @param {Blob} blob
 * @param {string} name File name.
 * @param {string} [text]
 * @returns {Promise<'shared'|'downloaded'|'cancelled'>}
 */
export async function shareFile(blob, name, text = '') {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return 'shared';
    } catch (e) {
      if (/** @type {Error} */ (e).name === 'AbortError') return 'cancelled';
    }
  }
  download(blob, name);
  return 'downloaded';
}

/**
 * Share text (Web Share or clipboard).
 * @param {string} text
 * @returns {Promise<'shared'|'copied'|'cancelled'>}
 */
export async function shareText(text) {
  if (navigator.share) {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if (/** @type {Error} */ (e).name === 'AbortError') return 'cancelled';
    }
  }
  await navigator.clipboard?.writeText(text);
  return 'copied';
}

/** Trigger a download. @param {Blob} blob @param {string} name */
export function download(blob, name) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}

/**
 * Load an SVG string as an image for canvas drawing.
 * @param {string} svg
 * @returns {Promise<HTMLImageElement>}
 */
export const svgImage = (svg) =>
  new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = rej;
    img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg.includes('xmlns') ? svg : svg.replace('<svg', '<svg xmlns="http://www.w3.org/2000/svg"'))}`;
  });

/**
 * Render a share card: teal gradient, otter, title and stat tiles.
 * @param {{title: string, sub: string, otterSvg: string, stats: [string, string][], footer: string, highlight?: string}} o
 * @returns {Promise<Blob>}
 */
export async function shareCard(o) {
  const W = 1080, H = 1350, c = document.createElement('canvas');
  c.width = W, (c.height = H);
  const g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d'));
  await document.fonts?.ready;
  const grad = g.createLinearGradient(0, 0, W, H);
  grad.addColorStop(0, '#0B8F96'), grad.addColorStop(1, '#076A70');
  g.fillStyle = grad;
  g.fillRect(0, 0, W, H);
  g.fillStyle = 'rgba(255,255,255,.08)';
  g.beginPath(), g.arc(W - 120, 160, 260, 0, 7), g.fill();
  try {
    g.drawImage(await svgImage(o.otterSvg), W / 2 - 210, 90, 420, 420);
  } catch {
    /* image decode not supported */
  }
  const font = (/** @type {number} */ s, w = 800) => `${w} ${s}px "Plus Jakarta Sans", system-ui, sans-serif`;
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = font(76);
  g.fillText(o.title, W / 2, 610, W - 120);
  g.font = font(38, 700);
  g.fillStyle = 'rgba(255,255,255,.8)';
  g.fillText(o.sub, W / 2, 672, W - 120);
  o.stats.slice(0, 6).forEach(([label, value], i) => {
    const x = 70 + (i % 3) * 320, y = 740 + Math.floor(i / 3) * 210;
    g.fillStyle = 'rgba(255,255,255,.14)';
    g.beginPath(), g.roundRect(x, y, 300, 185, 36), g.fill();
    g.fillStyle = '#fff';
    g.font = font(60);
    g.fillText(value, x + 150, y + 95, 270);
    g.font = font(30, 700);
    g.fillStyle = 'rgba(255,255,255,.75)';
    g.fillText(label, x + 150, y + 145, 270);
  });
  if (o.highlight) {
    g.fillStyle = '#FF7A2F';
    g.beginPath(), g.roundRect(70, 1170, W - 140, 90, 45), g.fill();
    g.fillStyle = '#fff';
    g.font = font(40);
    g.fillText(o.highlight, W / 2, 1229, W - 180);
  }
  g.font = font(28, 700);
  g.fillStyle = 'rgba(255,255,255,.7)';
  g.fillText(o.footer, W / 2, H - 30);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('toBlob'))), 'image/png'));
}
