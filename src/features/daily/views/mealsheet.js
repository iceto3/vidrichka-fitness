/**
 * 1.4.3 The pending meal's actions, shared by the Home banner and the meal pill, so both do
 * exactly the same: „Изядох“ opens the breakfast logger (saving a breakfast there records
 * it, as since 1.2.1); after the 30-min window it first asks when she ate (time picker,
 * default now, never in the future). „Пропуснах“ records the skip.
 * Also the small bottom sheet the pill opens.
 * @module features/daily/views/mealsheet
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { emit } from '../../../core/bus.js';
import { hhmm } from '../../../core/dates.js';
import { dailySettings } from '../../../core/settings.js';
import { ic } from '../../../ui/icons.js';
import { timeInput } from '../../../ui/components.js';
import { closeSheet, openSheet } from '../../../ui/sheet.js';
import { closeNotifications } from '../notify.js';
import { BREAKFAST_LOGGER, day, proteinSkip, setAteAt } from '../api.js';
import { checkAteAt, pendingMeal } from '../mealtime.js';

/** The pending meal now (the Home banner's countdown), or null. */
export const mealNow = () => pendingMeal(day(), Date.now(), !!dailySettings().protein);

/** Open the logger for the meal (what the banner's „Изядох“ has done since 1.2.1). */
const toLogger = () => {
  closeNotifications(['protein']);
  emit('nav', { path: BREAKFAST_LOGGER });
};

/** „Изядох“ (banner and pill): within the window → the logger; after it → ask the time first. */
export function mealAte() {
  if (mealNow()?.mode === 'overdue') return void openMealSheet('time');
  toLogger();
}

/** „Пропуснах“ (banner and pill): no breakfast today, reminders stop, no celebration or quest. */
export function mealSkip() {
  proteinSkip();
  closeNotifications(['protein']);
}

/** Countdown text split around the time, like the banner: [before, after]. @param {'running'|'overdue'} mode */
export const countdownParts = (mode) =>
  t(mode === 'running' ? 'mealPill.left' : 'mealPill.over', { time: '\u0000' }).split('\u0000');

/**
 * The meal sheet: step 'ask' („Изядох“ / „Пропуснах“, opened by the pill) or 'time'
 * (when she ate, for a meal after its window). Closes itself when the meal is no longer pending.
 * @param {'ask'|'time'} [step]
 */
export function openMealSheet(step = 'ask') {
  const st = { step, hm: hhmm(Date.now()), /** @type {string} */ err: '' };
  /** @type {number|undefined} */
  let timer;
  const validate = () => {
    const r = checkAteAt(day(), st.hm, Date.now());
    st.err = 'err' in r ? `mealTime.err.${r.err}` : '';
    return r;
  };
  openSheet({
    render: () => {
      const m = mealNow();
      const name = t(`meal.${m?.meal ?? 'breakfast'}`);
      if (st.step === 'time')
        return html`<div class="mealsheet mtime"><h2 class="h2">${t('mealTime.title', { meal: name })}</h2>
<p class="small muted b mt6 lh">${t('mealTime.body')}</p>
<div class="field mt12"><span>${t('mealTime.label')}</span>${timeInput({ value: st.hm, act: 'atehm', label: t('mealTime.label'), cls: 'wide' })}</div>
${st.err ? html`<p class="small b danger-t mt6 ateerr" role="alert">${t(st.err)}</p>` : html`<p class="xs b muted mt6">${t('mealTime.hint')}</p>`}
<div class="row gap8 mt16"><button class="btn sec f1" data-act="cancel">${t('common.cancel')}</button><button class="btn f1 ateok" data-act="ateok" ${st.err ? 'disabled' : ''}>${ic('check', 18, 3)}${t('mealTime.save')}</button></div></div>`;
      const [pre, post] = countdownParts(m?.mode ?? 'running');
      return html`<div class="mealsheet pbar ${m?.mode ?? ''}"><div class="row gap12"><span class="sq">${ic('clock', 22, 2.3)}</span><span class="f1 minw0"><h2 class="h3 xb">${name}</h2><span class="xs b ptext">${pre}<span class="ptime num" role="timer">${m?.time ?? ''}</span>${post}</span></span></div>
<div class="row gap8 mt14"><button class="btn sm f1 pyes" data-act="ate">${ic('check', 18, 3)}${t('home.proteinAte')}</button><button class="btn sm sec f1 pskip" data-act="skip">${t('home.proteinSkip')}</button></div></div>`;
    },
    actions: {
      ate: () => {
        if (mealNow()?.mode === 'overdue') {
          st.step = 'time';
          st.hm = hhmm(Date.now());
          validate();
          return;
        }
        toLogger();
        return false;
      },
      // not data-close: the step change morphs „Изядох“ into this button during the same tap
      cancel: () => (closeSheet(), false),
      skip: () => {
        mealSkip();
        closeSheet();
        return false;
      },
      atehm: (el) => {
        st.hm = /** @type {HTMLInputElement} */ (el).value || st.hm;
        validate();
      },
      ateok: () => {
        const r = validate();
        if (!r.ok) return;
        setAteAt(r.at);
        toLogger();
        return false;
      },
    },
    mount: (el) => {
      if (st.step === 'time') validate();
      timer = window.setInterval(() => {
        const m = mealNow();
        if (!m) return void closeSheet();
        const n = el.querySelector('.mealsheet .ptime');
        if (n && n.textContent !== m.time) n.textContent = m.time;
        if (st.step === 'ask' && !el.querySelector(`.mealsheet.${m.mode}`)) emit('ui:refresh');
      }, 1000);
    },
    unmount: () => clearInterval(timer),
  });
}
