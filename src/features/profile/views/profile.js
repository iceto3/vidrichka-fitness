/**
 * Profile & settings: names, language, theme, weekly goal, nutrition goals, reminders,
 * rest-timer sound/vibration, weight step, outfit, partner mode, install, backup/restore
 * and reset.
 * @module features/profile/views/profile
 */
import { html, raw } from '../../../ui/dom.js';
import { LANGUAGES } from '../../../data/i18n/index.js';
import { fmtDate, fmtHM, fmtNum, getLang, t, weekdayName } from '../../../core/i18n.js';
import { dailySettings, settings, setSettings } from '../../../core/settings.js';
import { kv } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { seg, stepper, toggle } from '../../../ui/components.js';
import { closeSheet, confirmDialog, openSheet } from '../../../ui/sheet.js';
import { KEEP_DAYS, trashList } from '../../../core/trash.js';
import { canVibrate } from '../../../ui/feedback.js';
import { GEAR_LEVELS, OUTFITS, otter, otterName } from '../../mascot/api.js';
import { badges, level, recordGoal, stats } from '../../motivation/api.js';
import { canInstall, installApp, isIOS } from '../install.js';
import { dailyOnCount } from '../../daily/api.js';
import { APP_VERSION, buildId } from '../../../core/version.js';
import { IS_BETA } from '../../../core/channel.js';
import { GOAL_MAX, GOAL_MIN, GOAL_STEP } from '../../steps/logic.js';

/** The Reminders row's summary: workout days (or off) plus the daily-rhythm reminders that are on. @param {{enabled: boolean, days: number[]}} r */
function remindersSummary(r) {
  const n = dailyOnCount(dailySettings());
  if (!r.enabled && !n) return t('common.off');
  const parts = [r.enabled ? r.days.map((d) => weekdayName(d)).join(' · ') : t('profile.workoutRemOff')];
  if (n) parts.push(t('profile.dailyOn', { n }));
  return parts.join(' · ');
}

/** Settings row. @param {string} icon @param {string} cls @param {any} title @param {any} sub @param {any} right @param {string} [attrs] */
const srow = (icon, cls, title, sub, right, attrs = '') =>
  html`<div class="srow" ${raw(attrs)}><span class="sic ${cls}">${ic(icon, 19, 2.2)}</span><div class="t"><div class="st">${title}</div>${sub ? html`<div class="muted xs b">${sub}</div>` : ''}</div>${right}</div>`;

/** Generic number-settings sheet. @param {string} title @param {[string, string, number, number, number][]} fields key,label,step,min,max */
function numbersSheet(title, fields) {
  openSheet({
    render: () =>
      html`<h2 class="h2">${title}</h2>${fields.map(
        ([k, lbl, st]) => html`<div class="row between mt12"><span class="b">${lbl}</span>
${stepper({ act: 'n', value: /** @type {any} */ (settings())[k], data: { k, st }, label: lbl })}</div>`,
      )}<button class="btn w100 mt16" data-close>${t('common.done')}</button>`,
    actions: {
      n: (el, ev) => {
        const [k, , st, min, max] = /** @type {[string, string, number, number, number]} */ (
          fields.find((f) => f[0] === el.dataset.k)
        );
        const cur = /** @type {any} */ (settings())[k];
        const v =
          ev.type === 'change'
            ? Number(/** @type {HTMLInputElement} */ (el).value) || cur
            : cur + Number(el.dataset.d) * st;
        setSettings({ [k]: Math.min(max, Math.max(min, v)) });
      },
    },
  });
}

/** Names sheet. */
function namesSheet() {
  const s = settings();
  openSheet({
    render: () => html`<h2 class="h2">${t('profile.names')}</h2>
<label class="field mt12"><span>${t('profile.yourName')}</span><input class="input" id="uname" data-change="set" data-k="userName" value="${s.userName}" autocomplete="given-name"></label>
<label class="field mt10"><span>${t('profile.otterName')}</span><input class="input" id="oname" data-change="set" data-k="otterName" value="${s.otterName}" placeholder="${t('mascot.defaultName')}"></label>
<label class="field mt10"><span>${t('profile.partnerName')}</span><input class="input" id="pname2" data-change="set" data-k="partnerName" value="${s.partnerName}"></label>
<button class="btn w100 mt16" data-close>${t('common.done')}</button>`,
    actions: {
      set: (el) => void setSettings({ [el.dataset.k ?? '']: /** @type {HTMLInputElement} */ (el).value.trim() }),
    },
  });
}

/** Outfit picker (gear unlocked by level). */
function outfitSheet() {
  openSheet({
    render: () => {
      const lv = level().level,
        cur = settings().outfit;
      return html`<h2 class="h2">${t('profile.outfit')}</h2><p class="muted small b mt4">${t('profile.outfitHint')}</p>
<div class="outfits mt12">${OUTFITS.map((o) => {
        const locked = lv < (o.level ?? 1);
        return html`<button class="outfit${cur === o.id ? ' on' : ''}" data-act="pick" data-id="${o.id}" ${locked ? raw('disabled') : ''} aria-pressed="${String(cur === o.id)}">
<span class="oav">${otter({ size: 76, pose: 'wave', level: o.id === 'auto' ? lv : 99, outfit: o.id })}</span><span class="b small">${t(`outfit.${o.id}`)}</span>${locked ? html`<span class="xs b muted">${t('profile.unlockAt', { n: o.level })}</span>` : ''}</button>`;
      })}</div>
<p class="muted xs b mt12">${t('profile.gearLevels', {
        list: Object.entries(GEAR_LEVELS)
          .map(([g, l]) => `${t(`gear.${g}`)} ${l}`)
          .join(' · '),
      })}</p>`;
    },
    actions: { pick: (el) => (setSettings({ outfit: el.dataset.id }), closeSheet(), emit('ui:refresh'), false) },
  });
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'profile',
  render: () => {
    const s = settings(),
      lv = level(),
      st = stats(),
      r = s.reminders,
      since = /** @type {{createdAt?: number}} */ (kv('meta', {})).createdAt ?? Date.now();
    const langs = Object.entries(LANGUAGES).map(([v, l]) => ({
      value: v,
      label: v.toUpperCase(),
      name: /** @type {any} */ (l).name,
    }));
    return html`<div class="content profile">
<div class="row between"><h1 class="h1">${t('profile.title')}</h1>${seg(langs, getLang(), 'lang', 'lang')}</div>
<div class="card mt12 pcard"><div class="row gap14">
<button class="avatar" data-act="names" aria-label="${t('profile.names')}">${otter({ size: 104, pose: 'dumbbell' })}</button>
<div class="f1"><button class="h2 plain" data-act="names">${s.userName || t('profile.addName')} ${ic('edit', 15, 2.2, 'var(--muted)')}</button>
<div class="muted small b">${t('profile.with', { otter: otterName(), date: fmtDate(since, { month: 'short', year: 'numeric' }) })}</div>
<div class="row gap8 mt8"><div class="lvl xs30">${lv.level}</div><div class="f1"><div class="row between xs b"><span>${t('home.level', { n: lv.level })}</span><span class="muted num">${fmtNum(lv.into)}/${fmtNum(lv.need)} XP</span></div>
<div class="bar mt6 h7">${raw(`<i style="width:${lv.pct * 100}%;background:var(--gold)"></i>`)}</div></div></div></div></div>
<button class="row gap8 mt12 outfitrow" data-act="outfit">${ic('shirt', 18, 2.2, 'var(--accent-d)')}<span class="small b f1 left">${t('profile.outfit')}: <span class="acc">${t(`outfit.${s.outfit}`)}</span></span><span class="link">${t('common.change')}</span></button>
<div class="row mt12 center pstats"><div class="f1"><div class="xb num fs18">${st.totalWorkouts}</div><div class="muted xs b">${t('profile.workouts')}</div></div><i class="vsep"></i>
<div class="f1"><div class="xb num fs18 row gap4 center-j"><span class="warm-t">${ic('flame', 17, 2.4)}</span>${st.streak.weeks}</div><div class="muted xs b">${t('profile.weekStreak')}</div></div><i class="vsep"></i>
<div class="f1"><div class="xb num fs18">${badges().filter((b) => b.at).length}</div><div class="muted xs b">${t('profile.badges')}</div></div></div></div>
<div class="section-title"><h2 class="h3">${t('profile.settings')}</h2></div>
<div class="card p0">
${srow('globe', 'teal', t('profile.language'), langs.map((l) => l.name).join(' / '), seg(langs, getLang(), 'lang', 'mini'))}
${srow(
  'user',
  'violet',
  t('profile.gender'),
  t('profile.genderSub'),
  seg(
    ['f', 'm'].map((v) => ({ value: v, label: t(v === 'f' ? 'profile.genderF' : 'profile.genderM') })),
    s.gender === 'm' ? 'm' : 'f',
    'gender',
    'mini',
  ),
)}
${srow(
  'moon',
  'violet',
  t('profile.theme'),
  '',
  seg(
    ['light', 'dark', 'auto'].map((v) => ({ value: v, label: t(`theme.${v}`) })),
    s.theme,
    'theme',
    'mini',
  ),
)}
<button class="srow" data-go="profile/reminders"><span class="sic orange">${ic('bell', 19, 2.2)}</span><span class="t left"><span class="st block">${t('profile.reminders')}</span><span class="muted xs b">${remindersSummary(r)}</span></span>${r.enabled ? html`<span class="b num acc">${fmtHM(r.time)}</span>` : ''}${ic('right', 17, 2.2, 'var(--muted)')}</button>
${srow('target', 'teal', t('profile.weeklyGoal'), t('profile.weeklyGoalSub'), stepper({ act: 'goal', value: s.weeklyGoal, label: t('profile.weeklyGoal') }))}
${srow('steps', 'orange', t('steps.goal'), t('steps.goalSub'), stepper({ act: 'sgoal', value: s.stepGoal, label: t('steps.goal') }), 'id="stepgoal"')}
<button class="srow" data-act="nutrition"><span class="sic green">${ic('food', 19, 2.2)}</span><span class="t left"><span class="st block">${t('profile.nutrition')}</span><span class="muted xs b">${fmtNum(s.kcalGoal)} ${t('unit.kcal')} · ${t('food.p')} ${s.proteinGoal} · ${t('food.c')} ${s.carbsGoal} · ${t('food.f')} ${s.fatGoal} · ${t('profile.waterN', { n: s.waterGoal })}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
${srow('timer', 'blue', t('profile.restAlert'), canVibrate() ? t('profile.restAlertSub') : t('profile.noVibrate'), html`<div class="row gap8"><span class="muted">${ic('volume', 17, 2.2)}</span>${toggle(s.restSound, 'tg', t('profile.sound'), { k: 'restSound' })}${canVibrate() ? html`<span class="muted">${ic('vibrate', 17, 2.2)}</span>${toggle(s.restVibrate, 'tg', t('profile.vibration'), { k: 'restVibrate' })}` : ''}</div>`)}
${srow('gift', 'gold', t('profile.celebrationSounds'), t('profile.celebrationSoundsSub'), toggle(s.celebrationSounds, 'tg', t('profile.celebrationSounds'), { k: 'celebrationSounds' }))}
${srow(
  'dumbbell',
  'teal',
  t('profile.weightStep'),
  t('profile.weightStepSub'),
  seg(
    [1, 2.5, 5].map((v) => ({ value: String(v), label: fmtNum(v, 1) })), // 1.4.0: „2,5“ in Bulgarian
    String(s.weightStep),
    'wstep',
    'mini',
  ),
)}
<button class="srow" data-go="trash"><span class="sic gray">${ic('trash', 19, 2.2)}</span><span class="t left"><span class="st block">${t('trash.title')}</span><span class="muted xs b">${trashList().length ? t('trash.count', { n: trashList().length }) : t('trash.sub', { n: KEEP_DAYS })}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
${srow(
  'cloud',
  'green',
  t('profile.backup'),
  s.lastBackup
    ? t('profile.lastBackup', { date: fmtDate(s.lastBackup, { day: 'numeric', month: 'short' }) })
    : t('profile.neverBackup'),
  html`<div class="row gap8"><button class="sbtn" data-act="export">${ic('upload', 15, 2.4)}${t('profile.export')}</button><label class="sbtn" tabindex="0">${ic('download', 15, 2.4)}${t('profile.import')}<input type="file" accept="application/json,.json" data-change="import" class="sr-only"></label></div>`,
)}
${srow('chart', 'blue', t('profile.shareFoods'), t('profile.shareFoodsSub'), toggle(s.shareFoods, 'tg', t('profile.shareFoods'), { k: 'shareFoods' }), 'id="sharefoods"')}
<button class="srow" data-act="partner"><span class="sic gold">${ic('users', 19, 2.2)}</span><span class="t left"><span class="st block">${t('profile.partner')}</span><span class="muted xs b">${s.partnerName ? t('profile.partnerWith', { name: s.partnerName }) : t('profile.partnerSub')}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
<button class="srow" data-act="feedback" id="feedbackrow"><span class="sic violet">${ic('message', 19, 2.2)}</span><span class="t left"><span class="st block">${t('feedback.title')}</span><span class="muted xs b">${t('feedback.rowSub')}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
<button class="srow" data-go="whatsnew" id="whatsnewrow"><span class="sic teal">${ic('star', 19, 2.2)}</span><span class="t left"><span class="st block">${t('whatsNew.page')}</span><span class="muted xs b">${t('whatsNew.rowSub', { v: APP_VERSION })}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>
<a class="srow" href="repair" id="repairrow"><span class="sic gray">${ic('repair', 19, 2.2)}</span><span class="t left"><span class="st block">${t('profile.repair')}</span><span class="muted xs b">${t('profile.repairSub')}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</a>
${canInstall() ? html`<button class="srow" data-act="install"><span class="sic teal">${ic('download', 19, 2.2)}</span><span class="t left"><span class="st block">${t('install.cta')}</span><span class="muted xs b">${isIOS() ? t('install.iosShort') : t('install.cardBody')}</span></span>${ic('right', 17, 2.2, 'var(--muted)')}</button>` : ''}
</div>
<button class="btn sec danger-t w100 mt16" data-act="reset">${ic('trash', 18)}${t('profile.reset')}</button>
<button class="linkbtn xs center w100 mt12 pfooter" data-go="whatsnew">Vidrichka Fitness v${APP_VERSION}${IS_BETA ? ' · БЕТА' : ''} · ${t('profile.local')}<span class="block" id="pbuild">${t('whatsNew.build', { id: buildId() })}</span></button>
<div class="pfspace" aria-hidden="true"></div>
</div>`;
  },
  actions: {
    lang: (el) => void setSettings({ lang: el.dataset.v }),
    gender: (el) => void setSettings({ gender: el.dataset.v === 'm' ? 'm' : 'f' }),
    theme: (el) => void setSettings({ theme: /** @type {any} */ (el.dataset.v) }),
    goal: (el, ev) => {
      const cur = settings().weeklyGoal;
      const v = Math.min(
        7,
        Math.max(
          1,
          ev.type === 'change' ? Number(/** @type {HTMLInputElement} */ (el).value) || cur : cur + Number(el.dataset.d),
        ),
      );
      if (v !== cur) (recordGoal(v), setSettings({ weeklyGoal: v }));
    },
    tg: (el) => {
      const k = /** @type {'restSound'|'restVibrate'|'celebrationSounds'|'shareFoods'} */ (el.dataset.k);
      setSettings({ [k]: !settings()[k] });
    },
    sgoal: (el, ev) => {
      const cur = settings().stepGoal;
      const typed = ev.type === 'change' ? Number(/** @type {HTMLInputElement} */ (el).value.replace(/\s/g, '')) : NaN;
      const next =
        ev.type === 'change'
          ? typed > 0
            ? Math.round(typed / GOAL_STEP) * GOAL_STEP
            : cur
          : cur + Number(el.dataset.d) * GOAL_STEP;
      const v = Math.min(GOAL_MAX, Math.max(GOAL_MIN, next));
      if (v !== cur) setSettings({ stepGoal: v });
      else if (ev.type === 'change') /** @type {HTMLInputElement} */ (el).value = String(cur);
    },
    feedback: async () => ((await import('../../improve/api.js')).openFeedback(), false),
    wstep: (el) => void setSettings({ weightStep: Number(el.dataset.v) }),
    names: () => (namesSheet(), false),
    outfit: () => (outfitSheet(), false),
    nutrition: () => (
      numbersSheet(t('profile.nutrition'), [
        ['kcalGoal', 'kcal', 50, 800, 6000],
        ['proteinGoal', `${t('food.protein')} (g)`, 5, 0, 400],
        ['carbsGoal', `${t('food.carbs')} (g)`, 5, 0, 800],
        ['fatGoal', `${t('food.fat')} (g)`, 5, 0, 300],
        ['waterGoal', t('profile.waterGoal'), 1, 1, 20],
      ]),
      false
    ),
    partner: async () => ((await import('../../partner/api.js')).openPartner(), false),
    install: () => installApp(),
    export: async () => {
      const { exportBackup } = await import('../backup.js');
      const r = await exportBackup();
      if (r === 'downloaded') emit('toast', { key: 'profile.exported' });
    },
    import: async (el) => {
      const input = /** @type {HTMLInputElement} */ (el),
        file = input.files?.[0];
      input.value = '';
      if (!file) return false;
      const { readBackup, restore } = await import('../backup.js');
      const r = await readBackup(file);
      if (!r.ok) return (emit('toast', { key: `backup.${/** @type {any} */ (r).error}` }), false);
      const ok = await confirmDialog({
        title: t('backup.confirmTitle'),
        body: t('backup.confirmBody', {
          date: r.snap.exportedAt
            ? fmtDate(r.snap.exportedAt, { day: 'numeric', month: 'short', year: 'numeric' })
            : '?',
          w: r.counts.sessions ?? 0,
          f: r.counts.food ?? 0,
          p: r.counts.photos ?? 0,
        }),
        ok: t('backup.replace'),
        danger: true,
      });
      if (!ok) return false;
      await restore(r.snap);
      emit('toast', { key: 'backup.restored' });
    },
    reset: async () => {
      if (
        !(await confirmDialog({
          title: t('profile.resetTitle'),
          body: t('profile.resetBody'),
          ok: t('profile.resetOk'),
          danger: true,
        }))
      )
        return false;
      const { replaceAll } = await import('../../../core/store.js');
      const { APP_ID, DATA_VERSION } = await import('../../../core/migrations.js');
      await replaceAll({ app: APP_ID, version: DATA_VERSION, stores: {} });
      closeSheet();
      emit('toast', { key: 'profile.resetDone' });
      emit('nav', { path: 'home', replace: true });
      emit('app:reset'); // 1.2.1: the welcome shows at once, not only after a reload
    },
  },
  mount: (el) => {
    // 1.4.0: #/profile?sharefoods (from the Home data notice) jumps to the sharing switch.
    if (!/[?&]sharefoods/.test(location.hash)) return;
    const row = el.querySelector('#sharefoods');
    row?.scrollIntoView({ block: 'center' });
    row?.classList.add('flash');
  },
});
