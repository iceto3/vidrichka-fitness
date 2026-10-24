/**
 * Home: greeting, otter with a contextual speech bubble, weekly streak, weekly goal ring,
 * today's workout card (one-tap Start), daily quests with XP/level, monthly challenge and
 * timely nudges (resume workout, Wrapped recap, backup, install).
 * @module features/home/views/home
 */
import { esc, html, raw } from '../../../ui/dom.js';
import { L, fmtDate, t, weekdayName } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { kv, setKv } from '../../../core/store.js';
import { emit } from '../../../core/bus.js';
import { addDays, dayKey, monthKey, startOfWeek } from '../../../core/dates.js';
import { ic } from '../../../ui/icons.js';
import { bar, ring } from '../../../ui/components.js';
import { messageFor, moodFor, otter } from '../../mascot/api.js';
import { level, quests, stats } from '../../motivation/api.js';
import { activeWorkout, nextPlan, planFor, planMinutes, planName, sessions, startWorkout } from '../../workouts/api.js';
import { backupDue, canInstall, installApp } from '../../profile/api.js';

/** Render `**bold**` segments of a translated string as highlighted spans. @param {string} s */
const hl = (s) => raw(esc(s).replace(/\*\*(.+?)\*\*/g, '<span class="warm-t">$1</span>'));

const greetKey = (/** @type {number} */ h) => (h < 5 ? 'home.evening' : h < 12 ? 'home.morning' : h < 18 ? 'home.afternoon' : 'home.evening');

/** Workout days of the current week as a Mon..Sun row. */
function weekDots() {
  const mon = startOfWeek(), today = dayKey();
  const done = new Set(sessions().map((s) => dayKey(s.endedAt)));
  return html`<div class="days" aria-hidden="true">${[0, 1, 2, 3, 4, 5, 6].map((i) => {
    const k = dayKey(addDays(mon, i));
    return html`<div><i class="${done.has(k) ? 'done' : k === today ? 'today' : ''}"></i>${weekdayName(i, 'narrow')}</div>`;
  })}</div>`;
}

/** Today's workout / rest-day card. */
function workoutCard() {
  const s = stats(), plan = planFor(), next = nextPlan();
  const p = s.workedOutToday || !plan ? next?.plan ?? plan : plan;
  if (!p) return html`<div class="wcard mt12"><div class="deco"></div><div class="deco2"></div><div class="rel"><div class="wtitle">${t('home.noPlans')}</div>
<button class="btn white mt14 w100" data-go="plan/new">${ic('plus', 18)}${t('workouts.newPlan')}</button></div></div>`;
  const label = s.workedOutToday ? t('home.doneToday') : plan ? t('home.todayWorkout') : t('home.restDay');
  return html`<div class="wcard mt12"><div class="deco"></div><div class="deco2"></div>
<div class="row between rel"><span class="chip glass caps">${label}</span>${ic('dumbbell', 26, 2.2, 'rgba(255,255,255,.8)')}</div>
<div class="wtitle rel">${planName(p)}</div><div class="wsub rel">${L(p.sub)}${!plan || s.workedOutToday ? html` · ${t('home.nextOn', { day: weekdayName(next ? (next.date.getDay() + 6) % 7 : 0, 'long') })}` : ''}</div>
<div class="row gap16 mt10 wmeta2 rel"><span class="row gap6">${ic('dumbbell', 17, 2.2)}${t('home.exercises', { n: p.items.length })}</span><span class="row gap6">${ic('clock', 17, 2.2)}~${planMinutes(p)} ${t('unit.min')}</span></div>
<button class="btn white mt14 w100 rel" data-act="start" data-id="${p.id}">${ic('play', 18)}${s.workedOutToday || !plan ? t('home.startAnyway') : t('home.start')}</button></div>`;
}

/** @returns {import('../../../core/registry.js').View} */
export default () => ({
  tab: 'home',
  render: () => {
    const s = stats(), set = settings(), lv = level(), now = new Date(), a = activeWorkout();
    const st = s.streak, plan = planFor();
    const msg = messageFor({ streak: st.weeks, weekCount: st.thisWeek, goal: st.goal, daysSinceWorkout: s.daysSinceWorkout, workedOutToday: s.workedOutToday, todayPlan: plan ? planName(plan) : undefined, hour: now.getHours(), totalWorkouts: s.totalWorkouts });
    const mood = moodFor({ daysSinceWorkout: s.daysSinceWorkout, workedOutToday: s.workedOutToday, prToday: s.prToday });
    const left = Math.max(0, st.goal - st.thisWeek);
    const prevMonth = monthKey(addDays(new Date(now.getFullYear(), now.getMonth(), 1), -1));
    const showRecap = now.getDate() <= 7 && sessions().some((x) => monthKey(new Date(x.endedAt)) === prevMonth) && kv('recapSeen', '') !== prevMonth;
    return html`<div class="content home">
<div class="row between"><div><div class="muted small b">${fmtDate(now, { weekday: 'long', day: 'numeric', month: 'long' })}</div>
<h1 class="h1 mt2">${t(greetKey(now.getHours()))}${set.userName ? `, ${set.userName}` : ''}</h1></div>
<button class="iconbtn" data-go="profile/reminders" aria-label="${t('profile.reminders')}">${ic('bell', 21)}${set.reminders.enabled ? '' : raw('<i class="nub" aria-hidden="true"></i>')}</button></div>
<div class="row gap8 mt8 otterrow"><div class="otter-wrap">${otter({ size: 112, pose: s.workedOutToday ? 'cheer' : 'wave', mood })}</div>
<div class="bubble" role="status">${hl(t(msg.key, msg.vars))}</div></div>
${a ? html`<button class="card resume row gap12" data-go="workout"><span class="live"><i></i></span><span class="f1 b">${t('home.resume', { plan: planName(a) })}</span>${ic('right', 18, 2.4)}</button>` : ''}
<div class="row gap12 stretch mt4">
 <div class="card f1 pad14" role="group" aria-label="${t('home.weeklyStreak')}"><div class="row gap8"><div class="sq warm">${ic('flame', 20, 2.2)}</div>
  <div><div class="xb big20">${t('home.weeks', { n: st.weeks })}</div><div class="muted xs b">${t('home.weeklyStreak')}${st.freezes ? html` · <span title="${t('home.freezeHint')}">❄️${st.freezes}</span>` : ''}</div></div></div>${weekDots()}</div>
 <div class="card f1 pad14 row gap10" role="group" aria-label="${t('home.weeklyGoal')}">${ring(66, 8, st.thisWeek / st.goal, { inner: html`<div class="xb big19">${st.thisWeek}<span class="muted fs12">/${st.goal}</span></div>` })}
  <div class="minw0"><div class="b fs135 lh-t">${t('home.weeklyGoal')}</div><div class="muted xs b mt6">${t('home.ofWorkouts', { n: st.thisWeek, goal: st.goal })}</div>
  <div class="chip ${left ? 'accent' : 'ok'} mt6 chip-sm">${left ? t('home.toGo', { n: left }) : t('home.goalMet')}</div></div></div>
</div>
${workoutCard()}
<section class="card mt12 quests" aria-label="${t('home.quests')}"><div class="row between qhead"><h2 class="h3 xb">${t('home.quests')}</h2>
<div class="row gap6"><div class="lvl sm" aria-label="${t('home.level', { n: lv.level })}">${lv.level}</div><div class="bar w96">${raw(`<i style="width:${lv.pct * 100}%;background:var(--gold)"></i>`)}</div><span class="xs b muted num">${lv.into}/${lv.need} XP</span></div></div>
${quests().map((q) => html`<button class="quest" data-go="${q.go ?? 'home'}"><span class="qbox${q.isDone ? ' done' : ''}">${q.isDone ? ic('check', 16, 3) : ''}</span>
<span class="f1 b${q.isDone ? ' struck' : ''}">${t(q.label, q.vars)}${q.vars.goal != null ? html` <span class="muted small">(${t('home.progressOf', q.vars)})</span>` : ''}</span><span class="xp">+${q.xp} XP</span></button>`)}</section>
<button class="card mt12 challenge" data-go="progress/lifts"><div class="row between"><span class="row gap8"><span class="sq gold">${ic('target', 18, 2.4)}</span><span class="b">${t('home.challenge', { month: fmtDate(now, { month: 'long' }) })}</span></span><span class="xs b muted num">${s.monthWorkouts}/${s.monthTarget}</span></div>
<div class="muted xs b mt6 left">${s.monthWorkouts >= s.monthTarget ? t('home.challengeDone') : t('home.challengeBody', { n: s.monthTarget, xp: 100 })}</div>${bar(s.monthWorkouts / s.monthTarget, 'var(--gold)', 'mt8')}</button>
${showRecap ? html`<button class="card mt12 row gap12 recapcard" data-act="recap" data-m="${prevMonth}"><span class="sq violet">${ic('gift', 20, 2.2)}</span><span class="f1 left"><span class="b block">${t('home.recapTitle', { month: fmtDate(new Date(prevMonth + '-15'), { month: 'long' }) })}</span><span class="muted xs b">${t('home.recapBody')}</span></span>${ic('right', 18, 2.2, 'var(--muted)')}</button>` : ''}
${backupDue() ? html`<button class="card mt12 row gap12" data-go="profile"><span class="sq acc">${ic('cloud', 20, 2.2)}</span><span class="f1 left"><span class="b block">${t('home.backupTitle')}</span><span class="muted xs b">${t('home.backupBody')}</span></span>${ic('right', 18, 2.2, 'var(--muted)')}</button>` : ''}
${canInstall() && !kv('installDismissed', false) ? html`<div class="card mt12 row gap12"><span class="sq acc">${ic('download', 20, 2.2)}</span><span class="f1"><span class="b block">${t('install.cardTitle')}</span><span class="muted xs b">${t('install.cardBody')}</span></span>
<button class="btn sm" data-act="install">${t('install.cta')}</button><button class="iconbtn flat sm" data-act="noInstall" aria-label="${t('common.close')}">${ic('close', 16)}</button></div>` : ''}
</div>`;
  },
  actions: {
    start: (el) => {
      startWorkout(el.dataset.id ?? '');
      emit('nav', { path: 'workout' });
      return false;
    },
    recap: (el) => {
      setKv('recapSeen', el.dataset.m);
      emit('nav', { path: `recap/${el.dataset.m}` });
      return false;
    },
    install: () => installApp(),
    noInstall: () => void setKv('installDismissed', true),
  },
});
