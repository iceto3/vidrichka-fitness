/**
 * Reminders settings with an honest explanation of what the device can do.
 * 1.2: "Reminders on this phone" turns server-sent Web Push on/off (features/daily/push.js).
 * @module features/profile/views/reminders
 */
import { html } from '../../../ui/dom.js';
import { t, weekdayName } from '../../../core/i18n.js';
import { dailySettings, settings, setSettings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { timeInput, toggle, topBar } from '../../../ui/components.js';
import { notify } from '../../../ui/feedback.js';
import { requestPermission, scheduleReminders, support } from '../reminders.js';
import { installApp, isIOS } from '../install.js';
import { disablePush, enablePush, pushOn, pushSupport } from '../../daily/push.js';

let busy = false;

/** Push card: status, on/off button and the platform hints. */
function pushCard() {
  const p = pushSupport(),
    on = pushOn(),
    ios = isIOS();
  const hint = !p.configured
    ? 'push.notConfigured'
    : p.iosNeedsInstall
      ? 'push.iosInstall'
      : !p.api
        ? ios
          ? 'push.iosOld'
          : 'push.unsupported'
        : p.permission === 'denied'
          ? 'push.denied'
          : '';
  const can = !hint;
  return html`<div class="card mt12 pushcard"><div class="row between gap8"><div class="f1 minw0"><div class="b">${t('push.title')}</div><div class="muted xs b">${t(on ? 'push.onSub' : 'push.offSub')}</div></div><span class="pushstate${on ? ' on' : ''}">${t(on ? 'common.on' : 'common.off')}</span></div>
${hint ? html`<p class="small b muted mt10 lh">${t(hint)}</p>` : ''}
${p.iosNeedsInstall ? html`<button class="btn sec w100 mt10" data-act="install">${t('install.cta')}</button>` : ''}
${can || on ? html`<button class="btn ${on ? 'sec' : ''} w100 mt10" data-act="push" ${busy ? 'disabled' : ''}>${t(busy ? 'push.working' : on ? 'push.turnOff' : 'push.turnOn')}</button>` : ''}
${ios ? html`<p class="muted xs b mt10 lh">${t('push.iosSound')}</p>` : ''}</div>`;
}

/**
 * Daily-rhythm row: label, time input and on/off switch. `k` addresses the setting:
 * `wake`, `loud`, `water.0`…`water.3`, `checkinAm`, `checkinPm`, `bedtime`.
 * @param {string} k @param {string} label @param {string} time @param {boolean} on @param {string} [sub]
 */
const drow = (k, label, time, on, sub = '') =>
  html`<div class="row between gap8 drow mt10"><div class="f1 minw0"><div class="b small">${label}</div>${sub ? html`<div class="muted xs b">${sub}</div>` : ''}</div>
${timeInput({ value: time, act: 'dtime', k, label, disabled: !on, cls: 'tinput' })}${k === 'loud' ? html`<span class="tgph"></span>` : toggle(on, 'dtog', label, { k })}</div>`;

/** @returns {import('../../../core/registry.js').View} */
export default () => {
  const set = (/** @type {any} */ patch) => {
    setSettings({ reminders: { ...settings().reminders, ...patch } });
    scheduleReminders();
  };
  /** Update one daily-rhythm setting (see drow keys). @param {string} k @param {(cur: any) => any} fn */
  const setDaily = (k, fn) => {
    const d = structuredClone(dailySettings()),
      [a, i] = k.split('.');
    if (i != null) d[a][Number(i)] = fn(d[a][Number(i)]);
    else d[a] = fn(d[a]);
    setSettings({ daily: d });
    scheduleReminders();
  };
  return {
    tab: 'profile',
    render: () => {
      const r = settings().reminders,
        d = dailySettings(),
        s = support();
      const how = pushOn()
        ? 'reminders.push'
        : s.iosNeedsInstall
          ? 'reminders.iosInstall'
          : !s.notif
            ? 'reminders.unsupported'
            : s.permission === 'denied'
              ? 'reminders.denied'
              : s.triggers
                ? 'reminders.triggers'
                : s.periodic
                  ? 'reminders.periodic'
                  : 'reminders.inApp';
      return html`<div class="content">${topBar(t('profile.reminders'))}
${pushSupport().configured ? pushCard() : ''}
<div class="card mt12 row between"><div><div class="b">${t('reminders.enable')}</div><div class="muted xs b">${t('reminders.enableSub')}</div></div>${toggle(r.enabled, 'on', t('reminders.enable'))}</div>
<div class="card mt12 ${r.enabled ? '' : 'dim'}"><div class="field"><span>${t('reminders.time')}</span>${timeInput({ value: r.time, act: 'time', label: t('reminders.time'), cls: 'wide' })}</div>
<div class="field mt12"><span>${t('reminders.days')}</span><div class="days7">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<button class="dbtn${r.days.includes(i) ? ' on' : ''}" data-act="day" data-i="${i}" aria-pressed="${String(r.days.includes(i))}" aria-label="${weekdayName(i, 'long')}">${weekdayName(i, 'narrow')}</button>`)}</div></div></div>
<div class="section-title"><h2 class="h3">${t('daily.settingsTitle')}</h2></div>
<div class="card dailyset">
${drow('wake', t('daily.wake'), d.wake, d.morning, t('daily.wakeSub'))}
${d.morning ? drow('loud', t('daily.loud'), d.loud, true, t('daily.loudSub')) : ''}
<div class="row between gap8 drow mt10"><div class="f1"><div class="b small">${t('daily.protein')}</div><div class="muted xs b">${t('daily.proteinSub')}</div></div>${toggle(d.protein, 'dtog', t('daily.protein'), { k: 'protein' })}</div>
${d.water.map((w, i) => drow(`water.${i}`, t('daily.water', { n: i + 1 }), w.time, w.on))}
${drow('checkinAm', t('daily.checkinAm'), d.checkinAm.time, d.checkinAm.on, t('daily.checkinAmSub'))}
${drow('checkinPm', t('daily.checkinPm'), d.checkinPm.time, d.checkinPm.on, t('daily.checkinPmSub'))}
${drow('bedtime', t('daily.bedtime'), d.bedtime.time, d.bedtime.on, t('daily.bedtimeSub'))}
${s.notif && s.permission === 'default' ? html`<button class="btn w100 mt14" data-act="allow">${t('daily.allow')}</button>` : ''}
<p class="muted xs b mt12 lh">${t(isIOS() ? 'daily.noteIos' : 'daily.noteAndroid')}</p></div>
<div class="card mt12 note"><div class="b">${t('reminders.howTitle')}</div><p class="small b muted mt6 lh">${t(how)}</p>
${s.iosNeedsInstall ? html`<button class="btn sec w100 mt10" data-act="install">${t('install.cta')}</button>` : ''}
${s.notif && s.permission === 'granted' ? html`<button class="btn sec w100 mt10" data-act="test">${t('reminders.test')}</button>` : ''}</div>
</div>`;
    },
    actions: {
      on: async () => {
        const r = settings().reminders;
        if (!r.enabled) {
          const p = await requestPermission();
          if (p === 'denied') emit('toast', { key: 'reminders.deniedToast' });
        }
        set({ enabled: !r.enabled });
      },
      time: (el) => set({ time: /** @type {HTMLInputElement} */ (el).value || '18:30' }),
      day: (el) => {
        const i = Number(el.dataset.i),
          d = settings().reminders.days;
        set({ days: d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort() });
      },
      dtime: (el) => {
        const v = /** @type {HTMLInputElement} */ (el).value,
          k = el.dataset.k ?? '';
        if (!v) return;
        if (k === 'wake' || k === 'loud') setDaily(k, () => v);
        else setDaily(k, (c) => ({ ...c, time: v }));
      },
      dtog: async (el) => {
        const k = el.dataset.k ?? '';
        if ('Notification' in window && Notification.permission === 'default') await requestPermission();
        if (k === 'wake') setDaily('morning', (c) => !c);
        else if (k === 'protein') setDaily('protein', (c) => !c);
        else setDaily(k, (c) => ({ ...c, on: !c.on }));
      },
      allow: async () => {
        if ((await requestPermission()) === 'denied') emit('toast', { key: 'reminders.deniedToast' });
        scheduleReminders();
      },
      install: () => installApp(),
      push: async () => {
        if (busy) return false;
        busy = true;
        emit('ui:refresh');
        try {
          if (pushOn()) {
            await disablePush();
            emit('toast', { key: 'push.offToast' });
          } else {
            const r = await enablePush();
            if (r === 'on') emit('toast', { key: 'push.onToast' });
            else if (r === 'denied') emit('toast', { key: 'reminders.deniedToast' });
          }
        } catch (e) {
          console.warn('[push]', e);
          emit('toast', { key: 'push.failed' });
        } finally {
          busy = false;
        }
        scheduleReminders();
      },
      test: () => void notify(t('reminder.title'), t('reminder.body'), 'test'),
    },
  };
};
