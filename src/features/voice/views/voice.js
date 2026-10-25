/**
 * "Say it" sheets: (1) a text box for the phone keyboard's dictation (or typing; on
 * Android Chrome the browser's speech recognition is offered too), sent to the voice
 * server; (2) a confirm sheet with the parsed foods and water — grams, glasses and meal
 * can be changed and items removed. Nothing is saved until **Save**; then the rows go
 * through the food API, so quests, XP and the micro animations work as usual.
 * @module features/voice/views/voice
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, getLang, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { stepper } from '../../../ui/components.js';
import { closeSheet, openSheet, whenSettled } from '../../../ui/sheet.js';
import { logRows, setWater, water } from '../../food/api.js';
import { isIOS } from '../../profile/api.js';
import { parseText } from '../api.js';
import { MAX_TEXT, MEALS, foodRows, localDay, prepare, totalKcal, waterByDay, withGrams } from '../logic.js';

/** Browser speech recognition (Android Chrome); iOS users use the keyboard's mic instead. */
const Speech = () =>
  isIOS()
    ? null
    : /** @type {any} */ (globalThis).SpeechRecognition || /** @type {any} */ (globalThis).webkitSpeechRecognition;

/**
 * Open the dictation sheet.
 * @param {{meal?: string, text?: string}} o
 */
export function openVoice(o = {}) {
  let text = o.text ?? '',
    busy = false,
    err = '',
    listening = false;
  /** @type {any} */
  let rec = null;
  const SR = Speech();

  const sync = (/** @type {HTMLElement} */ root) => {
    const n = root.querySelector('#vcount'),
      b = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-act="parse"]'));
    if (n) n.textContent = `${text.length}/${MAX_TEXT}`;
    if (b) b.disabled = busy || !text.trim();
  };

  openSheet({
    kind: 'sheet',
    onClose: () => rec?.abort?.(),
    render: () => html`<div class="voice"><div class="row gap10"><span class="sq acc">${ic('mic', 20, 2.2)}</span>
<h2 class="h2 f1">${t('voice.title')}</h2></div>
<p class="muted small b mt6 lh">${t('voice.hint')}</p>
<label class="field vbox mt12"><textarea id="vtext" class="bare" rows="4" maxlength="${MAX_TEXT}" data-input="text" placeholder="${t('voice.ph')}" aria-label="${t('voice.title')}" ${busy ? 'disabled' : ''}>${text}</textarea></label>
<div class="row between mt6"><span class="muted xs b">${t('voice.privacy')}</span><span class="muted xs b num" id="vcount">${text.length}/${MAX_TEXT}</span></div>
${err ? html`<p class="verr small b mt8" role="alert">${err}</p>` : ''}
<div class="row gap10 mt14">
${SR ? html`<button class="btn sec f1${listening ? ' rec' : ''}" data-act="listen" aria-pressed="${String(listening)}">${ic('mic', 18, 2.4)}${listening ? t('voice.stop') : t('voice.dictate')}</button>` : ''}
<button class="btn f2" data-act="parse" ${busy || !text.trim() ? 'disabled' : ''}>${busy ? html`<span class="spin" aria-hidden="true"></span>${t('voice.thinking')}` : html`${ic('check', 18, 3)}${t('voice.parse')}`}</button></div></div>`,
    mount: (el) => {
      const ta = /** @type {HTMLTextAreaElement | null} */ (el.querySelector('#vtext'));
      ta?.focus();
    },
    actions: {
      text: (el) => {
        text = /** @type {HTMLTextAreaElement} */ (el).value.slice(0, MAX_TEXT);
        sync(/** @type {HTMLElement} */ (el.closest('.voice')));
        return false;
      },
      listen: () => {
        if (listening) return void rec?.stop();
        rec = new SR();
        rec.lang = getLang() === 'en' ? 'en-US' : 'bg-BG';
        rec.interimResults = false;
        rec.continuous = false;
        const before = text;
        rec.onresult = (/** @type {any} */ e) => {
          const said = Array.from(e.results, (/** @type {any} */ r) => r[0].transcript).join(' ');
          text = `${before ? `${before} ` : ''}${said}`.slice(0, MAX_TEXT);
        };
        rec.onend = () => ((listening = false), emit('ui:refresh'));
        rec.onerror = () => ((listening = false), emit('ui:refresh'));
        listening = true;
        rec.start();
      },
      parse: async () => {
        if (busy || !text.trim()) return false;
        busy = true;
        err = '';
        emit('ui:refresh');
        try {
          const entries = await parseText(text);
          busy = false;
          if (!entries.length) {
            err = t('voice.nothing');
            emit('ui:refresh');
            return false;
          }
          closeSheet();
          whenSettled(() => openConfirm(entries, text, o.meal));
        } catch (e) {
          busy = false;
          err = t(`voice.err.${/** @type {Error} */ (e).message}`);
          emit('ui:refresh');
        }
        return false;
      },
    },
  });
}

/**
 * Open the confirm sheet for parsed entries.
 * @param {any[]} parsed Entries from the server.
 * @param {string} [text] The sentence (to go back and fix it).
 * @param {string} [meal] Meal of the Food › Add screen it was opened from.
 */
export function openConfirm(parsed, text = '', meal = '') {
  const glassMl = settings().glassMl || 250;
  const today = localDay(new Date()),
    yesterday = localDay(new Date(Date.now() - 864e5));
  // Opened from Food › Add <meal>: today's foods go to that meal (still changeable per item).
  let list = prepare(parsed, glassMl).map((e) => (meal && e.type === 'food' && e.date === today ? { ...e, meal } : e));
  const when = (/** @type {{date: string, time: string|null}} */ e) =>
    [
      e.date === today
        ? ''
        : e.date === yesterday
          ? t('voice.yesterday')
          : fmtDate(new Date(`${e.date}T12:00`), { day: 'numeric', month: 'short' }),
      e.time ?? '',
    ]
      .filter(Boolean)
      .join(' · ');
  const mealSel = (/** @type {any} */ e, /** @type {number} */ i) =>
    html`<select class="vmeal" data-change="meal" data-i="${i}" aria-label="${t('voice.meal')}">${MEALS.map((m) => html`<option value="${m}" ${m === e.meal ? 'selected' : ''}>${t(`meal.${m}`)}</option>`)}</select>`;

  const row = (/** @type {any} */ e, /** @type {number} */ i) =>
    e.type === 'water'
      ? html`<li class="vitem water"><div class="row gap10"><span class="fic">💧</span><div class="f1 minw0"><div class="b">${t('voice.water')}</div>
<div class="muted xs b">${t('voice.glassesMl', { n: e.glasses, ml: e.glasses * glassMl })}${when(e) ? ` · ${when(e)}` : ''}</div></div>
<button class="iconbtn flat sm" data-act="del" data-i="${i}" aria-label="${t('common.remove')} ${t('voice.water')}">${ic('close', 16, 2.6)}</button></div>
<div class="mt8">${stepper({ act: 'glasses', value: e.glasses, unit: t('voice.glassUnit'), label: t('voice.water'), data: { i: String(i) } })}</div></li>`
      : html`<li class="vitem"><div class="row gap10"><span class="fic">${foodRows([e], new Date())[0].emoji}</span><div class="f1 minw0"><div class="b ell">${e.name}</div>
<div class="muted xs b">${e.amount ? `${e.amount} · ` : ''}${e.kcal} kcal · ${t('food.p')} ${Math.round(e.protein)} · ${t('food.c')} ${Math.round(e.carbs)} · ${t('food.f')} ${Math.round(e.fat)}${when(e) ? ` · ${when(e)}` : ''}</div></div>
<button class="iconbtn flat sm" data-act="del" data-i="${i}" aria-label="${t('common.remove')} ${e.name}">${ic('close', 16, 2.6)}</button></div>
<div class="row gap8 mt8">${stepper({ act: 'grams', value: e.grams, unit: 'g', label: `${e.name} g`, data: { i: String(i) } })}${mealSel(e, i)}</div></li>`;

  openSheet({
    kind: 'sheet',
    render: () => html`<div class="vconfirm"><h2 class="h2">${t('voice.confirmTitle')}</h2>
<p class="muted small b mt4">${t('voice.confirmSub')}</p>
${list.length ? html`<ul class="vlist mt12">${list.map(row)}</ul>` : html`<p class="muted b center mt16">${t('voice.allRemoved')}</p>`}
<div class="row between mt12 px4"><span class="muted small b">${t('voice.total')}</span><span class="b num">${totalKcal(list)} kcal</span></div>
<div class="row gap10 mt14 sticky-b"><button class="btn sec f1" data-act="back">${ic('edit', 18)}${t('voice.fix')}</button>
<button class="btn f2" data-act="save" ${list.length ? '' : 'disabled'}>${ic('check', 18, 3)}${t('voice.save')}</button></div></div>`,
    actions: {
      grams: (el, ev) => {
        const i = Number(el.dataset.i),
          e = /** @type {any} */ (list[i]);
        const g =
          ev.type === 'change'
            ? parseFloat(/** @type {HTMLInputElement} */ (el).value) || e.grams
            : e.grams + Number(el.dataset.d) * 10;
        list = list.map((x, k) => (k === i ? withGrams(/** @type {any} */ (x), g) : x));
      },
      glasses: (el, ev) => {
        const i = Number(el.dataset.i),
          e = /** @type {any} */ (list[i]);
        const n =
          ev.type === 'change'
            ? parseInt(/** @type {HTMLInputElement} */ (el).value, 10) || e.glasses
            : e.glasses + Number(el.dataset.d);
        list = list.map((x, k) => (k === i ? { ...x, glasses: Math.max(1, Math.min(20, n)) } : x));
      },
      meal: (el) => {
        const i = Number(el.dataset.i);
        list = list.map((x, k) => (k === i ? { ...x, meal: /** @type {HTMLSelectElement} */ (el).value } : x));
      },
      del: (el) => void (list = list.filter((_, k) => k !== Number(el.dataset.i))),
      back: () => {
        closeSheet();
        whenSettled(() => openVoice({ text, meal }));
        return false;
      },
      save: () => {
        if (!list.length) return false;
        const now = new Date();
        const rows = foodRows(list, now);
        if (rows.length) logRows(rows);
        for (const [date, n] of Object.entries(waterByDay(list))) setWater(date, water(date) + n);
        closeSheet();
        emit('toast', { text: t('voice.saved', { n: list.length }) });
        return false;
      },
    },
  });
}
