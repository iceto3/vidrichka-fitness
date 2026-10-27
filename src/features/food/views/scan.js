/**
 * Barcode scanner: camera + native BarcodeDetector (Android Chrome); on iOS/others the
 * ZXing library is lazy-loaded (not precached until first use). Found codes are looked up
 * in Open Food Facts; typing the number or manual entry is always possible.
 * @module features/food/views/scan
 */
import { emit } from '../../../core/bus.js';
import { html } from '../../../ui/dom.js';
import { getLang, t } from '../../../core/i18n.js';
import { all } from '../../../core/store.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { product } from '../off.js';

const ZXING_URL = 'assets/vendor/zxing.min.js';
const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128'];

/** @type {Promise<any>|null} */
let zxing = null;
/** Load ZXing once via a script tag (UMD global). */
const loadZxing = () =>
  (zxing ??= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = ZXING_URL;
    s.onload = () => res(/** @type {any} */ (window).ZXing);
    s.onerror = () => ((zxing = null), rej(new Error('zxing')));
    document.head.append(s);
  }));

/**
 * Build a frame decoder: native BarcodeDetector when it supports EAN, else ZXing.
 * @returns {Promise<(v: HTMLVideoElement) => Promise<string|null>>}
 */
async function makeDecoder() {
  const BD = /** @type {any} */ (window).BarcodeDetector;
  if (BD) {
    const ok = (await BD.getSupportedFormats?.().catch(() => [])) ?? [];
    if (ok.includes('ean_13')) {
      const det = new BD({ formats: FORMATS.filter((f) => ok.includes(f)) });
      return async (v) => (await det.detect(v).catch(() => []))[0]?.rawValue ?? null;
    }
  }
  const Z = await loadZxing();
  const hints = new Map(
    /** @type {any} */ ([
      [
        Z.DecodeHintType.POSSIBLE_FORMATS,
        [
          Z.BarcodeFormat.EAN_13,
          Z.BarcodeFormat.EAN_8,
          Z.BarcodeFormat.UPC_A,
          Z.BarcodeFormat.UPC_E,
          Z.BarcodeFormat.CODE_128,
        ],
      ],
      [Z.DecodeHintType.TRY_HARDER, true],
    ]),
  );
  const reader = new Z.MultiFormatReader();
  reader.setHints(hints);
  const c = document.createElement('canvas'),
    g = /** @type {CanvasRenderingContext2D} */ (c.getContext('2d', { willReadFrequently: true }));
  return async (v) => {
    if (!v.videoWidth) return null;
    const w = 640,
      h = Math.round((v.videoHeight / v.videoWidth) * w);
    ((c.width = w), (c.height = h));
    g.drawImage(v, 0, 0, w, h);
    try {
      return reader
        .decode(new Z.BinaryBitmap(new Z.HybridBinarizer(new Z.HTMLCanvasElementLuminanceSource(c))))
        .getText();
    } catch {
      return null;
    }
  };
}

/**
 * Open the scanner sheet.
 * @param {(food: any) => void} onFood
 * @param {(barcode?: string) => void} onManual Manual entry; gets the barcode that was not
 *   found (1.4.0) so the saved food remembers it and the next scan finds it at once.
 */
export function openScanner(onFood, onManual) {
  /** @type {MediaStream|null} */
  let stream = null;
  let stop = false,
    status = t('scan.starting'),
    code = '',
    missing = '';
  const setStatus = (/** @type {string} */ s) => {
    status = s;
    const el = document.getElementById('scanstatus');
    if (el) el.textContent = s;
  };
  const lookup = async (/** @type {string} */ c) => {
    code = c;
    setStatus(t('scan.looking', { code: c }));
    const cached = all('foods').find((f) => f.barcode === c);
    const r = cached ?? (await product(c, getLang()));
    if (r && r !== 'notfound') return (closeSheet(), onFood(r));
    status = r === 'notfound' ? t('scan.notFound') : t('scan.offline');
    // not found (or no answer within 8 s): the manual form, with this barcode, becomes the main button
    missing = c;
    emit('ui:refresh');
  };
  openSheet({
    kind: 'full',
    render:
      () => html`<div class="row between"><h2 class="h2">${t('food.scan')}</h2><button class="iconbtn" data-close aria-label="${t('common.close')}">${ic('close', 20)}</button></div>
<div class="scanbox mt12"><video id="scanvid" playsinline muted autoplay></video><div class="scanframe" aria-hidden="true"></div></div>
<p class="b small mt10 center" id="scanstatus" role="status">${status}</p>
<form class="row gap8 mt12" data-act="noop"><input class="input f1" id="bcode" inputmode="numeric" pattern="[0-9]*" placeholder="${t('scan.typeCode')}" value="${code}" aria-label="${t('scan.typeCode')}">
<button class="btn sm" type="button" data-act="lookup">${t('scan.lookup')}</button></form>
<button class="btn${missing ? '' : ' sec'} w100 mt12" data-act="manual">${ic('edit', 18)}${missing ? t('scan.addManual', { code: missing }) : t('food.manual')}</button>`,
    mount: async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('no camera');
        const decode = await makeDecoder();
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: { ideal: 1280 } },
          audio: false,
        });
        if (stop) return stream.getTracks().forEach((tr) => tr.stop());
        const v = /** @type {HTMLVideoElement} */ (document.getElementById('scanvid'));
        v.srcObject = stream;
        await v.play().catch(() => {});
        setStatus(t('scan.point'));
        const loop = async () => {
          if (stop) return;
          const c = await decode(v);
          if (c && c !== code) await lookup(c);
          if (!stop) setTimeout(loop, 180);
        };
        loop();
      } catch {
        setStatus(t('scan.noCamera'));
      }
    },
    unmount: () => {
      stop = true;
      stream?.getTracks().forEach((tr) => tr.stop());
    },
    actions: {
      lookup: () => {
        const c = /** @type {HTMLInputElement} */ (document.getElementById('bcode')).value.replace(/\D/g, '');
        if (c.length >= 6) lookup(c);
        return false;
      },
      manual: () => (closeSheet(), onManual(missing || undefined), false),
    },
  });
}
