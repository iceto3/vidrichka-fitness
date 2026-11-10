/**
 * 1.4.4 „Кога яде?“: right after the protein breakfast was logged after its 30-min window
 * (and no time was typed from the pill or banner), a small sheet asks once: „Сега (HH:MM)“
 * keeps the logged time, „По-рано“ opens a 24-hour time picker (not later than now, not
 * before the countdown started) with a live preview of what that time gives – „Навреме ✓ ·
 * +15 XP“, „+N мин · +8 XP“ or „+N мин · пропуснато“. Closing the sheet = „Сега“.
 * @module features/daily/views/whenate
 */
import { html } from '../../../ui/dom.js';
import { t } from '../../../core/i18n.js';
import { dayKey, hhmm, hmComplete, parseHM, stepHM } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { time24 } from '../../../ui/components.js';
import { closeSheet, openSheet, refreshSheet } from '../../../ui/sheet.js';
import { day, foodTimeFloor, setMealActual } from '../api.js';
import { TIMED_MEAL, askWhenAte, checkAteAt, previewAt } from '../mealtime.js';
import { lateText } from './mealsheet.js';

/** „+1 ч 05 мин“ / „+41 мин“ for a delay in minutes. @param {number} min */
const late = (min) => lateText({ h: Math.floor(min / 60), m: min % 60 });

/** The preview line for a grade. @param {{state: string, delayMin: number, xp: number}} q */
export const previewText = (q) =>
  q.state === 'done'
    ? t('whenAte.onTime', { xp: q.xp })
    : q.state === 'late'
      ? t('whenAte.late', { late: late(q.delayMin), xp: q.xp })
      : t('whenAte.missed', { late: late(q.delayMin) });

/** Open the sheet if today's meal still needs the question. @param {number} [now] */
export function maybeAskWhenAte(now = Date.now()) {
  if (askWhenAte(day(), now)) openWhenAte();
}

/** The „Кога яде?“ sheet. */
export function openWhenAte() {
  /** @type {{step: 'ask'|'pick', hm: string, err: string, typed?: string, done: boolean}} */
  const st = { step: 'ask', hm: hhmm(Date.now()), err: '', done: false };
  const check = () => {
    const r = checkAteAt(day(), st.hm, Date.now());
    st.err = 'err' in r ? `mealTime.err.${r.err}` : '';
    return r;
  };
  const answer = (/** @type {number|null} */ at) => {
    st.done = true;
    // the result toast (by the final grade) comes from daily/api proteinGraded – 1.4.4 fixes
    setMealActual(at);
    closeSheet();
  };
  openSheet({
    render: () => {
      const meal = t(`meal.${TIMED_MEAL}`);
      if (st.step === 'ask')
        return html`<div class="whenate"><h2 class="h2">${t('mealTime.title', { meal })}</h2>
<p class="small muted b mt6 lh">${t('whenAte.body', { meal: meal.toLowerCase() })}</p>
<div class="col gap8 mt16"><button class="btn w100 wnow" data-act="now">${ic('check', 18, 3)}${t('whenAte.now', { time: hhmm(Date.now()) })}</button>
<button class="btn sec w100 wearlier" data-act="earlier">${ic('clock', 18, 2.3)}${t('whenAte.earlier')}</button></div></div>`;
      const r = check();
      const q = r.ok ? previewAt(day(), r.at) : null;
      return html`<div class="whenate pick"><h2 class="h2">${t('mealTime.title', { meal })}</h2>
<div class="field mt12"><span>${t('mealTime.label')}</span>${time24({ value: st.typed ?? st.hm, act: 'hm', step: 'hmstep', mins: 5, label: t('mealTime.label'), bad: !!st.err })}</div>
${
  st.err
    ? html`<p class="small b danger-t mt8 ateerr" role="alert">${t(st.err)}</p>`
    : q
      ? html`<p class="wprev mt8 b ${q.state}" role="status" aria-live="polite">${previewText(q)}</p>`
      : ''
}
<p class="xs b muted mt6">${t('whenAte.hint')}</p>
<div class="row gap8 mt16"><button class="btn sec f1" data-act="back">${t('common.back')}</button><button class="btn f1 wok" data-act="ok"${st.err || st.typed != null ? ' disabled' : ''}>${ic('check', 18, 3)}${t('whenAte.done')}</button></div></div>`;
    },
    actions: {
      now: () => (answer(null), false),
      earlier: () => {
        st.step = 'pick';
        st.hm = hhmm(Date.now());
      },
      back: () => void (st.step = 'ask'),
      hm: (el, ev) => {
        const txt = /** @type {HTMLInputElement} */ (el).value,
          v = parseHM(txt);
        if (ev?.type === 'input') {
          if (!hmComplete(txt) || !v) return false;
          ((st.hm = v), (st.typed = undefined));
          refreshSheet();
          return false;
        }
        if (v) {
          st.hm = v;
          st.typed = undefined;
          /** @type {HTMLInputElement} */ (el).value = v;
        } else ((st.typed = txt), (st.err = 'time24.bad'));
        refreshSheet();
        return false;
      },
      hmstep: (el) => {
        st.hm = stepHM(st.hm, Number(el.dataset.d));
        // 1.4.4 (time): − stops at the wake-up (a meal can't be before it)
        const floor = foodTimeFloor(dayKey()),
          c = checkAteAt(day(), st.hm, Date.now());
        if (floor && 'err' in c && c.err === 'early') st.hm = floor;
        st.typed = undefined;
        refreshSheet();
        return false;
      },
      ok: () => {
        if (st.typed != null) return false;
        const r = check();
        if (!r.ok) return;
        answer(r.at);
        return false;
      },
    },
    // closed with ✕ / the backdrop / Back = „Сега“: it is not asked again today
    onClose: () => void (st.done || setMealActual(null)),
  });
}
