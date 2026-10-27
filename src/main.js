/**
 * App entry: loads data, applies language/theme, registers features, starts the router,
 * the reward engine, reminders and the service worker (with an update prompt).
 * @module main
 */
import { kv, load, setKv } from './core/store.js';
import { WHATS_NEW } from './core/version.js';
import { IS_BETA } from './core/channel.js';
import { settings, setSettings } from './core/settings.js';
import { detectLang, getGender, getLang, setGender, setLang, t } from './core/i18n.js';
import { applyTheme, watchTheme } from './core/theme.js';
import { on, emit } from './core/bus.js';
import { back, navigate, refresh, startRouter } from './core/router.js';
import { bindActions, html } from './ui/dom.js';
import { closeAll, closeSheet, initSheets, openSheet, whenSettled } from './ui/sheet.js';
import { unlockAudio } from './ui/feedback.js';
import { ic } from './ui/icons.js';
import { seg, stepper } from './ui/components.js';
import { startCelebrations, startDaily, startMotivation, startTrash } from './features/index.js';
import { seedPlans } from './features/workouts/api.js';
import { otter } from './features/mascot/api.js';
import { stats } from './features/motivation/api.js';
import { pushUrl } from './features/daily/push-config.js';
import { voiceUrl } from './features/voice/config.js';
import { dataNotice } from './features/improve/notice.js';
import './features/profile/install.js'; // catch beforeinstallprompt early

const $id = (/** @type {string} */ id) => /** @type {HTMLElement} */ (document.getElementById(id));

/** Apply language + theme from settings (detecting the language on first run). */
async function applySettings() {
  const s = settings();
  if (!s.lang) setSettings({ lang: detectLang(navigator.languages ?? [navigator.language]) });
  if (settings().lang !== getLang()) await setLang(settings().lang);
  setGender(settings().gender);
  applyTheme(s.theme);
}

/** First-run welcome: names, language and weekly goal. */
function onboarding() {
  const s = { name: '', goal: settings().weeklyGoal };
  openSheet({
    kind: 'dialog',
    render:
      () => html`<div class="center onboard">${otter({ size: 130, pose: 'wave' })}<h1 class="h2 mt8">${t('onboard.title')}</h1><p class="muted b mt6 lh">${t('onboard.body')}</p></div>
<div class="row between mt12"><span class="b">${t('profile.language')}</span>${seg(
        [
          { value: 'en', label: 'English' },
          { value: 'bg', label: 'Български' },
        ],
        getLang(),
        'lang',
        'mini',
      )}</div>
${genderRow()}
<label class="field mt12"><span>${t('profile.yourName')}</span><input class="input" id="obname" data-input="name" value="${s.name}" autocomplete="given-name" placeholder="${t('onboard.namePh')}"></label>
<div class="row between mt12"><span class="b">${t('profile.weeklyGoal')}</span>${stepper({ act: 'goal', value: s.goal, label: t('profile.weeklyGoal') })}</div>
<p class="muted xs b mt6">${t('onboard.goalHint')}</p>
<button class="btn w100 mt16" data-act="go">${t('onboard.go')}${ic('right', 18, 2.6)}</button>
<p class="muted xs b center mt10">${t('onboard.private')}</p>`,
    actions: {
      lang: async (el) => void setSettings({ lang: el.dataset.v }),
      gender: (el) => void setSettings({ gender: el.dataset.v }),
      name: (el) => ((s.name = /** @type {HTMLInputElement} */ (el).value), false),
      goal: (el, ev) =>
        void (s.goal = Math.min(
          7,
          Math.max(
            1,
            ev.type === 'change'
              ? Number(/** @type {HTMLInputElement} */ (el).value) || s.goal
              : s.goal + Number(el.dataset.d),
          ),
        )),
      go: () => {
        setSettings({ userName: s.name.trim(), weeklyGoal: s.goal, onboarded: true });
        closeSheet();
      },
    },
    onClose: () => {
      if (!settings().onboarded) setSettings({ onboarded: true });
      setTimeout(dataNotice, 250); // 1.3.4: anonymous food sharing is on by default – say so once
    },
  });
}

/** "You are: female / male" (onboarding and the 1.2 note; Profile has its own row). */
const genderRow = () =>
  html`<div class="row between mt12 genderrow"><span class="b">${t('onboard.gender')}</span>${seg(
    [
      { value: 'f', label: t('profile.genderF') },
      { value: 'm', label: t('profile.genderM') },
    ],
    getGender(),
    'gender',
    'mini',
  )}</div>`;

/** "What's new in 1.2" — shown once to people who used an earlier version. */
function whatsNew(next = () => {}) {
  const seen = /** @type {string} */ (kv('seenWhatsNew', ''));
  if (seen === WHATS_NEW) return next();
  // Coming from 1.3.3: only the 1.3.4 items; from 1.3.2 also the 1.3.3 ones; from 1.3.1 also the 1.3.2 ones; from 1.3.0 also the 1.3.1 ones; from 1.2.1 also
  // the 1.3 ones; from 1.2.0 ("1.2") also the 1.2.1 ones; from older, the 1.2 items and the
  // gender choice too. Voice items only once the voice server is set. (The 1.3.1 Undo item is
  // replaced by the 1.3.2 pill.) Shown in the app language, which is loaded before this runs.
  const had133 = /^1\.3\.[3-9]/.test(seen);
  const had132 = /^1\.3\.[2-9]/.test(seen);
  const had131 = /^1\.3\.[1-9]/.test(seen);
  const had13 = seen.startsWith('1.3');
  const had12 = had13 || seen === '1.2' || seen.startsWith('1.2.');
  const had121 = had13 || /^1\.2\.[1-9]/.test(seen);
  const push = !had12 && !!pushUrl(); // push items only once the server is deployed
  const voice = !!voiceUrl();
  const items = /** @type {[string, string][]} */ ([
    ['food', 'whatsNew.homeMeals'],
    ...(voice ? /** @type {[string, string][]} */ ([['mic', 'whatsNew.voiceTour']]) : []),
    ['steps', 'whatsNew.steps'],
    ['moon', 'whatsNew.sleep134'],
    ['chart', 'whatsNew.trends'],
    ['message', 'whatsNew.feedback'],
    ...(had133
      ? []
      : /** @type {[string, string][]} */ ([
          ...(voice ? [['mic', 'whatsNew.record']] : []),
          ['check', 'whatsNew.fixes133'],
        ])),
    ...(had132
      ? []
      : /** @type {[string, string][]} */ ([
          ['undo', 'whatsNew.undoPill'],
          ['star', 'whatsNew.comboRename'],
          ['check', 'whatsNew.fixes132'],
        ])),
    ...(had131
      ? []
      : /** @type {[string, string][]} */ ([
          ...(voice ? [['mic', 'whatsNew.voiceMeal']] : []),
          ['food', 'whatsNew.fiberSalt'],
          ['edit', 'whatsNew.mealEdit'],
          ['star', 'whatsNew.combos'],
        ])),
    ...(voice && !had13 ? /** @type {[string, string][]} */ ([['mic', 'whatsNew.voice']]) : []),
    ...(had121
      ? []
      : /** @type {[string, string][]} */ ([
          ['camera', 'whatsNew.photos'],
          ['calendar', 'whatsNew.photoMonth'],
          ['check', 'whatsNew.fixes121'],
        ])),
    ...(had12
      ? []
      : /** @type {[string, string][]} */ ([
          ...(push
            ? [
                ['bell', 'whatsNew.push'],
                ['sun', 'whatsNew.pushIos'],
                ['check', 'whatsNew.pushStop'],
              ]
            : []),
          ['clock', 'whatsNew.proteinBar'],
          ['food', 'whatsNew.breakfast'],
          ['drop', 'whatsNew.micro'],
        ])),
  ]);
  if (!items.length) return next(); // nothing visible is new yet (e.g. voice not deployed): ask again next version
  setKv('seenWhatsNew', WHATS_NEW);
  openSheet({
    kind: 'dialog',
    onClose: () => setTimeout(next, 250),
    render:
      () => html`<div class="center">${otter({ size: 110, pose: 'cheer' })}<h1 class="h2 mt8">${t('whatsNew.title', { v: WHATS_NEW })}</h1></div>
<div class="col gap10 mt12 whatsnew">${items.map(([i, k]) => html`<div class="row gap10"><span class="sq acc">${ic(i, 18, 2.3)}</span><span class="f1 b small">${t(k)}</span></div>`)}</div>
${had12 ? '' : html`<div class="card mt12"><p class="small b">${t('whatsNew.gender')}</p>${genderRow()}</div>`}
${
  push
    ? html`<p class="muted xs b mt12">${t('whatsNew.pushHow')}</p>
<div class="row gap10 mt12"><button class="btn sec f1" data-act="times">${t('whatsNew.turnOn')}</button><button class="btn f1" data-close>${t('whatsNew.ok')}</button></div>`
    : html`<button class="btn w100 mt16" data-close>${t('whatsNew.ok')}</button>`
}`,
    actions: {
      times: () => (emit('nav', { path: 'profile/reminders' }), false),
      gender: (el) => void setSettings({ gender: el.dataset.v }),
    },
  });
}

/** Register the service worker and offer updates. */
function startServiceWorker() {
  if (!('serviceWorker' in navigator) || location.protocol === 'file:') return;
  // Reload only when an *existing* controller is replaced (user accepted an update),
  // not when the very first worker claims the page.
  const hadController = !!navigator.serviceWorker.controller;
  let reloading = false;
  navigator.serviceWorker.addEventListener(
    'controllerchange',
    () => hadController && !reloading && ((reloading = true), location.reload()),
  );
  navigator.serviceWorker
    .register('./sw.js')
    .then((reg) => {
      if (!reg) return;
      let offered = false;
      const offer = (/** @type {ServiceWorker} */ w) => {
        if (offered) return;
        offered = true;
        const bar = document.createElement('div');
        bar.className = 'update-bar';
        bar.setAttribute('role', 'status');
        bar.innerHTML = String(
          html`<span>${t('update.ready')}</span><button class="btn sm">${t('update.reload')}</button>`,
        );
        bar.querySelector('button')?.addEventListener('click', () => w.postMessage({ type: 'SKIP_WAITING' }));
        document.body.append(bar);
      };
      /** Offer a worker once it has installed (1.3.4: also one already installing at load). */
      const watch = (/** @type {ServiceWorker | null} */ w) =>
        w?.addEventListener(
          'statechange',
          () => w.state === 'installed' && navigator.serviceWorker.controller && offer(w),
        );
      if (reg.waiting && navigator.serviceWorker.controller) offer(reg.waiting);
      watch(reg.installing);
      reg.addEventListener('updatefound', () => watch(reg.installing));
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
    })
    .catch((e) => console.warn('[sw] registration failed', e));
}

/** Reminders: schedule what the platform supports, and check while the app is open. */
async function startReminders() {
  const [r, daily] = await Promise.all([import('./features/profile/reminders.js'), import('./features/daily/api.js')]);
  const check = () => (r.checkDue(stats().workedOutToday), daily.checkDaily());
  r.scheduleReminders().catch(() => {});
  check();
  setInterval(check, 30_000);
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && check());
}

/** 1.4.0: a beta build says so on every screen (it has its own data, see core/channel.js). */
function betaMarker() {
  if (!IS_BETA) return;
  document.documentElement.classList.add('beta');
  const m = document.createElement('div');
  m.className = 'betamark';
  m.setAttribute('role', 'note');
  m.setAttribute('aria-label', 'Бета версия – отделни данни');
  m.textContent = 'БЕТА';
  document.body.append(m);
}

async function start() {
  betaMarker();
  const { persistent } = await load();
  await applySettings();
  watchTheme();
  seedPlans();
  startTrash();
  initSheets($id('layer'));
  bindActions($id('nav'), () => null);
  on('nav', (/** @type {{path?: string, replace?: boolean, back?: string}} */ p) => {
    closeAll();
    whenSettled(() => (p.path != null ? navigate(p.path, { replace: p.replace }) : back(p.back)));
  });
  on('settings:changed', async (/** @type {Record<string, any>} */ patch) => {
    if ('lang' in patch) await setLang(settings().lang);
    if ('gender' in patch) setGender(settings().gender);
    if ('theme' in patch) applyTheme(settings().theme);
    if ('lang' in patch || 'theme' in patch || 'gender' in patch) emit('ui:refresh');
  });
  // Any data change (an edit, Undo, a restore from the bin, a notification action…) re-renders
  // the page and the open sheets once, so no view shows stale data until a reload. Changes
  // made while that refresh renders are ignored, so a view writing during render cannot loop.
  let queued = false,
    painting = false;
  on('store:any', () => {
    if (queued || painting) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      painting = true;
      try {
        emit('ui:refresh');
      } finally {
        painting = false;
      }
    }, 0);
  });
  on('store:replaced', async () => {
    await applySettings();
    seedPlans();
    refresh(true);
  });
  // After "Reset all data": show the first-run welcome right away (after the nav to Home).
  on('app:reset', () =>
    setTimeout(() => whenSettled(() => !settings().onboarded && (setKv('seenWhatsNew', WHATS_NEW), onboarding())), 300),
  );
  addEventListener('pointerdown', unlockAudio, { once: true });
  startMotivation();
  startCelebrations();
  await startRouter($id('page'), $id('nav'));
  document.documentElement.classList.add('ready');
  if (!persistent) emit('toast', { key: 'common.noStorage' });
  if (new URLSearchParams(location.search).has('cheer')) (await import('./features/partner/api.js')).handleCheer();
  else if (!settings().onboarded) (setKv('seenWhatsNew', WHATS_NEW), onboarding());
  else whatsNew(dataNotice);
  startServiceWorker();
  startDaily();
  startReminders();
}

start();
