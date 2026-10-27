/**
 * 1.4.0 "📷 From screenshot": read steps (or sleep) from a health-app screenshot (Apple
 * Health, Google Fit, Samsung Health, a watch app). The picture is shrunk on the phone,
 * sent once to the voice server for reading and never stored. Nothing is saved until the
 * user checks the numbers: each day's date and value can be corrected or unticked, and a
 * week view is saved day by day. Saving SETS the day's total (it replaces, never adds).
 * @module features/day/views/shot
 */
import { html, raw } from '../../../ui/dom.js';
import { fmtDate, fmtNum, t } from '../../../core/i18n.js';
import { dayKey, parseDay } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { closeSheet, openSheet, toast } from '../../../ui/sheet.js';
import { readScreenshot } from '../../voice/api.js';
import { prepareImage } from '../../improve/images.js';
import { readDays, setDaySleep, setDaySteps, MAX_SLEEP_H } from '../api.js';
import { shotRows } from '../logic.js';
import { safely } from './cards.js';

/**
 * @param {'steps'|'sleep'} kind @param {string} date The day the button belongs to (used
 * for a reading without a date).
 */
export function openShot(kind, date) {
  /** @type {{phase: 'pick'|'busy'|'confirm'|'none'|'error', err: string, rows: import('../logic.js').ShotRow[]}} */
  const st = { phase: 'pick', err: '', rows: [] };
  const today = dayKey();
  const unit = kind === 'steps' ? '' : t('unit.h');
  const current = () =>
    new Map(readDays(st.rows.map((r) => r.date)).map((d) => [d.date, kind === 'steps' ? d.steps : d.sleep.hours]));

  const picker = () =>
    html`<label class="btn w100 mt16 shotpick">${ic('image', 18, 2.2)}${t('shot.pick')}<input type="file" accept="image/*" class="sr-only" data-change="file" aria-label="${t('shot.pick')}"></label>`;

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
      return html`${title}<p class="muted small b mt4">${t('shot.confirm')}</p>
<div class="list mt8 shotrows">${st.rows.map((r, i) => {
        const was = cur.get(r.date);
        return html`<div class="lrow shotrow"><input type="checkbox" class="chk" data-change="on" data-i="${i}" ${r.on ? raw('checked') : ''} aria-label="${t('shot.use')}">
<span class="f1 minw0"><input type="date" class="input sm" data-change="date" data-i="${i}" value="${r.date}" max="${today}" aria-label="${t('shot.date')}">
<span class="muted xs b block">${fmtDate(parseDay(r.date), { weekday: 'long' })}${was != null ? ` · ${t('shot.was', { n: `${fmtNum(was, kind === 'steps' ? 0 : 1)}${unit ? ` ${unit}` : ''}` })}` : ''}</span></span>
<input class="input sm num shotval" type="text" inputmode="decimal" data-change="val" data-i="${i}" value="${kind === 'steps' ? String(r.value) : fmtNum(r.value, 1)}" aria-label="${t(kind === 'steps' ? 'steps.count' : 'sleep.hours')}">${unit ? html`<span class="muted b">${unit}</span>` : ''}</div>`;
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
          st.err = ['offline', 'rate-limit', 'image'].includes(/** @type {Error} */ (e).message)
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
        const v = Number(/** @type {HTMLInputElement} */ (el).value.replace(/\s/g, '').replace(',', '.')),
          r = st.rows[Number(el.dataset.i)];
        const max = kind === 'steps' ? 100_000 : MAX_SLEEP_H;
        if (Number.isFinite(v) && v > 0 && v <= max) r.value = kind === 'steps' ? Math.round(v) : v;
        else toast(t('day.err.range'));
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
