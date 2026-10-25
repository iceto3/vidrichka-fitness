/**
 * "Say it" sheet: a text box for the phone keyboard's dictation (or typing; on Android
 * Chrome the browser's speech recognition is offered too), sent to the voice server.
 * 1.3.1: the parsed foods and water are saved straight away into the meal named in the
 * sentence (else the screen's / current meal), the sheet closes and an Undo snackbar lists
 * what was added. Items can be fixed afterwards in the meal sheet (tap an item). Rows go
 * through the food API, so quests, XP and the micro animations work as usual.
 * @module features/voice/views/voice
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, getLang, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast, whenSettled } from '../../../ui/sheet.js';
import { logRows, setWater, water } from '../../food/api.js';
import { mealFor } from '../../food/logic.js';
import { isIOS } from '../../profile/api.js';
import { parseText } from '../api.js';
import { MAX_TEXT, MEALS, assignMeals, foodRows, localDay, prepare, waterByDay } from '../logic.js';

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
          whenSettled(() => saveEntries(entries, o.meal));
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
 * Save parsed entries right away and offer Undo (removes the rows, puts the water back).
 * @param {any[]} parsed Entries from the server.
 * @param {string} [screenMeal] Meal of the Food › Add screen it was opened from.
 * @param {Date} [now]
 * @returns {{rows: any[], water: Record<string, number>, text: string}}
 */
export function saveEntries(parsed, screenMeal = '', now = new Date()) {
  const glassMl = settings().glassMl || 250;
  const today = localDay(now);
  const list = assignMeals(prepare(parsed, glassMl), { today, screenMeal, defaultMeal: mealFor(now) });
  const rows = foodRows(list, now);
  const saved = rows.length ? logRows(rows) : [];
  /** @type {Record<string, number>} */
  const before = {};
  for (const [date, n] of Object.entries(waterByDay(list))) {
    before[date] = water(date);
    setWater(date, before[date] + n);
  }
  const text = summary(list, saved, today);
  toast(text);
  return { rows: saved, water: before, text };
}

/**
 * Snackbar text: "Добавено в Закуска: кебапчета, лютеница, сода" (one meal today), else
 * grouped per day and meal; water as "+2 чаши вода".
 * @param {import('../logic.js').Entry[]} list @param {any[]} rows @param {string} today
 */
function summary(list, rows, today) {
  const yesterday = localDay(new Date(new Date(`${today}T12:00`).getTime() - 864e5));
  const day = (/** @type {string} */ d) =>
    d === today
      ? ''
      : d === yesterday
        ? t('voice.yesterday')
        : fmtDate(new Date(`${d}T12:00`), { day: 'numeric', month: 'short' });
  /** @type {Map<string, string[]>} */
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.date}|${r.meal}`;
    groups.set(k, [...(groups.get(k) ?? []), t('voice.item', { name: r.name, g: r.grams })]);
  }
  const glasses = list.reduce((a, e) => a + (e.type === 'water' ? (e.glasses ?? 1) : 0), 0);
  const waterTxt = glasses ? t('voice.waterAdded', { n: glasses }) : '';
  const keys = [...groups.keys()];
  if (keys.length === 1 && keys[0].startsWith(`${today}|`)) {
    const meal = t(`meal.${keys[0].split('|')[1]}`).toLowerCase();
    return t('voice.savedTo', {
      meal,
      items: [.../** @type {string[]} */ (groups.get(keys[0])), waterTxt].filter(Boolean).join(', '),
    });
  }
  const parts = keys
    .sort((a, b) => {
      const [da, ma] = a.split('|'),
        [db, mb] = b.split('|');
      return da.localeCompare(db) || MEALS.indexOf(ma) - MEALS.indexOf(mb);
    })
    .map((k) => {
      const [d, m] = k.split('|');
      const label = [day(d), t(`meal.${MEALS.includes(m) ? m : 'snack'}`)].filter(Boolean).join(' ');
      return `${label}: ${/** @type {string[]} */ (groups.get(k)).join(', ')}`;
    });
  return t('voice.savedDays', { items: [...parts, waterTxt].filter(Boolean).join(' · ') });
}
