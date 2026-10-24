/**
 * App entry: loads data, applies language/theme, registers features, starts the router,
 * the reward engine, reminders and the service worker (with an update prompt).
 * @module main
 */
import { load } from './core/store.js';
import { settings, setSettings } from './core/settings.js';
import { detectLang, getLang, setLang, t } from './core/i18n.js';
import { applyTheme, watchTheme } from './core/theme.js';
import { on, emit } from './core/bus.js';
import { back, navigate, refresh, startRouter } from './core/router.js';
import { bindActions, html } from './ui/dom.js';
import { closeAll, closeSheet, initSheets, openSheet, whenSettled } from './ui/sheet.js';
import { unlockAudio } from './ui/feedback.js';
import { ic } from './ui/icons.js';
import { seg, stepper } from './ui/components.js';
import { startMotivation } from './features/index.js';
import { seedPlans } from './features/workouts/api.js';
import { otter } from './features/mascot/api.js';
import { stats } from './features/motivation/api.js';
import './features/profile/install.js'; // catch beforeinstallprompt early

const $id = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Apply language + theme from settings (detecting the language on first run). */
async function applySettings() {
  const s = settings();
  if (!s.lang) setSettings({ lang: detectLang(navigator.languages ?? [navigator.language]) });
  if (settings().lang !== getLang()) await setLang(settings().lang);
  applyTheme(s.theme);
}

/** First-run welcome: names, language and weekly goal. */
function onboarding() {
  const s = { name: '', goal: settings().weeklyGoal };
  openSheet({
    kind: 'dialog',
    render: () => html`<div class="center onboard">${otter({ size: 130, pose: 'wave' })}<h1 class="h2 mt8">${t('onboard.title')}</h1><p class="muted b mt6 lh">${t('onboard.body')}</p></div>
<div class="row between mt12"><span class="b">${t('profile.language')}</span>${seg([{ value: 'en', label: 'English' }, { value: 'bg', label: 'Български' }], getLang(), 'lang', 'mini')}</div>
<label class="field mt12"><span>${t('profile.yourName')}</span><input class="input" id="obname" data-input="name" value="${s.name}" autocomplete="given-name" placeholder="${t('onboard.namePh')}"></label>
<div class="row between mt12"><span class="b">${t('profile.weeklyGoal')}</span>${stepper({ act: 'goal', value: s.goal, label: t('profile.weeklyGoal') })}</div>
<p class="muted xs b mt6">${t('onboard.goalHint')}</p>
<button class="btn w100 mt16" data-act="go">${t('onboard.go')}${ic('right', 18, 2.6)}</button>
<p class="muted xs b center mt10">${t('onboard.private')}</p>`,
    actions: {
      lang: async (el) => void setSettings({ lang: el.dataset.v }),
      name: (el) => ((s.name = /** @type {HTMLInputElement} */ (el).value), false),
      goal: (el, ev) => void (s.goal = Math.min(7, Math.max(1, ev.type === 'change' ? Number(/** @type {HTMLInputElement} */ (el).value) || s.goal : s.goal + Number(el.dataset.d)))),
      go: () => {
        setSettings({ userName: s.name.trim(), weeklyGoal: s.goal, onboarded: true });
        closeSheet();
      },
    },
    onClose: () => !settings().onboarded && setSettings({ onboarded: true }),
  });
}

/** Register the service worker and offer updates. */
function startServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Reload only when an *existing* controller is replaced (user accepted an update),
  // not when the very first worker claims the page.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => hadController && !reloading && ((reloading = true), location.reload()));
  navigator.serviceWorker.register('./sw.js').then((reg) => {
    if (!reg) return;
    const offer = (/** @type {ServiceWorker} */ w) => {
      const bar = document.createElement('div');
      bar.className = 'update-bar';
      bar.setAttribute('role', 'status');
      bar.innerHTML = String(html`<span>${t('update.ready')}</span><button class="btn sm">${t('update.reload')}</button>`);
      bar.querySelector('button')?.addEventListener('click', () => w.postMessage({ type: 'SKIP_WAITING' }));
      document.body.append(bar);
    };
    if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const w = reg.installing;
      w?.addEventListener('statechange', () => w.state === 'installed' && navigator.serviceWorker.controller && offer(w));
    });
    setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
  }).catch((e) => console.warn('[sw] registration failed', e));
}

/** Reminders: schedule what the platform supports, and check while the app is open. */
async function startReminders() {
  const r = await import('./features/profile/reminders.js');
  const check = () => r.checkDue(stats().workedOutToday);
  r.scheduleReminders().catch(() => {});
  check();
  setInterval(check, 30_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
}

async function start() {
  const { persistent } = await load();
  await applySettings();
  watchTheme();
  seedPlans();
  initSheets($id('layer'));
  bindActions($id('nav'), () => null);
  on('nav', (/** @type {{path?: string, replace?: boolean, back?: string}} */ p) => {
    closeAll();
    whenSettled(() => (p.path != null ? navigate(p.path, { replace: p.replace }) : back(p.back)));
  });
  on('settings:changed', async (/** @type {Record<string, any>} */ patch) => {
    if ('lang' in patch) await setLang(settings().lang);
    if ('theme' in patch) applyTheme(settings().theme);
    if ('lang' in patch || 'theme' in patch) emit('ui:refresh');
  });
  on('store:replaced', async () => {
    await applySettings();
    seedPlans();
    refresh(true);
  });
  addEventListener('pointerdown', unlockAudio, { once: true });
  startMotivation();
  await startRouter($id('page'), $id('nav'));
  document.documentElement.classList.add('ready');
  if (!persistent) emit('toast', { key: 'common.noStorage' });
  if (new URLSearchParams(location.search).has('cheer')) (await import('./features/partner/api.js')).handleCheer();
  else if (!settings().onboarded) onboarding();
  startServiceWorker();
  startReminders();
}

start();
