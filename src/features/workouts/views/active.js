/**
 * Active workout screen: per-set weight/reps steppers, one-tap Done (locks the set and
 * starts the rest timer), "last time" hints with progression nudges, elapsed clock,
 * rest bar (+15 s / Skip) with sound + vibration, and Finish.
 * @module features/workouts/views/active
 */
import { html, num, $ } from '../../../ui/dom.js';
import { fmtKg, fmtNum, t } from '../../../core/i18n.js';
import { settings } from '../../../core/settings.js';
import { clock } from '../../../core/dates.js';
import { emit } from '../../../core/bus.js';
import { ic } from '../../../ui/icons.js';
import { ring, stepper } from '../../../ui/components.js';
import { confirmDialog, toast } from '../../../ui/sheet.js';
import { beep, keepAwake, notify, releaseAwake, unlockAudio, vibrate } from '../../../ui/feedback.js';
import { exById, exName, muscleTags, repsLabel } from '../../library/api.js';
import { exThumb } from '../../library/thumb.js';
import { openTechnique } from '../../library/technique.js';
import { activeWorkout, isFree, planName, sessions } from '../api.js';
import { MAX_KG, activeSet, byKg, kgStep, lastSets, logsKg, suggest } from '../logic.js';
import * as S from '../session.js';

/** @typedef {import('../logic.js').WItem} WItem */

/** "Last time" hint row for an exercise. @param {WItem} it @param {any} ex */
function lastHint(it, ex) {
  const last = lastSets(sessions(), it.exId);
  if (!last.length) return '';
  const weighted = byKg(ex, last); // 1.6.0: optional added weight – by kilos once some was used
  const tip = suggest(last, it.target.reps, weighted, kgStep(ex, settings().weightStep));
  const txt = weighted ? `${fmtKg(last[0].w)} × ${last.map((s) => s.r).join(', ')}` : last.map((s) => s.r).join(', ');
  return html`<div class="row gap8 mt12 small lasttime"><span class="muted b">${t('workout.lastTime')}</span><span class="b num">${txt}</span>
${tip ? html`<span class="chip warm nudge">${tip.kind === 'weight' ? t('workout.tryKg', { n: fmtNum(tip.value, 2) }) : t('workout.tryReps', { n: tip.value })}</span>` : ''}</div>`;
}

/**
 * One exercise card. @param {WItem} it @param {number} i @param {[number, number]|null} act
 * @param {boolean} [free] 1.6.3 free workout: the exercise can be removed
 */
function exCard(it, i, act, free = false) {
  const ex = exById(it.exId),
    weighted = logsKg(ex); // 1.6.0: bodyweight exercises with an optional added weight show kg
  const cols = weighted ? '' : ' bw';
  return html`<section class="card ex mt12" aria-label="${exName(it.exId)}">
<div class="row between top-al"><div class="row gap12"><div class="exicon">${exThumb(it.exId)}</div>
<div><h2 class="h2">${exName(it.exId)}</h2><div class="row gap6 mt6 wrap">${ex ? muscleTags(ex, 2) : ''}</div></div></div>
<div class="row gap4"><button class="iconbtn flat" data-act="howTo" data-id="${it.exId}" aria-label="${t('workout.howTo')}">${ic('info', 20)}</button>${free ? html`<button class="iconbtn flat rmex" data-act="rmEx" data-i="${i}" aria-label="${t('workout.removeEx', { name: exName(it.exId) })}">${ic('trash', 19)}</button>` : ''}</div></div>
${lastHint(it, ex)}
<div class="colh${cols}" aria-hidden="true"><div>${t('workout.set')}</div>${weighted ? html`<div>${t('workout.weight')}</div>` : ''}<div>${repsLabel(it.exId)}</div><div></div></div>
${it.sets.map((s, j) => {
  const on = act?.[0] === i && act?.[1] === j;
  const lbl = t('workout.setN', { n: j + 1 });
  return html`<div class="set${cols}${s.done ? ' done' : ''}${on ? ' active' : ''}"><div class="slabel">${t('workout.set')}<br>${j + 1}</div>
${weighted ? stepper({ act: 'w', value: fmtNum(s.w, 2), unit: t('unit.kg'), data: { i, j }, label: `${lbl} ${t('workout.weight')}`, disabled: s.done }) : ''}
${stepper({ act: 'r', value: s.r, data: { i, j }, label: `${lbl} ${repsLabel(it.exId)}`, disabled: s.done })}
<button class="done-b${s.done ? ' ok' : on ? ' go' : ''}" data-act="done" data-i="${i}" data-j="${j}" aria-pressed="${String(s.done)}" aria-label="${s.done ? t('workout.undo', { n: j + 1 }) : t('workout.markDone', { n: j + 1 })}">${s.done ? ic('check', 20, 3) : t('workout.done')}</button></div>`;
})}
<div class="row center-j gap8 mt8"><button class="linkbtn" data-act="addSet" data-i="${i}">${ic('plus', 17, 2.6)}${t('workout.addSet')}</button>
${it.sets.some((s) => !s.done) && it.sets.length > 1 ? html`<button class="linkbtn muted" data-act="rmSet" data-i="${i}">${ic('minus', 17, 2.6)}${t('workout.removeSet')}</button>` : ''}</div>
</section>`;
}

/** Rest bar markup. @param {{endAt: number, total: number}} r */
function restBar(r) {
  const left = Math.max(0, Math.ceil((r.endAt - Date.now()) / 1000));
  return html`<div class="restbar" role="timer" aria-live="off" aria-label="${t('workout.rest')}"><div class="pb" id="rest-pb" style="width:${(left / r.total) * 100}%"></div>
${ring(46, 4, left / r.total, { color: '#2BB8BE', track: 'rgba(255,255,255,.15)', inner: ic('timer', 20, 2.2, '#fff') })}
<div class="f1"><div class="xs b caps op65">${t('workout.rest')}</div><div class="num restleft" id="rest-left">${clock(left)}</div></div>
<button class="rbtn" data-act="more">+15s</button><button class="rbtn go" data-act="skip">${t('workout.skip')}${ic('skip', 16, 2.2)}</button></div>`;
}

/** @returns {import('../../../core/registry.js').View} */
export default () => {
  /** @type {any} */
  let timer = 0;
  const step = (/** @type {number} */ i) => kgStep(exById(activeWorkout().items[i].exId), settings().weightStep);

  const restDone = () => {
    S.skipRest();
    const s = settings();
    if (s.restSound) beep();
    if (s.restVibrate) vibrate([200, 100, 200]);
    if (document.hidden) notify(t('workout.restOverTitle'), t('workout.restOverBody'), 'rest');
    emit('ui:refresh');
  };

  const tick = () => {
    const w = activeWorkout();
    if (!w) return;
    const el = $('#elapsed');
    if (el) el.textContent = clock(Math.floor((Date.now() - w.startedAt) / 1000));
    if (!w.rest) return;
    const left = Math.max(0, Math.ceil((w.rest.endAt - Date.now()) / 1000));
    const l = $('#rest-left'),
      pb = $('#rest-pb');
    if (l) l.textContent = clock(left);
    if (pb) pb.style.width = `${(left / w.rest.total) * 100}%`;
    if (left <= 0) restDone();
  };

  return {
    tab: 'workouts',
    render: () => {
      const w = activeWorkout();
      if (!w)
        return html`<div class="content center mt20"><p class="b">${t('workout.none')}</p><button class="btn mt16" data-go="workouts">${t('workouts.title')}</button></div>`;
      const act = activeSet(w.items, w.resumed?.at);
      const total = w.items.reduce((/** @type {number} */ a, /** @type {WItem} */ it) => a + it.sets.length, 0);
      const left = w.items.reduce(
        (/** @type {number} */ a, /** @type {WItem} */ it) => a + it.sets.filter((s) => !s.done).length,
        0,
      );
      const cur = act ? act[0] : w.items.length - 1,
        free = isFree(w); // 1.6.3
      return html`<div class="wtop"><button class="iconbtn" data-go="home" aria-label="${t('workout.minimize')}">${ic('down', 22)}</button>
<div class="center"><h1 class="h2">${planName(w)}</h1><div class="live num"><i></i><span id="elapsed">${clock(Math.floor((Date.now() - w.startedAt) / 1000))}</span></div></div>
<button class="finish" data-act="finish">${t('workout.finish')}</button></div>
<div class="prog" role="progressbar" aria-valuemin="0" aria-valuemax="${total}" aria-valuenow="${total - left}">${w.items.map(
        (/** @type {WItem} */ it) => {
          const d = it.sets.filter((s) => s.done).length;
          return html`<i class="${d === it.sets.length ? 'on' : d ? 'half' : ''}"></i>`;
        },
      )}</div>
${w.items.length ? html`<div class="row between wmeta"><span class="muted xs b caps">${t('workout.exerciseOf', { n: cur + 1, total: w.items.length })}</span><span class="muted xs b">${t('workout.setsLeft', { n: left })}</span></div>` : ''}
<div class="content wlist">${w.items.map((/** @type {WItem} */ it, /** @type {number} */ i) => exCard(it, i, act, free))}
${free && !w.items.length ? html`<div class="card mt12 center freeempty"><p class="b">${t('workout.freeEmpty')}</p><p class="muted small b mt4">${t('workout.freeEmptySub')}</p></div>` : ''}
${free ? html`<button class="btn sec mt12 w100 addex" data-act="addEx">${ic('plus', 18, 2.6)}${t('editor.addExercise')}</button>` : ''}
<button class="btn ok mt16 w100" data-act="finish">${ic('check', 20, 3)}${t('workout.finishWorkout')}</button></div>
${w.rest ? restBar(w.rest) : ''}`;
    },
    mount: () => {
      keepAwake();
      const w = activeWorkout();
      if (w?.rest && w.rest.endAt < Date.now()) (S.skipRest(), emit('ui:refresh'));
      timer = setInterval(tick, 250);
    },
    unmount: () => (clearInterval(timer), releaseAwake()),
    actions: {
      howTo: (el) => (openTechnique(el.dataset.id ?? ''), false), // 1.4.0: a sheet, the set stays
      // 1.6.3 free workout: add from the whole library (search + filters), remove an exercise
      addEx: async () => {
        const { openPicker } = await import('../../library/views/picker.js');
        openPicker((exId) => {
          S.addExercise(exId);
          emit('ui:refresh');
          // scroll to the new exercise
          setTimeout(
            () => document.querySelector('.wlist section.ex:last-of-type')?.scrollIntoView({ block: 'center' }),
            60,
          );
        });
        return false;
      },
      rmEx: async (el) => {
        const i = num(el, 'i'),
          it = activeWorkout()?.items[i];
        if (!it) return;
        if (
          it.sets.some((/** @type {any} */ s) => s.done) &&
          !(await confirmDialog({
            title: t('workout.removeExTitle', { name: exName(it.exId) }),
            body: t('workout.removeExBody'),
            ok: t('common.remove'),
            danger: true,
          }))
        )
          return;
        S.removeExercise(i);
        emit('ui:refresh');
        return false;
      },
      w: (el, ev) => {
        const i = num(el, 'i'),
          j = num(el, 'j'),
          cur = activeWorkout().items[i].sets[j].w;
        const v =
          ev.type === 'change'
            ? parseFloat(/** @type {HTMLInputElement} */ (el).value.replace(/\s/g, '').replace(',', '.')) || 0
            : cur + num(el, 'd') * step(i);
        if (v > MAX_KG) toast(t('workout.maxKg', { n: MAX_KG }));
        S.setWeight(i, j, v);
      },
      r: (el, ev) => {
        const i = num(el, 'i'),
          j = num(el, 'j'),
          cur = activeWorkout().items[i].sets[j].r;
        S.setReps(
          i,
          j,
          ev.type === 'change' ? parseInt(/** @type {HTMLInputElement} */ (el).value, 10) || 0 : cur + num(el, 'd'),
        );
      },
      done: (el) => {
        unlockAudio();
        const rest = S.toggleDone(num(el, 'i'), num(el, 'j'));
        if (rest) vibrate(30);
      },
      addSet: (el) => void S.addSet(num(el, 'i')),
      rmSet: (el) => void S.removeSet(num(el, 'i')),
      more: () => void S.addRest(15),
      skip: () => void S.skipRest(),
      finish: async () => {
        const w = activeWorkout();
        const done = w.items.reduce(
          (/** @type {number} */ a, /** @type {WItem} */ it) => a + it.sets.filter((s) => s.done).length,
          0,
        );
        const left = w.items.reduce(
          (/** @type {number} */ a, /** @type {WItem} */ it) => a + it.sets.filter((s) => !s.done).length,
          0,
        );
        if (!done) {
          if (
            await confirmDialog({
              title: t('workout.discardTitle'),
              body: t('workout.discardBody'),
              ok: t('workout.discard'),
              danger: true,
            })
          ) {
            S.discard();
            emit('nav', { path: 'workouts', replace: true });
          }
          return;
        }
        if (
          left &&
          !(await confirmDialog({
            title: t('workout.finishTitle'),
            body: t(isFree(w) ? 'workout.finishBodyFree' : 'workout.finishBody', { n: left }), // 1.6.3
            ok: t('workout.finish'),
          }))
        )
          return;
        const s = S.finish();
        if (!s) {
          emit('nav', { path: 'workouts', replace: true });
          return;
        }
        emit('nav', { path: `summary/${s.id}`, replace: true });
      },
    },
  };
};
