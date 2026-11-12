/**
 * iOS-style scroll-wheel picker (time, date, duration). One shared sheet; fields are
 * buttons (no keyboard). Pure helpers are unit-tested; `openWheelPicker` / `initWheels`
 * are the DOM side.
 * @module ui/wheel
 */
import { html, morph } from './dom.js';
import { locale, t } from '../core/i18n.js';
import { parseHM } from '../core/dates.js';
import { closeSheet, openSheet } from './sheet.js';

/** Visible rows and the snap height of one value (px). Touch-friendly at 360 px. */
export const WHEEL_ROWS = 5;
export const WHEEL_ITEM = 40;

const pad = (/** @type {number} */ n, w = 2) => String(n).padStart(w, '0');

/** Long month name in the active language (BG lowercase via the locale). @param {number} month 1–12 */
export function monthLabel(month, loc = locale()) {
  return new Intl.DateTimeFormat(loc, { month: 'long' }).format(new Date(2020, month - 1, 1));
}

/** @param {number} y @param {number} m 1–12 */
export const daysInMonth = (y, m) => new Date(y, m, 0).getDate();

/**
 * Minutes for a time (or duration) column. `current` is kept even when it is off the step.
 * @param {number} [step] @param {number} [current] @param {number} [max] inclusive
 */
export function minuteValues(step = 1, current = 0, max = 59) {
  const s = Math.max(1, Math.round(step) || 1);
  const out = [];
  for (let i = 0; i <= max; i += s) out.push(i);
  const c = Math.max(0, Math.min(max, Math.round(current)));
  if (!out.includes(c)) out.push(c);
  return out.sort((a, b) => a - b);
}

/** Hours 0–23, or 0–`max` for a duration. @param {number} [max] */
export const hourValues = (max = 23) => Array.from({ length: Math.max(0, max) + 1 }, (_, i) => i);

/**
 * Clamp "HH:MM" to [min, max] (same-day clock times). @param {string} hm @param {string} [min] @param {string} [max]
 * @returns {string}
 */
export function clampHM(hm, min, max) {
  const v = parseHM(hm) ?? '00:00';
  if (min && parseHM(min) && v < parseHM(min)) return /** @type {string} */ (parseHM(min));
  if (max && parseHM(max) && v > parseHM(max)) return /** @type {string} */ (parseHM(max));
  return v;
}

/** @param {string} iso */
export const isISODate = (iso) => /^\d{4}-\d{2}-\d{2}$/.test(iso ?? '');

/**
 * Clamp a YYYY-MM-DD date to [min, max]. @param {string} iso @param {string} [min] @param {string} [max]
 */
export function clampISO(iso, min, max) {
  let v = isISODate(iso) ? iso : isoDate(new Date());
  if (min && isISODate(min) && v < min) v = min;
  if (max && isISODate(max) && v > max) v = max;
  return v;
}

/** @param {Date|number} [d] */
export const isoDate = (d = new Date()) => {
  const x = new Date(d);
  return `${x.getFullYear()}-${pad(x.getMonth() + 1)}-${pad(x.getDate())}`;
};

/** @param {string} iso */
export function partsOf(iso) {
  const v = clampISO(iso);
  return { y: Number(v.slice(0, 4)), m: Number(v.slice(5, 7)), d: Number(v.slice(8, 10)) };
}

/**
 * Years offered in a date wheel. @param {string} [min] @param {string} [max]
 */
export function yearValues(min, max) {
  const today = new Date();
  const lo = min && isISODate(min) ? Number(min.slice(0, 4)) : today.getFullYear() - 10;
  const hi = max && isISODate(max) ? Number(max.slice(0, 4)) : today.getFullYear();
  const out = [];
  for (let y = lo; y <= hi; y++) out.push(y);
  return out.length ? out : [today.getFullYear()];
}

/**
 * "H:MM" or decimal hours → { h, m }. @param {string|number} v
 * @returns {{h: number, m: number}|null}
 */
export function parseDuration(v) {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) {
    const min = Math.round(v * 60);
    return { h: Math.floor(min / 60), m: min % 60 };
  }
  const s = String(v ?? '').trim();
  const m = /^(\d{1,2})\s*[:h., ]\s*(\d{1,2})$/.exec(s) || /^(\d{1,2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]),
    mm = Number(m[2] ?? 0);
  return h >= 0 && h <= 23 && mm >= 0 && mm <= 59 ? { h, m: mm } : null;
}

/** @param {number} h @param {number} m */
export const durationHM = (h, m) => `${h}:${pad(m)}`;

/** Decimal hours from a duration (to the minute). @param {number} h @param {number} m */
export const durationHours = (h, m) => Math.round(h * 60 + m) / 60;

/**
 * Open the wheel sheet. `onConfirm` receives "HH:MM" (time), "YYYY-MM-DD" (date), or
 * "H:MM" (duration). Return `false` to keep the sheet open (e.g. a validation toast).
 * @param {{
 *   mode: 'time'|'date'|'duration',
 *   value: string|number,
 *   min?: string,
 *   max?: string,
 *   step?: number,
 *   maxHours?: number,
 *   title?: string,
 *   hint?: string,
 *   label?: string,
 *   onConfirm: (value: string) => (void|boolean|Promise<void|boolean>),
 *   onClosed?: (value: string) => void,
 * }} o
 */
export function openWheelPicker(o) {
  const mode = o.mode;
  /** @type {{h: number, m: number, y: number, d: number}} */
  const st = stateFrom(o);
  const title = o.title ?? t(mode === 'date' ? 'wheel.date' : mode === 'duration' ? 'wheel.duration' : 'wheel.time');

  const view = {
    kind: /** @type {const} */ ('sheet'),
    render: () => html`<div class="wheelpick">
<h2 class="h3 xb center">${title}</h2>
${o.hint ? html`<p class="muted xs b center mt6 wheelhint">${o.hint}</p>` : ''}
<div class="wheels" role="group" aria-label="${title}">
<div class="wheelhi" aria-hidden="true"></div>
<div class="wcols">${cols(mode, st, o).map(col)}</div>
</div>
<button class="btn w100 mt16" data-act="ok">${t('common.done')}</button>
</div>`,
    mount: (el) => {
      bindScroll(el, st, o, () => refresh(el, st, o));
      snapAll(el, false);
    },
    actions: {
      ok: async () => {
        const v = valueOf(mode, st, o);
        const r = await o.onConfirm(v);
        if (r === false) return false;
        closeSheet();
        // After close, so a parent sheet's refreshSheet() targets the parent, not this wheel.
        o.onClosed?.(v);
        return false;
      },
    },
  };
  return openSheet(view);
}

/**
 * Turn a `[data-wheel]` field into a picker trigger (capture click, no keyboard).
 * After confirm, sets `.value` and dispatches the field's `data-change` / `data-input` event.
 */
export function initWheels() {
  if (typeof document === 'undefined' || /** @type {any} */ (initWheels).ok) return;
  /** @type {any} */ (initWheels).ok = true;
  document.addEventListener(
    'click',
    (e) => {
      const t = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest?.('[data-wheel]'));
      if (!t || t.closest('.wheelpick')) return;
      if (/** @type {any} */ (t).disabled || t.matches('.off,[disabled],.t24.off *')) return;
      e.preventDefault();
      e.stopPropagation();
      openFromField(t);
    },
    true,
  );
}

/**
 * @param {HTMLElement} el
 */
function openFromField(el) {
  const mode = /** @type {'time'|'date'|'duration'} */ (el.dataset.wheel ?? 'time');
  const value =
    'value' in el && /** @type {any} */ (el).value != null && /** @type {any} */ (el).value !== ''
      ? String(/** @type {any} */ (el).value)
      : (el.getAttribute('value') ?? '');
  openWheelPicker({
    mode,
    value,
    min: el.dataset.min || undefined,
    max: el.dataset.max || undefined,
    step: el.dataset.step ? Number(el.dataset.step) : undefined,
    maxHours: el.dataset.maxHours ? Number(el.dataset.maxHours) : undefined,
    label: el.getAttribute('aria-label') ?? undefined,
    onConfirm: (v) => {
      /** @type {any} */ (el).value = v;
      el.setAttribute('value', v);
    },
    onClosed: () => {
      if (!el.isConnected) return;
      const evName = el.dataset.input ? 'input' : 'change';
      el.dispatchEvent(new Event(evName, { bubbles: true }));
    },
  });
}

/**
 * @param {{mode: string, value: string|number, min?: string, max?: string, step?: number, maxHours?: number}} o
 */
function stateFrom(o) {
  if (o.mode === 'date') {
    const p = partsOf(clampISO(String(o.value || isoDate()), o.min, o.max));
    return { h: 0, m: 0, y: p.y, d: p.d, month: p.m };
  }
  if (o.mode === 'duration') {
    const d = parseDuration(o.value) ?? { h: 0, m: 0 };
    const maxH = o.maxHours ?? 16;
    return { h: Math.min(d.h, maxH), m: d.m, y: 0, d: 0, month: 1 };
  }
  const hm = clampHM(String(o.value || '00:00'), o.min, o.max)
    .split(':')
    .map(Number);
  return { h: hm[0], m: hm[1], y: 0, d: 0, month: 1 };
}

/** @param {string} mode @param {any} st @param {any} o */
function valueOf(mode, st, o) {
  if (mode === 'date') {
    const dim = daysInMonth(st.y, st.month);
    st.d = Math.min(st.d, dim);
    return clampISO(`${st.y}-${pad(st.month)}-${pad(st.d)}`, o.min, o.max);
  }
  if (mode === 'duration') return durationHM(st.h, st.m);
  return clampHM(`${pad(st.h)}:${pad(st.m)}`, o.min, o.max);
}

/**
 * @param {string} mode @param {any} st @param {any} o
 * @returns {{id: string, label: string, values: {v: number, text: string}[], current: number}[]}
 */
function cols(mode, st, o) {
  if (mode === 'date') {
    const dim = daysInMonth(st.y, st.month);
    if (st.d > dim) st.d = dim;
    const days = Array.from({ length: dim }, (_, i) => i + 1);
    const months = Array.from({ length: 12 }, (_, i) => i + 1);
    return [
      { id: 'day', label: t('wheel.day'), values: days.map((v) => ({ v, text: String(v) })), current: st.d },
      {
        id: 'month',
        label: t('wheel.month'),
        values: months.map((v) => ({ v, text: monthLabel(v) })),
        current: st.month,
      },
      {
        id: 'year',
        label: t('wheel.year'),
        values: yearValues(o.min, o.max).map((v) => ({ v, text: String(v) })),
        current: st.y,
      },
    ];
  }
  if (mode === 'duration') {
    const maxH = o.maxHours ?? 16;
    return [
      {
        id: 'hour',
        label: t('wheel.hours'),
        values: hourValues(maxH).map((v) => ({ v, text: String(v) })),
        current: st.h,
      },
      {
        id: 'minute',
        label: t('wheel.minute'),
        values: minuteValues(1, st.m).map((v) => ({ v, text: pad(v) })),
        current: st.m,
      },
    ];
  }
  const minH = o.min && parseHM(o.min) ? Number(parseHM(o.min).slice(0, 2)) : 0;
  const maxH = o.max && parseHM(o.max) ? Number(parseHM(o.max).slice(0, 2)) : 23;
  const hours = hourValues(23).filter((h) => h >= minH && h <= maxH);
  const mins = minutesForHour(st.h, o);
  if (!mins.includes(st.m) && mins.length)
    st.m = mins.reduce((a, b) => (Math.abs(b - st.m) < Math.abs(a - st.m) ? b : a));
  return [
    {
      id: 'hour',
      label: t('wheel.hour'),
      values: (hours.length ? hours : hourValues()).map((v) => ({ v, text: pad(v) })),
      current: st.h,
    },
    { id: 'minute', label: t('wheel.minute'), values: mins.map((v) => ({ v, text: pad(v) })), current: st.m },
  ];
}

/** Minutes allowed at `h` given min/max/step. @param {number} h @param {any} o */
function minutesForHour(h, o) {
  let lo = 0,
    hi = 59;
  const min = parseHM(o.min ?? '');
  const max = parseHM(o.max ?? '');
  if (min && Number(min.slice(0, 2)) === h) lo = Number(min.slice(3, 5));
  if (max && Number(max.slice(0, 2)) === h) hi = Number(max.slice(3, 5));
  if (min && h < Number(min.slice(0, 2))) return [lo];
  if (max && h > Number(max.slice(0, 2))) return [hi];
  return minuteValues(o.step ?? 1, undefined, 59).filter((m) => m >= lo && m <= hi);
}

/** @param {{id: string, label: string, values: {v: number, text: string}[], current: number}} c */
function col(c) {
  const cur = c.values.findIndex((x) => x.v === c.current);
  const i = cur < 0 ? 0 : cur;
  return html`<div class="wcol" data-col="${c.id}" aria-label="${c.label}">
<span class="wlab xs b muted">${c.label}</span>
<div class="wscroll" tabindex="0" data-i="${i}">
<div class="wpad" aria-hidden="true"></div>
${c.values.map((x, n) => html`<button type="button" class="witem${n === i ? ' on' : ''}" data-v="${x.v}" tabindex="-1">${x.text}</button>`)}
<div class="wpad" aria-hidden="true"></div>
</div></div>`;
}

/**
 * @param {HTMLElement} el @param {any} st @param {any} o @param {() => void} redraw
 */
function bindScroll(el, st, o, redraw) {
  if (el.dataset.wheelBound) return;
  el.dataset.wheelBound = '1';
  /** @type {WeakMap<Element, number>} */
  const timers = new WeakMap();
  el.addEventListener(
    'scroll',
    (e) => {
      const sc = e.target;
      if (!(sc instanceof HTMLElement) || !sc.classList.contains('wscroll')) return;
      const prev = timers.get(sc);
      if (prev) clearTimeout(prev);
      const colId = /** @type {HTMLElement} */ (sc.parentElement).dataset.col ?? '';
      timers.set(
        sc,
        window.setTimeout(() => applyScroll(sc, colId, st, o, redraw), 80),
      );
    },
    true,
  );
  el.addEventListener('click', (e) => {
    const b = /** @type {HTMLElement|null} */ (/** @type {HTMLElement} */ (e.target).closest('.witem'));
    const sc = b && /** @type {HTMLElement|null} */ (b.closest('.wscroll'));
    if (!b || !sc || !el.contains(sc)) return;
    const items = [...sc.querySelectorAll('.witem')];
    const i = items.indexOf(b);
    if (i < 0) return;
    sc.scrollTo({ top: i * WHEEL_ITEM, behavior: reduce() ? 'auto' : 'smooth' });
    const colId = /** @type {HTMLElement} */ (sc.parentElement).dataset.col ?? '';
    window.setTimeout(() => applyScroll(sc, colId, st, o, redraw), reduce() ? 0 : 180);
  });
}

function snapAll(el, smooth = false) {
  for (const sc of el.querySelectorAll('.wscroll')) {
    const i = Number(/** @type {HTMLElement} */ (sc).dataset.i ?? 0);
    sc.scrollTo({ top: i * WHEEL_ITEM, behavior: smooth && !reduce() ? 'smooth' : 'auto' });
  }
}

/**
 * @param {HTMLElement} sc @param {string} colId @param {any} st @param {any} o @param {() => void} redraw
 */
function applyScroll(sc, colId, st, o, redraw) {
  const items = [...sc.querySelectorAll('.witem')];
  if (!items.length) return;
  const i = Math.max(0, Math.min(items.length - 1, Math.round(sc.scrollTop / WHEEL_ITEM)));
  const v = Number(/** @type {HTMLElement} */ (items[i]).dataset.v);
  const prev = { h: st.h, m: st.m, y: st.y, d: st.d, month: st.month };
  if (colId === 'hour') st.h = v;
  else if (colId === 'minute') st.m = v;
  else if (colId === 'day') st.d = v;
  else if (colId === 'month') st.month = v;
  else if (colId === 'year') st.y = v;
  sc.scrollTo({ top: i * WHEEL_ITEM, behavior: 'auto' });
  items.forEach((n, k) => n.classList.toggle('on', k === i));
  const changed = st.h !== prev.h || st.m !== prev.m || st.y !== prev.y || st.d !== prev.d || st.month !== prev.month;
  // month/year (or the hour, which changes the allowed minutes) need a fresh column
  if (changed && (colId === 'month' || colId === 'year' || colId === 'hour')) redraw();
}

/** @param {HTMLElement} el @param {any} st @param {any} o */
function refresh(el, st, o) {
  const root = el.querySelector('.wcols');
  if (!root) return;
  morph(root, html`${cols(o.mode, st, o).map(col)}`);
  snapAll(el, false);
}

const reduce = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
