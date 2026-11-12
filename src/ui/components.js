/**
 * Small shared UI components (pure functions returning safe HTML).
 * All interactive parts are real <button>s with ≥44px touch targets and aria labels.
 * @module ui/components
 */
import { html, raw } from './dom.js';
import { fmtDate, fmtHM, fmtNum, t } from '../core/i18n.js';
import { parseDay } from '../core/dates.js';
import { ic } from './icons.js';
import { initWheels } from './wheel.js';

/**
 * Progress ring.
 * @param {number} size
 * @param {number} sw Stroke width.
 * @param {number} pct 0..1
 * @param {{color?: string, track?: string, inner?: any, label?: string}} [o]
 */
export function ring(size, sw, pct, o = {}) {
  const r = (size - sw) / 2,
    c = 2 * Math.PI * r,
    p = Math.max(0, Math.min(1, pct || 0));
  return html`<div class="ring" style="width:${size}px;height:${size}px" role="img" aria-label="${o.label ?? Math.round(p * 100) + '%'}">
<svg width="${size}" height="${size}" aria-hidden="true"><circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${o.track ?? 'var(--soft)'}" stroke-width="${sw}"/>
${p > 0 ? html`<circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${o.color ?? 'var(--accent)'}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${c * p} ${c}"/>` : ''}</svg>
<div class="ring-in">${o.inner ?? ''}</div></div>`;
}

/**
 * Horizontal progress bar.
 * @param {number} pct 0..1
 * @param {string} [color]
 * @param {string} [cls]
 */
export const bar = (pct, color = 'var(--accent)', cls = '') =>
  html`<div class="bar ${cls}"><i style="width:${Math.min(100, Math.max(0, (pct || 0) * 100))}%;background:${color}"></i></div>`;

/**
 * [-] value [+] stepper. Buttons fire `act` with data-d = ±1; the value is an editable input
 * firing `act` via change with the typed value.
 * @param {{act: string, value: string|number, unit?: string, data?: Record<string,any>, label: string, disabled?: boolean, id?: string, big?: boolean, wide?: boolean}} o
 */
export function stepper(o) {
  const attrs = raw(
    Object.entries(o.data ?? {})
      .map(([k, v]) => `data-${k}="${v}"`)
      .join(' '),
  );
  const dis = o.disabled ? raw('disabled') : '';
  return html`<div class="step${o.big ? ' big' : ''}${o.wide ? ' wide' : ''}">
<button class="sb" data-act="${o.act}" data-d="-1" ${attrs} ${dis} aria-label="${o.label} −">${ic('minus', o.big ? 24 : 16, 2.6)}</button>
<label class="sv num"><input id="${o.id ?? ''}" type="text" inputmode="decimal" value="${o.value}" data-change="${o.act}" ${attrs} ${dis} aria-label="${o.label}"/>${o.unit ? html`<small>${o.unit}</small>` : ''}</label>
<button class="sb" data-act="${o.act}" data-d="1" ${attrs} ${dis} aria-label="${o.label} +">${ic('plus', o.big ? 24 : 16, 2.6)}</button></div>`;
}

/**
 * On/off switch.
 * @param {boolean} on
 * @param {string} act
 * @param {string} label
 * @param {Record<string,string>} [data]
 */
export const toggle = (on, act, label, data = {}) =>
  html`<button class="toggle${on ? ' on' : ''}" role="switch" aria-checked="${String(on)}" aria-label="${label}" data-act="${act}"
  ${raw(
    Object.entries(data)
      .map(([k, v]) => `data-${k}="${v}"`)
      .join(' '),
  )}></button>`;

/**
 * Segmented control.
 * @param {{value: string, label: any}[]} opts
 * @param {string} active
 * @param {string} act Action receiving data-v.
 * @param {string} [cls] `seg` (large) or `mini`.
 */
export const seg = (opts, active, act, cls = 'seg') =>
  html`<div class="${cls}" role="radiogroup">${opts.map(
    (o) =>
      html`<button class="${o.value === active ? 'on' : ''}" role="radio" aria-checked="${String(o.value === active)}" data-act="${act}" data-v="${o.value}">${o.label}</button>`,
  )}</div>`;

/**
 * Square icon button.
 * @param {string} icon
 * @param {string} label aria-label
 * @param {string} attrs Raw attribute string, e.g. `data-act="x"`.
 * @param {string} [cls]
 */
export const iconBtn = (icon, label, attrs, cls = '') =>
  html`<button class="iconbtn ${cls}" aria-label="${label}" ${raw(attrs)}>${ic(icon, 21)}</button>`;

/**
 * Screen header with back button and centered title.
 * @param {string} title
 * @param {any} [sub]
 * @param {any} [right]
 */
export const topBar = (title, sub = '', right = html`<span class="iconbtn ghost" aria-hidden="true"></span>`) =>
  html`<header class="row between topbar"><button class="iconbtn" data-back aria-label="${t('common.back')}">${ic('back', 22)}</button>
<div class="center"><h1 class="h2">${title}</h1>${sub ? html`<div class="muted xs b">${sub}</div>` : ''}</div>${right}</header>`;

/**
 * Delta pill (e.g. "↓ 0.8 kg").
 * @param {number} d
 * @param {string} unit
 * @param {number} [digits]
 */
export function delta(d, unit = '', digits = 1) {
  const r = Math.round(d * 10 ** digits) / 10 ** digits;
  if (!r) return html`<span class="delta n">±0</span>`;
  return html`<span class="delta ${r < 0 ? 'g' : 'u'}">${ic(r < 0 ? 'dn' : 'up', 11, 3)}${fmtNum(Math.abs(r), digits)}${unit ? ' ' + unit : ''}</span>`;
}

/** Empty-state block. @param {string} icon @param {string} text */
export const empty = (icon, text) =>
  html`<div class="empty">${ic(icon, 28, 2)}<div class="b muted">${text}</div></div>`;

/**
 * Time field that always shows the app's clock style (24 h for BG, the locale's for EN).
 * A tap opens the shared scroll-wheel picker (no keyboard, no system time input).
 * `data-change` gets its "HH:MM" value.
 * @param {{value: string, act: string, label: string, k?: string, disabled?: boolean, cls?: string, min?: string, max?: string, step?: number}} o
 */
export const timeInput = (o) =>
  html`<button type="button" class="input tbox ${o.cls ?? ''}${o.disabled ? ' off' : ''}" value="${o.value}" data-wheel="time" data-change="${o.act}" data-step="${o.step ?? 1}" ${o.k ? raw(`data-k="${o.k}"`) : ''} ${o.min ? raw(`data-min="${o.min}"`) : ''} ${o.max ? raw(`data-max="${o.max}"`) : ''} aria-label="${o.label}" ${o.disabled ? raw('disabled') : ''}><span class="tval num">${fmtHM(o.value)}</span></button>`;

/**
 * 24-hour time with −/+ steps. 1.6.4: the middle control opens the scroll-wheel picker
 * (no keyboard, every minute). The step buttons still move the time by `o.mins`.
 * `data-change` gets a complete "HH:MM". Optional `min` / `max` ("HH:MM") limit the wheel.
 * @param {{value: string, act: string, step: string, f?: string, label: string, mins?: number, bad?: boolean, cls?: string, min?: string, max?: string}} o
 */
export const time24 = (o) => {
  const d = o.mins ?? 15,
    f = o.f ? raw(` data-f="${o.f}"`) : '',
    min = o.min ? raw(` data-min="${o.min}"`) : '',
    max = o.max ? raw(` data-max="${o.max}"`) : '';
  // The wheel lists every minute; −/+ still move by `d`. A 5-min wheel could not
  // replace a typed time like 06:42 (sleep) or 08:29 (meal clock).
  return html`<span class="t24 ${o.cls ?? ''}${o.bad ? ' bad' : ''}"><button type="button" class="t24b" data-act="${o.step}"${f} data-d="-${d}" aria-label="${t('time24.minus', { n: d })}">${ic('minus', 18, 2.6)}</button><button type="button" class="t24i num" value="${o.value}" data-wheel="time" data-change="${o.act}"${min}${max} aria-label="${o.label}" aria-invalid="${o.bad ? 'true' : 'false'}">${o.value}</button><button type="button" class="t24b" data-act="${o.step}"${f} data-d="${d}" aria-label="${t('time24.plus', { n: d })}">${ic('plus', 18, 2.6)}</button></span>`;
};

/**
 * Date field: a tap opens the day / month / year scroll wheels (no native date keyboard).
 * `data-change` (or `data-input` when `o.input`) gets "YYYY-MM-DD". Optional `min` / `max`.
 * @param {{value: string, act: string, label: string, min?: string, max?: string, id?: string, k?: string, i?: number, cls?: string, input?: boolean, text?: string}} o
 */
export function dateField(o) {
  const ev = o.input ? `data-input="${o.act}"` : `data-change="${o.act}"`;
  const text =
    o.text ?? (o.value ? fmtDate(parseDay(o.value), { weekday: 'short', day: 'numeric', month: 'short' }) : '');
  return html`<button type="button" class="input dfield ${o.cls ?? ''}" ${o.id ? raw(`id="${o.id}"`) : ''} ${raw(ev)} value="${o.value}" data-wheel="date" ${o.k ? raw(`data-k="${o.k}"`) : ''} ${o.i != null ? raw(`data-i="${o.i}"`) : ''} ${o.min ? raw(`data-min="${o.min}"`) : ''} ${o.max ? raw(`data-max="${o.max}"`) : ''} aria-label="${o.label}">${text}</button>`;
}

/**
 * Sleep-duration field (hours + minutes wheels). `value` is decimal hours; the confirm
 * value is "H:MM" (see `parseDuration`).
 * @param {{value: number, act: string, label: string, i?: number, maxHours?: number, cls?: string}} o
 */
export function durationField(o) {
  const min = Math.max(0, Math.round(Number(o.value || 0) * 60));
  const h = Math.floor(min / 60),
    m = min % 60,
    hm = `${h}:${String(m).padStart(2, '0')}`;
  return html`<button type="button" class="input durfield num ${o.cls ?? ''}" value="${hm}" data-wheel="duration" data-change="${o.act}" data-max-hours="${o.maxHours ?? 16}" ${o.i != null ? raw(`data-i="${o.i}"`) : ''} aria-label="${o.label}">${h} ${t('unit.h')} ${String(m).padStart(2, '0')} ${t('unit.min')}</button>`;
}

if (typeof document !== 'undefined') initWheels();
