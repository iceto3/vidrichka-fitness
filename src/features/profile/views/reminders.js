/**
 * Reminders settings with an honest explanation of what the device can do.
 * @module features/profile/views/reminders
 */
import { html } from '../../../ui/dom.js';
import { t, weekdayName } from '../../../core/i18n.js';
import { settings, setSettings } from '../../../core/settings.js';
import { emit } from '../../../core/bus.js';
import { toggle, topBar } from '../../../ui/components.js';
import { notify } from '../../../ui/feedback.js';
import { requestPermission, scheduleReminders, support } from '../reminders.js';
import { installApp } from '../install.js';

/** @returns {import('../../../core/registry.js').View} */
export default () => {
  const set = (/** @type {any} */ patch) => {
    setSettings({ reminders: { ...settings().reminders, ...patch } });
    scheduleReminders();
  };
  return {
    tab: 'profile',
    render: () => {
      const r = settings().reminders,
        s = support();
      const how = s.iosNeedsInstall
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
<div class="card mt12 row between"><div><div class="b">${t('reminders.enable')}</div><div class="muted xs b">${t('reminders.enableSub')}</div></div>${toggle(r.enabled, 'on', t('reminders.enable'))}</div>
<div class="card mt12 ${r.enabled ? '' : 'dim'}"><label class="field"><span>${t('reminders.time')}</span><input class="input" type="time" data-change="time" value="${r.time}"></label>
<div class="field mt12"><span>${t('reminders.days')}</span><div class="days7">${[0, 1, 2, 3, 4, 5, 6].map((i) => html`<button class="dbtn${r.days.includes(i) ? ' on' : ''}" data-act="day" data-i="${i}" aria-pressed="${r.days.includes(i)}" aria-label="${weekdayName(i, 'long')}">${weekdayName(i, 'narrow')}</button>`)}</div></div></div>
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
      install: () => installApp(),
      test: () => void notify(t('reminder.title'), t('reminder.body'), 'test'),
    },
  };
};
