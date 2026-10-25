/**
 * In-app reminder prompts (the app is on screen when a reminder is due): a small dialog
 * with the one-tap answer. Prompts wait while another sheet, a celebration, a workout in
 * progress or a workout summary is on screen, and are shown one at a time. The morning
 * prompt is dropped once a workout was done today or outside the morning (04:00–12:00).
 * @module features/daily/prompt
 */
import { html } from '../../ui/dom.js';
import { closeSheet, openSheet, sheetsOpen } from '../../ui/sheet.js';
import { emit } from '../../core/bus.js';
import { currentPath } from '../../core/router.js';
import { dayKey } from '../../core/dates.js';
import { t } from '../../core/i18n.js';
import { ic } from '../../ui/icons.js';
import { celebrating } from '../celebrations/api.js';
import { setWater, water } from '../food/api.js';
import { activeWorkout, sessions } from '../workouts/api.js';
import { BREAKFAST_LOGGER, day, proteinYes } from './api.js';
import { slotText } from './notify.js';
import { morningPromptOk } from './logic.js';

/** @type {import('./logic.js').Slot[]} */
const waiting = [];
let timer = 0;

/** Never over a workout (in progress or just finished), a celebration or another sheet. */
export const busy = () =>
  sheetsOpen() > 0 ||
  celebrating() ||
  !!activeWorkout() ||
  currentPath() === 'workout' ||
  currentPath().startsWith('summary/');

/** The morning prompt only makes sense in the morning, and not after a workout today. @param {number} [now] */
export const morningOver = (now = Date.now()) =>
  !morningPromptOk(
    new Date(now).getHours(),
    sessions().some((x) => dayKey(x.endedAt) === dayKey(now)),
  );

/** A waiting prompt that was answered meanwhile (or expired, or its page is open) is dropped. */
const stale = (/** @type {import('./logic.js').Slot} */ s) => {
  const rec = /** @type {Record<string, unknown>} */ (day(s.day));
  return (
    Date.now() > s.until ||
    !!s.skipIf?.some((f) => rec[f]) ||
    currentPath() === s.route.split('?')[0] ||
    (s.group === 'morning' && morningOver())
  );
};

/** Queue a prompt for a due reminder. @param {import('./logic.js').Slot} s */
export function prompt(s) {
  const i = waiting.findIndex((w) => w.group === s.group);
  if (i >= 0) waiting.splice(i, 1); // newest of a group wins
  waiting.push(s);
  pump();
}

function pump() {
  clearTimeout(timer);
  if (!waiting.length) return;
  if (busy()) return void (timer = window.setTimeout(pump, 2000));
  const s = /** @type {import('./logic.js').Slot} */ (waiting.shift());
  if (stale(s)) return pump();
  const x = slotText(s);
  const primary =
    s.group === 'protein'
      ? { label: t('notif.protein.yes'), run: () => (proteinYes(), emit('nav', { path: BREAKFAST_LOGGER })) }
      : s.group === 'water'
        ? { label: t('notif.water.add'), run: () => setWater(dayKey(), water(dayKey()) + 1) }
        : { label: t(`prompt.${s.group}`), run: () => emit('nav', { path: s.route }) };
  openSheet({
    kind: 'dialog',
    render:
      () => html`<div class="center dprompt"><div class="sq acc mauto">${ic(s.group === 'bed' ? 'moon' : s.group === 'water' ? 'drop' : s.group === 'morning' ? 'sun' : 'bell', 22, 2.3)}</div>
<h2 class="h2 mt8">${x.title}</h2><p class="muted b small mt6">${x.body}</p>
<div class="row gap10 mt16"><button class="btn sec f1" data-close>${t('prompt.later')}</button><button class="btn f1" data-act="go">${primary.label}</button></div>
${s.group === 'water' ? html`<button class="linkbtn w100 mt8" data-act="open">${t('prompt.openWater')}</button>` : ''}</div>`,
    actions: {
      go: () => (closeSheet(), primary.run(), false),
      open: () => (emit('nav', { path: 'food?water' }), false),
    },
    onClose: () => setTimeout(pump, 400),
  });
}
