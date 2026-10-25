/**
 * Tiny dependency-free JPEG EXIF reader: only the capture time (DateTimeOriginal, then
 * DateTimeDigitized) — no other metadata (location etc.) is ever read or stored.
 * Pure: works on an ArrayBuffer, so it runs in Node tests too.
 * Note: HEIC (or a JPEG the OS re-encoded without metadata) has no readable EXIF here; the
 * caller then falls back to the file's lastModified (see `pickPhotoDate`).
 * @module features/body/exif
 */

const ORIGINAL = 0x9003,
  DIGITIZED = 0x9004,
  EXIF_IFD = 0x8769;

/**
 * Capture time from a JPEG's EXIF, as local wall-clock parts.
 * @param {ArrayBuffer} buf File bytes (the first ~128 KB are enough).
 * @returns {{date: string, time: string} | null} `YYYY-MM-DD` and `HH:MM`, or null.
 */
export function exifDate(buf) {
  try {
    const v = new DataView(buf);
    if (v.byteLength < 4 || v.getUint16(0) !== 0xffd8) return null;
    let p = 2;
    while (p + 4 <= v.byteLength) {
      if (v.getUint8(p) !== 0xff) return null;
      const marker = v.getUint8(p + 1),
        len = v.getUint16(p + 2);
      if (marker === 0xda || marker === 0xd9) return null; // image data starts: no EXIF
      if (marker === 0xe1 && p + 10 <= v.byteLength && ascii(v, p + 4, 6) === 'Exif\0\0') {
        const r = fromTiff(v, p + 10, Math.min(v.byteLength, p + 2 + len));
        if (r) return r;
      }
      p += 2 + len;
    }
  } catch {
    /* truncated or malformed: treat as no EXIF */
  }
  return null;
}

/** @param {DataView} v @param {number} at @param {number} n */
const ascii = (v, at, n) => {
  let s = '';
  for (let i = 0; i < n && at + i < v.byteLength; i++) s += String.fromCharCode(v.getUint8(at + i));
  return s;
};

/** @param {DataView} v @param {number} t TIFF header offset @param {number} end */
function fromTiff(v, t, end) {
  const order = ascii(v, t, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const le = order === 'II';
  const u16 = (/** @type {number} */ o) => v.getUint16(t + o, le),
    u32 = (/** @type {number} */ o) => v.getUint32(t + o, le);
  if (u16(2) !== 42) return null;
  /** Tag → value offset (relative to t) in the IFD at `ifd`. @param {number} ifd */
  const tags = (ifd) => {
    /** @type {Map<number, {type: number, count: number, at: number}>} */
    const m = new Map();
    if (t + ifd + 2 > end) return m;
    const n = u16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12;
      if (t + e + 12 > end) break;
      const count = u32(e + 4);
      m.set(u16(e), { type: u16(e + 2), count, at: count > 4 ? u32(e + 8) : e + 8 });
    }
    return m;
  };
  const ifd0 = tags(u32(4));
  const ptr = ifd0.get(EXIF_IFD);
  if (!ptr) return null;
  const exif = tags(u32(ptr.at));
  for (const id of [ORIGINAL, DIGITIZED]) {
    const e = exif.get(id);
    if (!e || e.type !== 2 || t + e.at + 19 > end) continue;
    const m = /^(\d{4}):(\d\d):(\d\d)[ T](\d\d):(\d\d)/.exec(ascii(v, t + e.at, 19));
    if (!m || m[1] === '0000' || +m[2] < 1 || +m[2] > 12 || +m[3] < 1 || +m[3] > 31) continue;
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: `${m[4]}:${m[5]}` };
  }
  return null;
}

const pad = (/** @type {number} */ n) => String(n).padStart(2, '0');
/** @param {Date} d */
const localDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * Default date for a new photo: EXIF capture time; else the file's lastModified when it is
 * clearly older than today (an earlier day); else the upload moment. Never in the future.
 * @param {{exif: {date: string, time: string} | null, lastModified?: number, now: number}} o
 * @returns {{date: string, time: string, source: 'exif' | 'file' | 'upload'}}
 */
export function pickPhotoDate({ exif, lastModified, now }) {
  const n = new Date(now),
    today = localDay(n);
  if (exif && exif.date <= today && exif.date >= '1990-01-01') return { ...exif, source: 'exif' };
  if (lastModified && Number.isFinite(lastModified)) {
    const d = new Date(lastModified);
    if (localDay(d) < today && d.getFullYear() >= 1990)
      return { date: localDay(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}`, source: 'file' };
  }
  return { date: today, time: `${pad(n.getHours())}:${pad(n.getMinutes())}`, source: 'upload' };
}

/**
 * Read a picked file's default date (reads at most the first 256 KB, before any resizing —
 * the resized JPEG has no EXIF).
 * @param {File} file
 * @param {number} [now]
 */
export async function photoDateOf(file, now = Date.now()) {
  const head = await file
    .slice(0, 256 * 1024)
    .arrayBuffer()
    .catch(() => null);
  return pickPhotoDate({ exif: head ? exifDate(head) : null, lastModified: file.lastModified, now });
}
