/**
 * "Say it" sheet: a text box for the phone keyboard's dictation (or typing; on Android
 * Chrome the browser's speech recognition is offered too), sent to the voice server.
 * 1.3.1: the parsed foods and water are saved straight away into the meal named in the
 * sentence (else the screen's / current meal), the sheet closes and an Undo snackbar lists
 * what was added. Items can be fixed afterwards in the meal sheet (tap an item). Rows go
 * through the food API, so quests, XP and the micro animations work as usual.
 * 1.3.3: everywhere except Android Chrome (iPhone Safari / PWA included) a "Запиши" button
 * records up to 30 s in the app; the server turns it into text, which lands in the box for
 * review before "Разчети".
 * @module features/voice/views/voice
 */
import { html } from '../../../ui/dom.js';
import { fmtDate, fmtNum, getLang, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast, whenSettled } from '../../../ui/sheet.js';
import { logRows, setWater, view as foodView, water } from '../../food/api.js';
import { addSteps, setSteps, steps } from '../../steps/api.js';
import { day, rateDay, setSleep } from '../../daily/api.js';
import { addMeasurement } from '../../body/api.js';
import { celebrate, holdCelebrations } from '../../celebrations/api.js';
import { planTour, playTour } from '../tour.js';
import { FACES } from '../../daily/views/checkin.js';
import { mealFor } from '../../food/logic.js';
import { parseText, sttReady, transcribeAudio } from '../api.js';
import { MAX_REC_MS, canRecord, clock, isAndroidChrome, startRecording } from '../recorder.js';
import { MAX_TEXT, MEALS, OTHER, assignMeals, foodRows, localDay, prepare, waterByDay } from '../logic.js';

/** Browser speech recognition, only on Android Chrome; elsewhere the in-app recorder is used. */
const Speech = () =>
  isAndroidChrome()
    ? /** @type {any} */ (globalThis).SpeechRecognition || /** @type {any} */ (globalThis).webkitSpeechRecognition
    : null;

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
  /** In-app recorder state: idle → rec (recording) → stt (recognising). */
  let recState = /** @type {'idle' | 'rec' | 'stt'} */ ('idle');
  /** @type {import('../recorder.js').Recording | null} */
  let recording = null;
  let elapsed = 0;
  const REC = !SR && canRecord() && sttReady();
  /** Live timer / meter updates without re-rendering the sheet. */
  const live = () => /** @type {HTMLElement | null} */ (document.querySelector('.voice'));

  /** Send the finished recording for transcription and put the text in the box. */
  let closed = false;
  const recognise = async (/** @type {Promise<Blob>} */ done) => {
    const audio = await done; // after a tap on Stop or the 30 s limit; the mic is off now
    if (closed) return;
    recState = 'stt';
    emit('ui:refresh');
    try {
      const said = await transcribeAudio(audio);
      if (closed) return;
      text = `${text.trim() ? `${text.trim()} ` : ''}${said}`.slice(0, MAX_TEXT);
      err = '';
    } catch (e) {
      if (closed) return;
      err = t(`voice.err.${/** @type {Error} */ (e).message}`);
    }
    recState = 'idle';
    recording = null;
    emit('ui:refresh');
  };

  const sync = (/** @type {HTMLElement} */ root) => {
    const n = root.querySelector('#vcount'),
      b = /** @type {HTMLButtonElement | null} */ (root.querySelector('[data-act="parse"]'));
    if (n) n.textContent = `${text.length}/${MAX_TEXT}`;
    if (b) b.disabled = busy || !text.trim();
  };

  openSheet({
    kind: 'sheet',
    onClose: () => ((closed = true), rec?.abort?.(), recording?.cancel()),
    render: () => html`<div class="voice"><div class="row gap10"><span class="sq acc">${ic('mic', 20, 2.2)}</span>
<h2 class="h2 f1">${t('voice.title')}</h2></div>
<p class="muted small b mt6 lh">${t(REC ? 'voice.hintRec' : 'voice.hint')}</p>
<label class="field vbox mt12"><textarea id="vtext" class="bare" rows="4" maxlength="${MAX_TEXT}" data-input="text" placeholder="${t('voice.ph')}" aria-label="${t('voice.title')}" ${busy || recState !== 'idle' ? 'disabled' : ''}>${text}</textarea></label>
${
  recState === 'rec'
    ? html`<div class="vrec row gap10 mt10" role="status"><span class="vdot" aria-hidden="true"></span><span class="b small num vtimer">${clock(elapsed)} / ${clock(MAX_REC_MS)}</span><span class="vlevel f1" role="meter" aria-label="${t('voice.level')}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0"><i></i></span></div>`
    : ''
}
<div class="row between mt6"><span class="muted xs b">${t(REC ? 'voice.privacyRec' : 'voice.privacy')}</span><span class="muted xs b num" id="vcount">${text.length}/${MAX_TEXT}</span></div>
${err ? html`<p class="verr small b mt8" role="alert">${err}</p>` : ''}
<div class="row gap10 mt14">
${
  REC
    ? html`<button class="btn sec ${recState === 'stt' ? 'f2' : 'f1'}${recState === 'rec' ? ' rec' : ''}" data-act="record" aria-pressed="${String(recState === 'rec')}" ${recState === 'stt' || busy ? 'disabled' : ''}>${
        recState === 'stt'
          ? html`<span class="spin" aria-hidden="true"></span>${t('voice.transcribing')}`
          : html`${ic('mic', 18, 2.4)}${recState === 'rec' ? t('voice.stop') : t('voice.record')}`
      }</button>`
    : ''
}
${SR ? html`<button class="btn sec f1${listening ? ' rec' : ''}" data-act="listen" aria-pressed="${String(listening)}">${ic('mic', 18, 2.4)}${listening ? t('voice.stop') : t('voice.dictate')}</button>` : ''}
<button class="btn ${recState === 'stt' ? 'f1' : 'f2'}" data-act="parse" ${busy || recState !== 'idle' || !text.trim() ? 'disabled' : ''}>${busy ? html`<span class="spin" aria-hidden="true"></span>${t('voice.thinking')}` : html`${ic('check', 18, 3)}${t('voice.parse')}`}</button></div></div>`,
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
      record: async () => {
        if (recState === 'stt') return false;
        if (recState === 'rec') {
          if (recording) void recording.stop();
          return false;
        }
        err = '';
        elapsed = 0;
        try {
          recording = await startRecording({
            onTick: (ms) => {
              elapsed = ms;
              const el = live()?.querySelector('.vtimer');
              if (el) el.textContent = `${clock(ms)} / ${clock(MAX_REC_MS)}`;
            },
            onLevel: (v) => {
              const m = /** @type {HTMLElement | null} */ (live()?.querySelector('.vlevel'));
              if (!m) return;
              m.style.setProperty('--lv', v.toFixed(2));
              m.setAttribute('aria-valuenow', String(Math.round(v * 100)));
            },
          });
        } catch (e) {
          err = t(`voice.err.${/** @type {Error} */ (e).message}`);
          emit('ui:refresh');
          return false;
        }
        if (closed) return void recording.cancel();
        recState = 'rec';
        void recognise(recording.done);
        emit('ui:refresh');
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
 * Save parsed entries right away (1.3.4: also steps, sleep, weight, mood and energy), then
 * show where they landed with the post-voice tour and ONE celebration at the end.
 * @param {any[]} parsed Entries from the server.
 * @param {string} [screenMeal] Meal of the Food › Add screen it was opened from.
 * @param {Date} [now]
 * @param {{tour?: boolean}} [o] `tour: false` saves without the tour (tests).
 * @returns {{rows: any[], water: Record<string, number>, text: string, saved: import('../tour.js').Saved[]}}
 */
export function saveEntries(parsed, screenMeal = '', now = new Date(), o = {}) {
  const glassMl = settings().glassMl || 250;
  const today = localDay(now);
  const list = assignMeals(prepare(parsed, glassMl), { today, screenMeal, defaultMeal: mealFor(now) });
  const play = o.tour !== false;
  if (play) holdCelebrations(true);
  /** @type {import('../tour.js').Saved[]} */
  const done = [];
  const goalsBefore = { water: water(today), stepsCel: !!day(today).stepsCel };
  try {
    const rows = foodRows(list, now);
    const saved = rows.length ? logRows(rows) : [];
    saved.forEach((r) => done.push({ kind: 'food', date: r.date, meal: r.meal, emoji: r.emoji }));
    /** @type {Record<string, number>} */
    const before = {};
    for (const [date, n] of Object.entries(waterByDay(list))) {
      before[date] = water(date);
      setWater(date, before[date] + n);
      done.push({ kind: 'water', date, before: before[date], after: before[date] + n });
    }
    for (const e of list) {
      if (!OTHER.includes(e.type)) continue;
      const x = /** @type {import('../logic.js').OtherEntry} */ (e);
      if (x.type === 'steps' && x.value) {
        const b = steps(x.date);
        const after = x.total ? setSteps(x.date, x.value) : addSteps(x.date, x.value);
        done.push({ kind: 'steps', date: x.date, before: b, after });
      } else if (x.type === 'sleep') {
        setSleep(x.date, { hours: x.value, q: x.quality });
        done.push({ kind: 'sleep', date: x.date });
      } else if (x.type === 'weight' && x.value) {
        addMeasurement({ date: x.date, weight: x.value });
        done.push({ kind: 'weight', date: x.date });
      } else if ((x.type === 'mood' || x.type === 'energy') && x.value) {
        rateDay(x.date, x.type, x.value);
        done.push({ kind: x.type, date: x.date });
      }
    }
    const tour = planTour(done, today);
    const text = tour.mode === 'summary' ? t('voice.savedMany', { n: done.length }) : summary(list, saved, today);
    toast(text);
    if (play) {
      const goal = settings().waterGoal || 8;
      const waterGoal = goalsBefore.water < goal && water(today) >= goal;
      const stepsGoal = !goalsBefore.stepsCel && !!day(today).stepsCel;
      void playTour(tour, {
        prepare: (st) => {
          const d = st.items[0]?.date;
          if (st.route === 'food' && d) foodView.date = d;
        },
        onDone: () => {
          holdCelebrations(false);
          celebrate({
            size: 'small',
            icon: stepsGoal ? 'steps' : waterGoal ? 'drop' : 'mic',
            title: stepsGoal ? t('cel.steps') : waterGoal ? t('cel.waterGoalVoice') : t('voice.celTitle'),
            sub: done.length === 1 ? text : t('voice.savedMany', { n: done.length }),
          });
        },
      });
    }
    return { rows: saved, water: before, text, saved: done };
  } catch (err) {
    holdCelebrations(false);
    throw err;
  }
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
  const glasses = list.reduce((a, e) => a + (e.type === 'water' ? /** @type {any} */ (e.glasses ?? 1) : 0), 0);
  const waterTxt = [glasses ? t('voice.waterAdded', { n: glasses }) : '', ...list.map(otherText)]
    .filter(Boolean)
    .join(', ');
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

/** Short text for a steps / sleep / weight / mood / energy entry ('' for others). @param {any} e */
function otherText(e) {
  if (e.type === 'steps') return t(e.total ? 'voice.stepsTotal' : 'voice.stepsAdded', { n: fmtNum(e.value) });
  if (e.type === 'sleep')
    return [
      e.value != null ? t('voice.sleepH', { n: fmtNum(e.value, 1) }) : t('voice.sleep'),
      e.quality ? FACES[e.quality - 1] : '',
    ]
      .filter(Boolean)
      .join(' ');
  if (e.type === 'weight') return t('voice.weight', { n: fmtNum(e.value, 1) });
  if (e.type === 'mood') return `${t('sleep.mood')} ${FACES[e.value - 1] ?? ''}`;
  if (e.type === 'energy') return `${t('sleep.energy')} ${e.value}/5`;
  return '';
}
