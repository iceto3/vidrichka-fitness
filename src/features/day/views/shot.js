/**
 * 1.4.0 "📷 From screenshot": read steps (or sleep) from a health-app screenshot (Apple
 * Health, Google Fit, Samsung Health, a watch app). The picture is shrunk on the phone,
 * sent once to the voice server for reading and never stored. Nothing is saved until the
 * user checks the numbers: each day's date and value can be corrected or unticked, and a
 * week view is saved day by day. Saving SETS the day's total (it replaces, never adds).
 * @module features/day/views/shot
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtDuration, fmtNum, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import { readScreenshot } from '../../voice/api.js';
import { prepareImage } from '../../improve/images.js';
import { readDays, setDaySleep, setDaySteps, MAX_SLEEP_H } from '../api.js';
import { shotRows } from '../logic.js';
import { safely } from './cards.js';
import { FACES } from '../../daily/views/checkin.js';

/**
 * @param {'steps'|'sleep'} kind @param {string} date The day the button belongs to (used
 * for a reading without a date).
 */
export function openShot(kind, date) {
  /** @type {{phase: 'pick'|'busy'|'confirm'|'none'|'error', err: string, rows: import('../logic.js').ShotRow[]}} */
  const st = { phase: 'pick', err: '', rows: [] };
  const today = dayKey();
  const current = () =>
    new Map(readDays(st.rows.map((r) => r.date)).map((d) => [d.date, kind === 'steps' ? d.steps : d.sleep.hours]));

  const picker = () =>
    html`<label class="btn w100 mt16 shotpick">${ic('image', 18, 2.2)}${t('shot.pick')}<input type="file" accept="image/*" class="sr-only" data-change="file" aria-label="${t('shot.pick')}"></label>`;

  /** @param {HTMLElement} el @param {'h'|'m'} part */
  const setSleepPart = (el, part) => {
    const r = st.rows[Number(el.dataset.i)],
      n = Number(/** @type {HTMLInputElement} */ (el).value.trim() || 0),
      mins = Math.round(r.value * 60);
    const next = part === 'h' ? n * 60 + (mins % 60) : Math.floor(mins / 60) * 60 + n;
    if (Number.isInteger(n) && n >= 0 && (part === 'h' || n < 60) && next > 0 && next <= MAX_SLEEP_H * 60)
      r.value = next / 60;
    else toast(t('day.err.range'));
  };

  openSheet({
    render: () => {
      const title = html`<h2 class="h2">📷 ${t(kind === 'steps' ? 'shot.titleSteps' : 'shot.titleSleep')}</h2>`;
      if (st.phase === 'busy')
        return html`${title}<div class="center mt16 pad16"><span class="spin" aria-hidden="true"></span><p class="b mt8" role="status">${t('shot.reading')}</p></div>`;
      if (st.phase === 'pick' || st.phase === 'none' || st.phase === 'error')
        return html`${title}<p class="muted small b mt4">${t(kind === 'steps' ? 'shot.hintSteps' : 'shot.hintSleep')}</p>
${st.phase === 'none' ? html`<p class="verr small b mt12" role="alert">${t('shot.none')}</p>` : ''}
${st.phase === 'error' ? html`<p class="verr small b mt12" role="alert">${t(`shot.err.${st.err}`)}</p>` : ''}
${picker()}<p class="muted xs b mt8">${t('shot.privacy')}</p>`;
      const cur = current();
      const fmt = (/** @type {number} */ v) => (kind === 'steps' ? fmtNum(v) : fmtDuration(v));
      return html`${title}<p class="muted small b mt4">${t('shot.confirm')}</p>
<div class="col gap10 mt8 shotrows">${st.rows.map((r, i) => {
        const was = cur.get(r.date);
        // 1.4.0: stacked layout — the date field gets the full width (it was squashed next to
        // the weekday and the value), the weekday and the current value sit under it.
        return html`<div class="card pad14 shotrow"><div class="row gap10"><input type="checkbox" class="chk" data-change="on" data-i="${i}" ${r.on ? raw('checked') : ''} aria-label="${t('shot.use')}">
<label class="f1 minw0 shotdate"><span class="sr-only">${t('shot.date')}</span><input type="date" class="input" data-change="date" data-i="${i}" value="${r.date}" max="${today}" aria-label="${t('shot.date')}"></label></div>
<p class="muted xs b mt6">${fmtDate(parseDay(r.date), { weekday: 'long', day: 'numeric', month: 'long' })}${was != null ? ` · ${t('shot.was', { n: fmt(was) })}` : ''}</p>
${
  kind === 'steps'
    ? html`<label class="row gap8 mt8 shotval"><span class="b f1">${t('steps.count')}</span><input class="input num" type="text" inputmode="numeric" data-change="val" data-i="${i}" value="${fmtNum(r.value)}" aria-label="${t('steps.count')}"></label>`
    : html`<div class="row gap8 mt8 shotval"><span class="b f1">${t('sleep.hours')}</span>
<input class="input num" type="text" inputmode="numeric" data-change="hh" data-i="${i}" value="${Math.floor(Math.round(r.value * 60) / 60)}" aria-label="${t('shot.hoursAria')}"><span class="muted b">${t('unit.h')}</span>
<input class="input num" type="text" inputmode="numeric" data-change="mm" data-i="${i}" value="${String(Math.round(r.value * 60) % 60).padStart(2, '0')}" aria-label="${t('shot.minutesAria')}"><span class="muted b">${t('unit.min')}</span></div>
<p class="xs b mt8">${t('sleep.quality')} <span class="muted">${t('shot.optional')}</span></p>
<div class="scale sm shotq" role="radiogroup" aria-label="${t('sleep.quality')}">${FACES.map((f, k) => html`<button class="${r.q === k + 1 ? 'on' : ''}" role="radio" aria-checked="${String(r.q === k + 1)}" data-act="q" data-i="${i}" data-v="${k + 1}" aria-label="${t(`scale.sleep${k + 1}`)} (${k + 1}/5)"><span aria-hidden="true">${f}</span></button>`)}</div>`
}</div>`;
      })}</div>
<p class="muted xs b mt8">${t(kind === 'steps' ? 'shot.replaceSteps' : 'shot.replaceSleep')}</p>
<div class="row gap10 mt12"><button class="btn sec f1" data-act="again">${t('shot.again')}</button><button class="btn f1" data-act="save" ${st.rows.some((r) => r.on) ? '' : raw('disabled')}>${t('shot.save', { n: st.rows.filter((r) => r.on).length })}</button></div>`;
    },
    actions: {
      file: async (el) => {
        const f = /** @type {HTMLInputElement} */ (el).files?.[0];
        if (!f) return false;
        st.phase = 'busy';
        emit('ui:refresh');
        try {
          const img = await prepareImage(f);
          URL.revokeObjectURL(img.url);
          st.rows = shotRows(await readScreenshot(kind, img.blob, today), kind, date, today);
          st.phase = st.rows.length ? 'confirm' : 'none';
        } catch (e) {
          st.phase = 'error';
          st.err = ['offline', 'rate-limit', 'image', 'limit'].includes(/** @type {Error} */ (e).message)
            ? /** @type {Error} */ (e).message
            : 'server';
        }
        emit('ui:refresh');
        return false;
      },
      on: (el) => void (st.rows[Number(el.dataset.i)].on = /** @type {HTMLInputElement} */ (el).checked),
      date: (el) => {
        const v = /** @type {HTMLInputElement} */ (el).value,
          r = st.rows[Number(el.dataset.i)];
        if (v && v <= today && !st.rows.some((x) => x !== r && x.date === v)) r.date = v;
        else toast(t(v > today ? 'day.err.future' : 'shot.dupDate'));
      },
      val: (el) => {
        const v = Number(/** @type {HTMLInputElement} */ (el).value.replace(/[\s\u00a0\u202f.,]/g, '')),
          r = st.rows[Number(el.dataset.i)];
        if (Number.isFinite(v) && v > 0 && v <= 100_000) r.value = Math.round(v);
        else toast(t('day.err.range'));
      },
      // sleep: hours and minutes are typed separately; the value is kept to the minute
      hh: (el) => setSleepPart(el, 'h'),
      mm: (el) => setSleepPart(el, 'm'),
      q: (el) => {
        const r = st.rows[Number(el.dataset.i)],
          v = Number(el.dataset.v);
        r.q = r.q === v ? null : v; // tap again to clear (quality is optional)
      },
      again: () => void Object.assign(st, { phase: 'pick', rows: [] }),
      save: () => {
        let n = 0;
        for (const r of st.rows.filter((x) => x.on))
          safely(() => {
            if (kind === 'steps') setDaySteps(r.date, r.value);
            else setDaySleep(r.date, { hours: r.value, ...(r.q ? { q: r.q } : {}) });
            n++;
          });
        closeSheet();
        if (n) toast(t('shot.saved', { n }));
        return false;
      },
    },
  });
}
